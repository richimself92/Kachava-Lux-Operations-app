import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  COMMON_AREA_SUBLOCATIONS,
  LOCATIONS,
  PRIORITIES,
  ROLES,
  STATUSES,
  TRANSITIONS,
} from '../../shared/domain';

/**
 * firestore.rules cannot import TypeScript, so it restates the domain enums.
 * This test fails when shared/domain.ts and the rules drift apart.
 */
const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');

/** Extracts the quoted values of the list returned by `function <name>() { return [...]; }`. */
function listFromRules(fnName: string): string[] {
  const match = rules.match(new RegExp(`function ${fnName}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`, 'm'));
  if (!match) throw new Error(`function ${fnName}() not found in firestore.rules`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('firestore.rules parity with shared/domain.ts', () => {
  it('roles', () => {
    expect(listFromRules('roles')).toEqual([...ROLES]);
  });

  it('statuses', () => {
    expect(listFromRules('statuses')).toEqual([...STATUSES]);
  });

  it('categories', () => {
    expect(listFromRules('categories')).toEqual([...CATEGORIES]);
  });

  it('priorities', () => {
    expect(listFromRules('priorities')).toEqual([...PRIORITIES]);
  });

  it('locations (villas vs facilities)', () => {
    expect(listFromRules('villaCodes')).toEqual(LOCATIONS.filter((l) => l.type === 'villa').map((l) => l.code));
    expect(listFromRules('facilityCodes')).toEqual(
      LOCATIONS.filter((l) => l.type === 'facility').map((l) => l.code),
    );
  });

  it('common area sublocations', () => {
    for (const s of COMMON_AREA_SUBLOCATIONS) expect(rules).toContain(`'${s}'`);
  });

  it('transition map', () => {
    const body = rules.match(/function transitionAllowed\(from, to\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        const line = body.split('\n').find((l) => l.includes(`from == '${from}'`)) ?? '';
        expect(line, `${from} -> ${to}`).toContain(`'${to}'`);
      }
    }
    // completada must have no outgoing transitions.
    expect(body).not.toContain("from == 'completada'");
  });
});
