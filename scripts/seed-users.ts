/**
 * Upserts the approved-users allowlist (`users/{emailLower}`) from a roster JSON file.
 *
 * Usage:
 *   npm run seed:users -- <roster.json> --project <projectId> [--dry-run]
 *
 * Credentials: Application Default Credentials (`gcloud auth application-default login`).
 * Emulator:    set FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 and the Admin SDK writes there instead.
 *
 * Existing entries keep `createdAt`, `uid`, and `lastSignInAt`; name, role, title and
 * active are overwritten from the roster. Users missing from the roster are left untouched
 * (deactivate them in the app).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isCompanyEmail, ROLES, type Role } from '../shared/domain';

interface RosterEntry {
  email: string;
  displayName: string;
  role: Role;
  title: string;
  active?: boolean;
}

function parseArgs(argv: string[]) {
  let file: string | undefined;
  let project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') project = argv[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (!a.startsWith('--')) file = a;
    else throw new Error(`Unknown flag: ${a}`);
  }
  if (!file) throw new Error('Missing roster JSON path.');
  if (!project) throw new Error('Missing --project (or GCLOUD_PROJECT).');
  return { file, project, dryRun };
}

export function validateRoster(raw: unknown): RosterEntry[] {
  if (!Array.isArray(raw)) throw new Error('Roster must be a JSON array.');
  const seen = new Set<string>();
  return raw.map((r, i) => {
    const where = `entry #${i + 1}`;
    if (typeof r !== 'object' || r === null) throw new Error(`${where}: not an object`);
    const e = r as Record<string, unknown>;
    const email = String(e.email ?? '').trim().toLowerCase();
    if (!isCompanyEmail(email)) throw new Error(`${where}: "${email}" is not an @kachavalux.com email`);
    if (seen.has(email)) throw new Error(`${where}: duplicate email ${email}`);
    seen.add(email);
    const displayName = String(e.displayName ?? '').trim();
    if (!displayName) throw new Error(`${where}: displayName is required`);
    if (!(ROLES as readonly string[]).includes(String(e.role))) throw new Error(`${where}: invalid role "${e.role}"`);
    const title = String(e.title ?? '').trim();
    if (e.active !== undefined && typeof e.active !== 'boolean') throw new Error(`${where}: active must be boolean`);
    return { email, displayName, role: e.role as Role, title, active: e.active as boolean | undefined };
  });
}

async function main() {
  const { file, project, dryRun } = parseArgs(process.argv.slice(2));
  const roster = validateRoster(JSON.parse(readFileSync(resolve(file), 'utf8')));
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : 'PRODUCTION';
  console.log(`Seeding ${roster.length} users into project "${project}" (${target})${dryRun ? ' [dry run]' : ''}`);

  if (dryRun) {
    for (const u of roster) console.log(`  ${u.email.padEnd(32)} ${u.role.padEnd(10)} ${u.displayName}`);
    return;
  }

  const app = initializeApp({
    projectId: project,
    ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
  });
  const db = getFirestore(app);

  let created = 0;
  let updated = 0;
  for (const u of roster) {
    const ref = db.collection('users').doc(u.email);
    const isNew = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const fields = {
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        title: u.title,
        active: u.active ?? true,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (snap.exists) {
        tx.set(ref, fields, { merge: true });
        return false;
      }
      tx.set(ref, { ...fields, createdAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (isNew) created++;
    else updated++;
    console.log(`  ${isNew ? 'created' : 'updated'} ${u.email} (${u.role})`);
  }
  console.log(`Done: ${created} created, ${updated} updated.`);
}

// Run only when executed directly (the validator is imported by tests).
if (process.argv[1] && /seed-users\.[cm]?[jt]s$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
