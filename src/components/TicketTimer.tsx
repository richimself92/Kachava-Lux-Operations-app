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
    <span className="text-muted">{label}</span>
    <span className="text-right">
      <span
        className={`font-mono font-semibold tabular-nums ${
          tone === 'bad' ? 'text-danger' : tone === 'ok' ? 'text-ok' : 'text-ink'
        }`}
      >
        {value}
      </span>
      {hint && <span className="block text-[10px] text-muted">{hint}</span>}
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
        className={`border-t pt-4 pb-1 ${
          s.overdue ? 'border-danger bg-danger-wash/50 px-3' : 'border-line'
        }`}
        role="timer"
      >
        <div className="flex items-center justify-between">
          <span className={`kl-label flex items-center gap-1.5 ${s.overdue ? '!text-danger' : ''}`}>
            {s.overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {t.timerResponseLabel}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${s.overdue ? 'bg-danger text-surface' : 'bg-ok-wash text-ok'}`}>
            {s.overdue ? t.timerOverdue : t.timerWithinTarget}
          </span>
        </div>
        <div className={`mt-1 font-display text-[2rem] leading-none tracking-wide tabular-nums ${s.overdue ? 'text-danger' : 'text-ink'}`}>
          {formatDuration(s.elapsedMs)}
        </div>
        <div className="text-[11px] text-muted">{target}</div>
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
      <div className="border-t border-line pt-4 pb-1 space-y-3" role="timer">
        <div className="flex items-center justify-between">
          <span className="kl-label flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" />
            {t.timerWorkLabel}
          </span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm flex items-center gap-1 ${
              s.running ? 'bg-info-wash text-info' : 'bg-plum-wash text-plum'
            }`}
          >
            {s.running ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
            {s.running ? t.timerRunning : t.timerPaused}
          </span>
        </div>
        <div className="font-display text-[2rem] leading-none tracking-wide tabular-nums text-ink">{formatDuration(s.workMs)}</div>
        <div className="pt-1 border-t border-line">{response}</div>
      </div>
    );
  }

  return (
    <div className="border-t border-ok-line pt-4 pb-1 space-y-2">
      <span className="kl-label !text-ok flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t.timerTotalLabel}
      </span>
      <div className="font-display text-[2rem] leading-none tracking-wide tabular-nums text-ink">
        {s.totalMs === null ? '—' : formatDuration(s.totalMs)}
      </div>
      <div className="pt-1 border-t border-ok-line space-y-1">
        {response}
        <Row label={t.timerWorkLabel} value={formatDurationShort(s.workMs)} />
        <Row label={t.timerBlockedLabel} value={formatDurationShort(s.blockedMs)} />
      </div>
    </div>
  );
};
