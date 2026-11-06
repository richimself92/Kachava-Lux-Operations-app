import { CATEGORIES, PRIORITIES, STATUSES } from '../../shared/domain';
import { translations } from '../i18n/translations';
import type {
  CommonAreaSubLocation,
  MaintenanceCategory,
  MaintenanceRequest,
  RequestPriority,
  RequestStatus,
} from '../types';

export type Dict = (typeof translations)['en'];

const STATUS_KEYS: Record<RequestStatus, { label: keyof Dict; help: keyof Dict }> = {
  sin_revisar: { label: 'statusSinRevisar', help: 'statusSinRevisarHelp' },
  pendiente: { label: 'statusPendiente', help: 'statusPendienteHelp' },
  reconocida: { label: 'statusReconocida', help: 'statusReconocidaHelp' },
  completada: { label: 'statusCompletada', help: 'statusCompletadaHelp' },
};

export const statusLabel = (t: Dict, s: RequestStatus) => t[STATUS_KEYS[s].label] as string;
export const statusHelp = (t: Dict, s: RequestStatus) => t[STATUS_KEYS[s].help] as string;

/** Badge classes per lifecycle state. */
export const STATUS_STYLE: Record<RequestStatus, string> = {
  sin_revisar: 'bg-[#FEF7E0] text-[#E37400] border-[#FEEFC3]',
  pendiente: 'bg-[#F3E8FD] text-[#8430CE] border-[#E9D2FD]',
  reconocida: 'bg-[#E8F0FE] text-[#1A73E8] border-[#D2E3FC]',
  completada: 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]',
};

export const statusOptions = (t: Dict) => STATUSES.map((key) => ({ key, label: statusLabel(t, key) }));

const CATEGORY_KEYS: Record<MaintenanceCategory, keyof Dict> = {
  plumbing: 'catPlumbing',
  hvac: 'catHvac',
  electrical: 'catElectrical',
  pool: 'catPool',
  jacuzzi: 'catJacuzzi',
  fauna_nociva: 'catFaunaNociva',
  carpentry: 'catCarpentry',
  appliances: 'catAppliances',
  lighting: 'catLighting',
  av_tech: 'catAvTech',
  structural: 'catStructural',
  glass_windows: 'catGlassWindows',
  grounds: 'catGrounds',
  common_areas: 'catCommonAreas',
};

export const categoryLabel = (t: Dict, c: MaintenanceCategory) => (t[CATEGORY_KEYS[c]] as string) ?? c;

export const subLocationLabel = (t: Dict, s: CommonAreaSubLocation) => (s === 'hall' ? t.subLocHall : t.subLocParking);

export function requestCategoryLabel(t: Dict, r: Pick<MaintenanceRequest, 'category' | 'commonAreaSubLocation'>) {
  const base = categoryLabel(t, r.category);
  return r.category === 'common_areas' && r.commonAreaSubLocation
    ? `${base} (${subLocationLabel(t, r.commonAreaSubLocation)})`
    : base;
}

export const categoryOptions = (t: Dict) => CATEGORIES.map((key) => ({ key, label: categoryLabel(t, key) }));

const PRIORITY_KEYS: Record<RequestPriority, { badge: keyof Dict; option: keyof Dict; sla: keyof Dict }> = {
  urgent: { badge: 'pBadgeUrgent', option: 'priorityUrgent', sla: 'slaUrgent' },
  high: { badge: 'pBadgeHigh', option: 'priorityHigh', sla: 'slaHigh' },
  normal: { badge: 'pBadgeNormal', option: 'priorityNormal', sla: 'slaNormal' },
  low: { badge: 'pBadgeLow', option: 'priorityLow', sla: 'slaLow' },
};

export const priorityBadge = (t: Dict, p: RequestPriority) => t[PRIORITY_KEYS[p].badge] as string;
export const priorityOptionLabel = (t: Dict, p: RequestPriority) => t[PRIORITY_KEYS[p].option] as string;
export const prioritySla = (t: Dict, p: RequestPriority) => t[PRIORITY_KEYS[p].sla] as string;

export const PRIORITY_STYLE: Record<RequestPriority, string> = {
  urgent: 'bg-[#FCE8E6] text-[#D93025]',
  high: 'bg-[#FEF7E0] text-[#E37400]',
  normal: 'bg-[#F4EFEA] text-[#6D4627]',
  low: 'bg-[#F1F3F4] text-[#5F6368]',
};

export const priorityOptions = (t: Dict) => PRIORITIES.map((key) => ({ key, label: priorityOptionLabel(t, key) }));

const FACILITY_KEYS: Record<string, keyof Dict> = {
  office: 'locOffice',
  warehouse_office: 'locWarehouseOffice',
  kitchen: 'locKitchen',
  gym: 'locGym',
  storage: 'locStorage',
  bodega: 'locBodega',
};

/** Facility names are translated; villa names are proper names. */
export function locationLabel(t: Dict, code: string, name: string): string {
  const key = FACILITY_KEYS[code];
  return key ? (t[key] as string) : name;
}

export const ticketLabel = (t: Dict, r: Pick<MaintenanceRequest, 'ticketId'>) => r.ticketId ?? t.ticketAssigning;
