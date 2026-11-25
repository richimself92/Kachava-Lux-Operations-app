import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { isSupervisorRole } from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { translations } from '../i18n/translations';
import { enablePush, pushEnabled, pushSupport } from '../services/push';

/**
 * Turns on new-request notifications for this device (supervisors and admins: they can be the
 * Maintenance Manager or the assignee). The permission prompt needs a tap, hence the button.
 */
export const PushToggle: React.FC<{ rail: boolean }> = ({ rail }) => {
  const { role, language, currentUser } = useAuth();
  const t = translations[language];
  const [support, setSupport] = useState(pushSupport);
  const [enabled, setEnabled] = useState(pushEnabled);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const email = currentUser?.email;

  // Already enabled: refresh the token (they rotate) and keep the message language in sync.
  useEffect(() => {
    if (!email || !pushEnabled()) return;
    enablePush(email, language).catch((err) => console.warn('Push refresh failed', err));
  }, [email, language]);

  if (!email || !isSupervisorRole(role) || support === 'unsupported') return null;

  const turnOn = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const ok = await enablePush(email, language);
      setEnabled(ok);
      if (!ok) setFailed(true);
    } catch (err) {
      console.error('Enable push failed', err);
      setFailed(true);
    } finally {
      setSupport(pushSupport());
      setBusy(false);
    }
  };

  if (support === 'ios-needs-install' || support === 'denied') {
    const text = support === 'denied' ? t.pushBlocked : t.pushIosInstall;
    return rail ? (
      <span className="w-10 h-10 inline-flex items-center justify-center text-muted" title={text}>
        <BellOff className="w-4 h-4" strokeWidth={1.5} />
      </span>
    ) : (
      <p className="text-[11px] leading-snug text-muted">{text}</p>
    );
  }

  if (enabled) {
    return rail ? (
      <span className="w-10 h-10 inline-flex items-center justify-center text-ok" title={t.pushOn}>
        <BellRing className="w-4 h-4" strokeWidth={1.5} />
      </span>
    ) : (
      <div className="flex items-center gap-2 text-xs text-ok">
        <BellRing className="w-4 h-4" strokeWidth={1.5} />
        <span>{t.pushOn}</span>
      </div>
    );
  }

  return (
    <div className={rail ? '' : 'space-y-1'}>
      <button
        type="button"
        onClick={() => void turnOn()}
        disabled={busy}
        title={t.pushEnable}
        aria-label={t.pushEnable}
        className={`flex items-center gap-2 text-sm text-brand hover:text-brand-deep cursor-pointer disabled:opacity-60 ${
          rail ? 'justify-center w-10 h-10 hover:bg-wash rounded-sm' : 'min-h-10 -ml-1 px-1'
        }`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" strokeWidth={1.5} />}
        {!rail && <span>{t.pushEnable}</span>}
      </button>
      {failed && !rail && <p className="text-[11px] text-danger">{t.pushFailed}</p>}
    </div>
  );
};
