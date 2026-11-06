import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, PauseCircle, PlayCircle, Timer } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import type { Dict } from '../lib/labels';
import { formatDuration, formatDurationShort } from '../lib/time';
import { ticketTimerState } from '../lib/timer';
import type { AuditLogEntry, MaintenanceRequest } from '../types';

interface TicketTimerProps {
  request: MaintenanceRequest;
  audit: AuditLogEntry[] | null;
  t: Dict;
}

const Row: React.FC<{ label: string; value: string; tone?: 'ok' | 'bad' | 'muted'; hint?: string }> = ({
  label,
  value,
  tone = 'muted',
  hint,
}) => (
  <div className="flex items-baseline justify-between gap-2 text-xs">
    <span className="text-[#5F6368]">{label}</span>
    <span className="text-right">
      <span
        className={`font-mono font-semibold tabular-nums ${
          tone === 'bad' ? 'text-[#D93025]' : tone === 'ok' ? 'text-[#137333]' : 'text-[#202124]'
        }`}
      >
        {value}
      </span>
      {hint && <span className="block text-[10px] text-[#70757A]">{hint}</span>}
    </span>
  </div>
);

/** Live response / work timer shown on the ticket detail modal. */
export const TicketTimer: React.FC<TicketTimerProps> = ({ request, audit, t }) => {
  const live = request.status === 'sin_revisar' || request.status === 'reconocida';
  const now = useNow(1000, live);
  const s = ticketTimerState(request, now.getTime(), audit);
  const target = `${t.timerTarget}: ${formatDurationShort(s.targetMs)}`;

  if (s.mode === 'response') {
    return (
      <div
        className={`rounded-lg border p-3 ${
          s.overdue ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#DADCE0] bg-[#FAFAFA]'
        }`}
        role="timer"
      >
        <div className="flex items-center justify-between">
          <span className={`text-[11px] font-semibold uppercase flex items-center gap-1 ${s.overdue ? 'text-[#D93025]' : 'text-[#5F6368]'}`}>
            {s.overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {t.timerResponseLabel}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.overdue ? 'bg-[#D93025] text-white' : 'bg-[#E6F4EA] text-[#137333]'}`}>
            {s.overdue ? t.timerOverdue : t.timerWithinTarget}
          </span>
        </div>
        <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${s.overdue ? 'text-[#D93025]' : 'text-[#202124]'}`}>
          {formatDuration(s.elapsedMs)}
        </div>
        <div className="text-[11px] text-[#5F6368]">{target}</div>
      </div>
    );
  }

  const response =
    s.responseMs === null ? (
      <Row label={t.timerResponseLabel} value="—" />
    ) : (
      <Row
        label={t.timerResponseLabel}
        value={formatDurationShort(s.responseMs)}
        tone={s.responseSlaMet ? 'ok' : 'bad'}
        hint={`${target} · ${s.responseSlaMet ? t.timerWithinTarget : t.timerOverdue}`}
      />
    );

  if (s.mode === 'work') {
    return (
      <div className="rounded-lg border border-[#DADCE0] bg-[#FAFAFA] p-3 space-y-2" role="timer">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase text-[#5F6368] flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            {t.timerWorkLabel}
          </span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${
              s.running ? 'bg-[#E8F0FE] text-[#1A73E8]' : 'bg-[#F3E8FD] text-[#8430CE]'
            }`}
          >
            {s.running ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
            {s.running ? t.timerRunning : t.timerPaused}
          </span>
        </div>
        <div className="font-mono text-2xl font-bold tabular-nums text-[#202124]">{formatDuration(s.workMs)}</div>
        <div className="pt-1 border-t border-[#DADCE0]">{response}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#CEEAD6] bg-[#E6F4EA]/40 p-3 space-y-1.5">
      <span className="text-[11px] font-semibold uppercase text-[#137333] flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t.timerTotalLabel}
      </span>
      <div className="font-mono text-2xl font-bold tabular-nums text-[#202124]">
        {s.totalMs === null ? '—' : formatDuration(s.totalMs)}
      </div>
      <div className="pt-1 border-t border-[#CEEAD6] space-y-1">
        {response}
        <Row label={t.timerWorkLabel} value={formatDurationShort(s.workMs)} />
        <Row label={t.timerBlockedLabel} value={formatDurationShort(s.blockedMs)} />
      </div>
    </div>
  );
};
