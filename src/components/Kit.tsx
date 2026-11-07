import React from 'react';

/**
 * Shared visual vocabulary (MUJI / Kenya Hara direction).
 * Quiet labels, hairline rules, square edges, a single brown accent.
 */

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 min-h-10 px-4 bg-brand hover:bg-brand-deep text-surface text-sm font-medium rounded-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 min-h-10 px-4 bg-surface border border-line-strong hover:bg-wash text-ink text-sm font-medium rounded-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';
export const btnQuiet =
  'inline-flex items-center gap-1.5 min-h-10 px-1 text-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink transition-colors cursor-pointer';
export const iconBtn =
  'inline-flex items-center justify-center w-10 h-10 shrink-0 text-muted hover:text-ink hover:bg-wash rounded-sm transition-colors cursor-pointer';

export const fieldLabel = 'kl-label block mb-1.5';
export const fieldInput =
  'w-full min-h-10 bg-surface border border-line rounded-sm px-3 py-2 text-sm text-ink focus:outline-hidden focus:border-ink transition-colors';

/** Page title block: tiny letter-spaced eyebrow, quiet title, optional meta line and actions. */
export const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, meta, actions }) => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-5 sm:pb-6 border-b border-line">
    <div className="min-w-0">
      <div className="kl-label">{eyebrow}</div>
      <h1 className="mt-2 text-[1.625rem] sm:text-[2rem] leading-tight text-ink">{title}</h1>
      {meta && <div className="mt-1.5 text-sm text-muted">{meta}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
  </header>
);

/** Section heading: "02 — Status" label above a quiet h2. */
export const SectionHead: React.FC<{ index: string; title: string; action?: React.ReactNode }> = ({ index, title, action }) => (
  <div className="flex items-end justify-between gap-3 mb-3 sm:mb-4">
    <div className="min-w-0">
      <div className="kl-label">{index}</div>
      <h2 className="mt-1 text-base sm:text-lg leading-snug text-ink">{title}</h2>
    </div>
    {action}
  </div>
);

/**
 * Text-only segmented control: the selected option is ink with a 1px underline.
 * Scrolls sideways (no visible bar) when it does not fit; bleeds to the screen edge on phones.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`kl-no-scrollbar flex items-stretch overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 ${className}`}
    >
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`shrink-0 min-h-10 px-3 first:pl-0 text-sm whitespace-nowrap border-b transition-colors cursor-pointer ${
              on ? 'text-ink border-ink' : 'text-muted border-transparent hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Hairline grid: cells separated by 1px rules instead of boxed cards. */
export const HairlineGrid: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`grid gap-px bg-line border border-line ${className}`}>{children}</div>
);
