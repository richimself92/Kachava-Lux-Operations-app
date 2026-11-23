import { describe, expect, it } from 'vitest';
import { classifyJava } from '../../scripts/check-java.mjs';

const SEMERU = `openjdk version "21.0.3" 2024-04-16 LTS
IBM Semeru Runtime Open Edition 21.0.3.0 (build 21.0.3+9-LTS)
Eclipse OpenJ9 VM 21.0.3.0 (build openj9-0.44.0, JRE 21 Windows 11 amd64-64-Bit Compressed References 20240416_179 (JIT enabled, AOT enabled)`;

const TEMURIN = `openjdk version "21.0.13" 2026-10-20 LTS
OpenJDK Runtime Environment Temurin-21.0.13+9 (build 21.0.13+9-LTS)
OpenJDK 64-Bit Server VM Temurin-21.0.13+9 (build 21.0.13+9-LTS, mixed mode, sharing)`;

const JAVA8 = `java version "1.8.0_401"
Java(TM) SE Runtime Environment (build 1.8.0_401-b10)
Java HotSpot(TM) 64-Bit Server VM (build 25.401-b10, mixed mode)`;

describe('classifyJava (emulator pre-check)', () => {
  it('accepts a HotSpot JDK 11+', () => {
    expect(classifyJava(TEMURIN)).toBe('ok');
  });

  it('rejects OpenJ9, which crashes the Firestore emulator', () => {
    expect(classifyJava(SEMERU)).toBe('openj9');
  });

  it('rejects Java 8 and a missing java', () => {
    expect(classifyJava(JAVA8)).toBe('too-old');
    expect(classifyJava(null)).toBe('missing');
    expect(classifyJava("'java' is not recognized as an internal or external command")).toBe('missing');
  });
});
