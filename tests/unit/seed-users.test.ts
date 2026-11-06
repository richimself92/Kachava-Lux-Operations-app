import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateRoster } from '../../scripts/seed-users';

const ok = { email: 'Someone@KachavaLux.com', displayName: 'Someone', role: 'staff', title: 'X' };

describe('validateRoster', () => {
  it('normalizes emails and accepts the committed initial roster', () => {
    expect(validateRoster([ok])[0].email).toBe('someone@kachavalux.com');
    const roster = validateRoster(JSON.parse(readFileSync('scripts/initial-roster.json', 'utf8')));
    expect(roster).toHaveLength(11);
    expect(roster.filter((u) => u.role === 'admin').map((u) => u.email).sort()).toEqual([
      'gabby@kachavalux.com',
      'matt@kachavalux.com',
      'ricardo.f@kachavalux.com',
      'richard@kachavalux.com',
    ]);
  });

  it('refuses non-company emails', () => {
    expect(() => validateRoster([{ ...ok, email: 'someone@gmail.com' }])).toThrow(/kachavalux/);
    expect(() => validateRoster([{ ...ok, email: 'x@kachavalux.com.evil.io' }])).toThrow(/kachavalux/);
  });

  it('refuses duplicates, bad roles and missing names', () => {
    expect(() => validateRoster([ok, { ...ok }])).toThrow(/duplicate/);
    expect(() => validateRoster([{ ...ok, role: 'owner' }])).toThrow(/role/);
    expect(() => validateRoster([{ ...ok, displayName: ' ' }])).toThrow(/displayName/);
  });
});
