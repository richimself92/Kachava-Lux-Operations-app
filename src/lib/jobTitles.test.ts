import { describe, expect, it } from 'vitest';
import { JOB_TITLES, toJobTitle } from '../../shared/domain';
import { translations } from '../i18n/translations';
import { jobTitleLabel, jobTitleOptions } from './labels';

describe('job titles', () => {
  it('resolves codes and legacy English titles to a code', () => {
    expect(toJobTitle('maintenance_manager')).toBe('maintenance_manager');
    expect(toJobTitle('Maintenance Manager')).toBe('maintenance_manager');
    expect(toJobTitle('  founder & ceo ')).toBe('founder_ceo');
    expect(toJobTitle('Gardener')).toBeNull();
    expect(toJobTitle('')).toBeNull();
    expect(toJobTitle(undefined)).toBeNull();
  });

  it('translates every catalog title in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      const options = jobTitleOptions(translations[lang]);
      expect(options.map((o) => o.key)).toEqual([...JOB_TITLES]);
      for (const o of options) expect(o.label).toMatch(/\S/);
    }
    expect(jobTitleLabel(translations.es, 'yacht_captain')).toBe('Capitán de Yate');
    expect(jobTitleLabel(translations.en, 'yacht_captain')).toBe('Yacht Captain');
  });

  it('translates legacy stored titles and shows unknown ones as stored', () => {
    expect(jobTitleLabel(translations.es, 'General Manager')).toBe('Gerente General');
    expect(jobTitleLabel(translations.es, 'Gardener')).toBe('Gardener');
    expect(jobTitleLabel(translations.es, '')).toBe('');
  });
});
