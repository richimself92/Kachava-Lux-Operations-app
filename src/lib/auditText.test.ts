import { describe, expect, it } from 'vitest';
import { translations } from '../i18n/translations';
import { auditActionLabel, auditDetailsText, auditRoleLabel } from './auditText';

const es = translations.es;
const en = translations.en;

describe('audit text localization', () => {
  it('translates the created entry from codes (current format)', () => {
    expect(auditDetailsText(es, 'es', { action: 'created', details: 'gym · lighting · low' })).toBe(
      `${es.locGym} · ${es.catLighting} · ${es.pBadgeLow}`,
    );
  });

  it('translates older created entries that stored the location name', () => {
    const out = auditDetailsText(es, 'es', { action: 'created', details: 'Gym · lighting · low' });
    expect(out).not.toMatch(/lighting|low/);
    expect(out.startsWith(es.locGym)).toBe(true);
  });

  it('keeps villa names and unknown values as they are', () => {
    expect(auditDetailsText(es, 'es', { action: 'created', details: '102 · plumbing · urgent' })).toMatch(/^Villa 102 · /);
    expect(auditDetailsText(es, 'es', { action: 'created', details: 'free text' })).toBe('free text');
  });

  it('translates priority changes, photo entries and the default assignment', () => {
    expect(auditDetailsText(es, 'es', { action: 'priority_changed', details: 'normal → high' })).toBe(
      `${es.pBadgeNormal} → ${es.pBadgeHigh}`,
    );
    expect(auditDetailsText(es, 'es', { action: 'photo_added', details: '2 before photo(s): a.jpg, b.png' })).toBe(
      '2 foto(s) iniciales: a.jpg, b.png',
    );
    expect(auditDetailsText(es, 'es', { action: 'reassigned', details: '— → Randel Can Chuc (default)' })).toBe(
      '— → Randel Can Chuc (por defecto)',
    );
    expect(auditDetailsText(en, 'en', { action: 'reassigned', details: '— → Randel Can Chuc (default)' })).toBe(
      '— → Randel Can Chuc (default)',
    );
  });

  it('never rewrites user-typed notes', () => {
    expect(auditDetailsText(es, 'es', { action: 'note_added', details: 'low water pressure' })).toBe('low water pressure');
  });

  it('translates action and role labels', () => {
    expect(auditActionLabel('created', 'es')).toBe('Creada');
    expect(auditActionLabel('priority_changed', 'es')).toBe('Cambio de prioridad');
    expect(auditRoleLabel('admin', 'es')).toBe('Administrador');
    expect(auditRoleLabel('system', 'es')).toBe('Sistema');
  });
});
