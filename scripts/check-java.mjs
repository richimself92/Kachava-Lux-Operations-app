#!/usr/bin/env node
/**
 * Pre-check for `npm run test:rules` and `npm run test:functions`.
 *
 * The Firestore emulator runs the `java` found on PATH. On an OpenJ9 VM (e.g. IBM Semeru) it
 * crashes at startup ("OpenJ9 doesn't support the API" in firestore-debug.log), and the tests
 * then fail with an unhelpful `{"error":{"code":500,"status":"UNKNOWN"}}`. This script stops
 * early with a clear message and the commands to switch to a HotSpot JDK for the current terminal.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Classifies `java -version` output.
 * @param {string | null} output combined stdout/stderr, or null when java could not be run
 * @returns {'ok' | 'openj9' | 'missing' | 'too-old'}
 */
export function classifyJava(output) {
  if (output == null || !/version/i.test(output)) return 'missing';
  if (/openj9/i.test(output)) return 'openj9';
  // The Firebase emulators need Java 11+; "1.8.0_x" style versions are Java 8 or older.
  const m = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (m && (m[1] === '1' ? Number(m[2]) : Number(m[1])) < 11) return 'too-old';
  return 'ok';
}

const HELP = `
  The Firebase emulators need a HotSpot-based JDK 11+ (e.g. Eclipse Temurin 21) on PATH.
  Switch for this terminal only, then run the tests again:

    Git Bash:    export JAVA_HOME="$HOME/.jdks/jdk-21.0.13+9"; export PATH="$JAVA_HOME/bin:$PATH"
    PowerShell:  $env:JAVA_HOME = "$env:USERPROFILE\\.jdks\\jdk-21.0.13+9"; $env:PATH = "$env:JAVA_HOME\\bin;$env:PATH"

  (Adjust the path to where your JDK is installed. \`java -version\` must not say OpenJ9.)
`;

const MESSAGES = {
  openj9: 'The `java` on PATH is an OpenJ9 VM (e.g. IBM Semeru): the Firestore emulator crashes on it.',
  missing: 'No `java` found on PATH.',
  'too-old': 'The `java` on PATH is older than Java 11.',
};

function main() {
  const res = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const output = res.error ? null : `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const verdict = classifyJava(output);
  if (verdict === 'ok') return;
  console.error(`\n✖ ${MESSAGES[verdict]}`);
  if (output) console.error(`\n  java -version:\n    ${output.trim().split(/\r?\n/).join('\n    ')}`);
  console.error(HELP);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
