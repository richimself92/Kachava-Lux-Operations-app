import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateRoster } from '../../scripts/seed-users';
import { JOB_TITLES } from '../../shared/domain';

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

  it('stores job titles as catalog codes and keeps unknown titles as written', () => {
    const roster = validateRoster(JSON.parse(readFileSync('scripts/initial-roster.json', 'utf8')));
    for (const u of roster) expect(JOB_TITLES).toContain(u.title);
    expect(roster.find((u) => u.email === 'randel@kachavalux.com')?.title).toBe('maintenance_manager');
    expect(validateRoster([{ ...ok, title: 'Founder & CEO' }])[0].title).toBe('founder_ceo');
    expect(validateRoster([{ ...ok, title: 'Gardener' }])[0].title).toBe('Gardener');
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
