import { CATEGORIES, LOCATIONS, PRIORITIES, type MaintenanceCategory, type RequestPriority } from '../../shared/domain';
import type { AuditAction, AuditLogEntry, Language } from '../types';
import { categoryLabel, locationLabel, priorityBadge, subLocationLabel, type Dict } from './labels';

/**
 * Audit entries are stored with codes / fixed English phrases (written by the app and by
 * Cloud Functions). These helpers render them in the UI language. User-typed text (notes,
 * pending reasons, completion notes) is shown as written.
 */

export const AUDIT_ACTION_LABEL: Record<AuditAction, Record<Language, string>> = {
  created: { en: 'Created', es: 'Creada' },
  status_changed: { en: 'Status changed', es: 'Cambio de estado' },
  reassigned: { en: 'Reassigned', es: 'Reasignada' },
  note_added: { en: 'Note', es: 'Nota' },
  photo_added: { en: 'Photos added', es: 'Fotos agregadas' },
  details_edited: { en: 'Details edited', es: 'Datos editados' },
};

const ROLE_LABEL: Record<string, Record<Language, string>> = {
  staff: { en: 'Staff', es: 'Personal' },
  supervisor: { en: 'Supervisor', es: 'Supervisor' },
  admin: { en: 'Admin', es: 'Administrador' },
  system: { en: 'System', es: 'Sistema' },
};

export const auditActionLabel = (action: string, lang: Language) =>
  AUDIT_ACTION_LABEL[action as AuditAction]?.[lang] ?? action;

export const auditRoleLabel = (role: string, lang: Language) => ROLE_LABEL[role]?.[lang] ?? role;

const isCategory = (v: string): v is MaintenanceCategory => (CATEGORIES as readonly string[]).includes(v);
const isPriority = (v: string): v is RequestPriority => (PRIORITIES as readonly string[]).includes(v);

const priorityText = (t: Dict, v: string) => (isPriority(v) ? priorityBadge(t, v) : v);
const categoryText = (t: Dict, v: string) => (isCategory(v) ? categoryLabel(t, v) : v);
const areaText = (t: Dict, v: string) => (v === 'hall' || v === 'parking' ? subLocationLabel(t, v) : v);

/** Field names and value translators for `details_edited` entries ("field: old → new; …"). */
const EDIT_FIELDS: Record<string, { label: Record<Language, string>; value: (t: Dict, v: string) => string }> = {
  location: { label: { en: 'Location', es: 'Ubicación' }, value: (t, v) => locationText(t, v) },
  category: { label: { en: 'Category', es: 'Categoría' }, value: categoryText },
  area: { label: { en: 'Common area', es: 'Área común' }, value: areaText },
  priority: { label: { en: 'Priority', es: 'Prioridad' }, value: priorityText },
  assignee: { label: { en: 'Supervisor', es: 'Supervisor' }, value: (_t, v) => v },
};

/** Location token: current entries store the code, older ones the stored name (e.g. "Gym"). */
function locationText(t: Dict, v: string) {
  const loc = LOCATIONS.find((l) => l.code === v || l.name.toLowerCase() === v.toLowerCase());
  return loc ? locationLabel(t, loc.code, loc.name) : v;
}

/** Localized details line for an audit entry. */
export function auditDetailsText(t: Dict, lang: Language, entry: Pick<AuditLogEntry, 'action' | 'details'>): string {
  const d = entry.details ?? '';
  if (!d) return d;

  switch (entry.action) {
    case 'created': {
      // "<location> · <category> · <priority>"
      const parts = d.split(' · ');
      if (parts.length !== 3) return d;
      const [loc, cat, pri] = parts;
      return [locationText(t, loc), categoryText(t, cat), priorityText(t, pri)].join(' · ');
    }
    case 'details_edited':
      // "<field>: <old> → <new>; …"
      return d
        .split('; ')
        .map((part) => {
          const m = /^(\w+): (.*) → (.*)$/s.exec(part);
          const field = m && EDIT_FIELDS[m[1]];
          if (!m || !field) return part;
          return `${field.label[lang]}: ${field.value(t, m[2])} → ${field.value(t, m[3])}`;
        })
        .join(' · ');
    case 'photo_added': {
      // "<n> <before|after> photo(s): <names>"
      const m = /^(\d+) (before|after) photo\(s\): (.*)$/s.exec(d);
      if (!m) return d;
      const [, n, kind, names] = m;
      const what =
        lang === 'es'
          ? `${n} foto(s) ${kind === 'before' ? 'iniciales' : 'de reparación'}`
          : `${n} ${kind === 'before' ? 'initial' : 'after-repair'} photo(s)`;
      return `${what}: ${names}`;
    }
    case 'reassigned':
      // Default assignment written by the backend: "— → <name> (default)"
      return lang === 'es' ? d.replace(/ \(default\)$/, ' (por defecto)') : d;
    default:
      return d;
  }
}
