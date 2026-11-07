import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small destructive-action confirmation modal. Escape or backdrop click cancels. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink/40" onClick={() => !busy && onCancel()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="relative w-full sm:max-w-sm bg-surface border-t sm:border border-line rounded-none sm:rounded-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start gap-3">
          <div className="pt-1 text-danger shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-lg text-ink">
              {title}
            </h2>
            <p id="confirm-dialog-body" className="mt-1 text-sm text-muted">
              {body}
            </p>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 sm:flex-none min-h-11 px-4 text-sm rounded-sm border border-line-strong text-ink hover:bg-wash disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 sm:flex-none min-h-11 px-4 text-sm font-medium rounded-sm bg-danger hover:bg-danger/90 text-surface disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
