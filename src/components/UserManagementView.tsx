import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, UserPlus, X } from 'lucide-react';
import { ROLES } from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { btnPrimary, PageHeader } from './Kit';
import { translations } from '../i18n/translations';
import { addUser, InvalidEmailError, subscribeUsers, updateUser, UserExistsError } from '../services/users';
import type { AppUser, Role } from '../types';

const ROLE_BADGE: Record<Role, string> = {
  admin: 'border border-brand text-brand',
  supervisor: 'border border-line-strong text-ink',
  staff: 'border border-line text-muted',
};

/** Admin-only management of the approved users list (`users/{emailLower}`). */
export const UserManagementView: React.FC = () => {
  const { role, language, currentUser } = useAuth();
  const t = translations[language];
  const es = language === 'es';
  const isAdmin = role === 'admin';

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('staff');
  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        console.error('Could not load users', err);
        setError('load');
        setLoading(false);
      },
    );
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-4 bg-danger-wash border border-danger-line rounded-lg text-sm text-danger flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />
        <span>{es ? 'Solo los administradores pueden gestionar usuarios.' : 'Only administrators can manage users.'}</span>
      </div>
    );
  }

  const errorText =
    error === 'load'
      ? es
        ? 'No se pudo cargar la lista de usuarios.'
        : 'Could not load the users list.'
      : error === 'update'
        ? es
          ? 'No se pudo actualizar el usuario.'
          : 'Could not update the user.'
        : null;

  const resetForm = () => {
    setNewEmail('');
    setNewName('');
    setNewRole('staff');
    setNewTitle('');
    setAddError(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      await addUser({ email: newEmail, displayName: newName, role: newRole, title: newTitle });
      setIsAddModalOpen(false);
      resetForm();
    } catch (err) {
      if (err instanceof InvalidEmailError) {
        setAddError(es ? 'El correo debe ser @kachavalux.com.' : 'Email must be an @kachavalux.com address.');
      } else if (err instanceof UserExistsError) {
        setAddError(es ? 'Ese usuario ya está en la lista.' : 'That user is already on the list.');
      } else {
        console.error('Add user failed', err);
        setAddError(es ? 'No se pudo agregar el usuario.' : 'Could not add the user.');
      }
    } finally {
      setAdding(false);
    }
  };

  const runUpdate = async (email: string, patch: Parameters<typeof updateUser>[1]) => {
    setBusyEmail(email);
    setError(null);
    try {
      await updateUser(email, patch);
    } catch (err) {
      console.error('Update user failed', err);
      setError('update');
    } finally {
      setBusyEmail(null);
    }
  };

  const roleLabel = (r: Role) => (r === 'admin' ? t.roleAdmin : r === 'supervisor' ? t.roleSupervisor : t.roleStaff);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow={es ? '04 — Personal' : '04 — People'}
        title={t.usersTitle}
        meta={`${users.length} ${es ? 'usuarios' : 'users'}`}
        actions={
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className={btnPrimary}
          >
            <UserPlus className="w-4 h-4" strokeWidth={1.5} />
            <span>{es ? 'Agregar usuario' : 'Add user'}</span>
          </button>
        }
      />

      {errorText && (
        <div className="px-3.5 py-3 bg-danger-wash border-l-2 border-danger text-danger flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {/* Phones and tablets: one block per person */}
      <ul className="lg:hidden -mt-2 sm:-mt-4 border-b border-line divide-y divide-line">
        {loading && (
          <li className="py-6 text-center text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            {t.loading}
          </li>
        )}
        {users.map((user) => {
          const isSelf = currentUser?.email === user.email;
          const busy = busyEmail === user.email;
          return (
            <li key={user.email} className={`py-4 ${user.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-full border border-line-strong text-ink flex items-center justify-center font-display text-sm">
                  {user.displayName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[15px] text-ink truncate">{user.displayName}</span>
                    {isSelf && <span className="kl-label !text-[10px] shrink-0">{es ? 'Usted' : 'You'}</span>}
                  </div>
                  {user.title && <div className="text-sm text-muted truncate">{user.title}</div>}
                  <div className="text-xs text-muted font-mono truncate">{user.email}</div>
                  <div className="mt-1 text-xs">
                    {user.lastSignInAt ? (
                      <span className="text-ok">
                        {user.lastSignInAt.toLocaleString(es ? 'es-MX' : 'en-US', {
                          timeZone: 'America/Cancun',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    ) : (
                      <span className="text-pending">{es ? 'Nunca ha entrado' : 'Never signed in'}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 pl-12 flex items-center gap-3">
                {isSelf ? (
                  <span className="kl-label">{roleLabel(user.role)}</span>
                ) : (
                  <>
                    <select
                      value={user.role}
                      disabled={busy}
                      onChange={(e) => runUpdate(user.email, { role: e.target.value as Role })}
                      className="flex-1 min-w-0 min-h-10 border border-line rounded-sm px-2.5 text-sm bg-surface cursor-pointer"
                      aria-label={`${t.colRole} — ${user.displayName}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={busy}
                      onClick={() => runUpdate(user.email, { active: !user.active })}
                      className="shrink-0 min-h-10 px-3 text-sm text-ink border border-line-strong rounded-sm hover:bg-wash cursor-pointer disabled:opacity-50"
                    >
                      {user.active ? (es ? 'Desactivar' : 'Deactivate') : es ? 'Activar' : 'Activate'}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden lg:block border-y border-line">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line [&_th]:kl-label [&_th]:font-medium">
              <tr>
                <th className="px-4 py-2.5">{t.colName}</th>
                <th className="px-4 py-2.5">{t.colTitle}</th>
                <th className="px-4 py-2.5">{t.colEmail}</th>
                <th className="px-4 py-2.5">{t.colRole}</th>
                <th className="px-4 py-2.5">{es ? 'Último acceso' : 'Last sign-in'}</th>
                <th className="px-4 py-2.5 text-right">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    {t.loading}
                  </td>
                </tr>
              )}
              {users.map((user) => {
                const isSelf = currentUser?.email === user.email;
                const busy = busyEmail === user.email;
                return (
                  <tr key={user.email} className={`transition-colors ${user.active ? "hover:bg-wash/60" : "opacity-60"}`}>
                    <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full border border-line-strong text-ink flex items-center justify-center font-display text-xs">
                          {user.displayName.charAt(0)}
                        </div>
                        <span>{user.displayName}</span>
                        {isSelf && (
                          <span className="text-[10px] bg-wash text-muted px-1 rounded-sm font-normal">{es ? 'Usted' : 'You'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap">{user.title}</td>
                    <td className="px-4 py-2.5 text-muted font-mono text-xs whitespace-nowrap">{user.email}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isSelf ? (
                        <span className={`px-2 py-0.5 rounded-sm text-[11px] font-medium uppercase tracking-wide ${ROLE_BADGE[user.role]}`}>
                          {roleLabel(user.role)}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          disabled={busy}
                          onChange={(e) => runUpdate(user.email, { role: e.target.value as Role })}
                          className="min-h-9 border border-line rounded-sm px-2 text-sm bg-surface cursor-pointer"
                          aria-label={t.colRole}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[11px]">
                      {user.lastSignInAt ? (
                        <span className="inline-flex items-center gap-1 text-ok">
                          <CheckCircle2 className="w-3 h-3" />
                          {user.lastSignInAt.toLocaleString(es ? 'es-MX' : 'en-US', {
                            timeZone: 'America/Cancun',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      ) : (
                        <span className="text-pending">{es ? 'Nunca' : 'Never'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {!isSelf && (
                        <button
                          disabled={busy}
                          onClick={() => runUpdate(user.email, { active: !user.active })}
                          className="text-xs text-brand hover:underline font-medium cursor-pointer disabled:opacity-50"
                        >
                          {user.active ? (es ? 'Desactivar' : 'Deactivate') : es ? 'Activar' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pt-4 border-t border-line text-xs text-ink flex items-start gap-2.5 max-w-2xl">
        <ShieldAlert className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <div className="text-muted text-xs leading-relaxed">
          {es
            ? 'Solo las personas en esta lista (cuenta Microsoft @kachavalux.com) pueden entrar. Desactivar a un usuario bloquea su acceso de inmediato. El rol define los permisos; el puesto es solo informativo.'
            : 'Only people on this list (Microsoft @kachavalux.com account) can sign in. Deactivating a user blocks access immediately. Role defines permissions; job title is informational only.'}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in" role="dialog" aria-modal="true">
          <div className="bg-surface w-full sm:max-w-md border-t sm:border border-line rounded-none sm:rounded-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-line mb-3">
              <h3 className="font-semibold text-sm text-ink">{es ? 'Agregar usuario aprobado' : 'Add approved user'}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-muted hover:text-ink rounded-sm cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              {addError && (
                <div className="p-2 bg-danger-wash border border-danger-line rounded-sm text-danger flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}
              <label className="block">
                <span className="block font-medium text-ink mb-1">
                  {t.colName} <span className="text-danger">*</span>
                </span>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full border border-line rounded-sm p-2 text-sm" required />
              </label>
              <label className="block">
                <span className="block font-medium text-ink mb-1">
                  {t.colEmail} <span className="text-danger">*</span>
                </span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@kachavalux.com"
                  className="w-full border border-line rounded-sm p-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="block font-medium text-ink mb-1">
                  {t.colTitle} <span className="text-danger">*</span>
                </span>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border border-line rounded-sm p-2 text-sm" required />
              </label>
              <label className="block">
                <span className="block font-medium text-ink mb-1">
                  {t.colRole} <span className="text-danger">*</span>
                </span>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className="w-full border border-line rounded-sm p-2 text-sm">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pt-2 border-t border-line flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-3 py-1.5 border rounded-sm text-muted hover:bg-gray-100 cursor-pointer">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-1.5 bg-brand hover:bg-brand-deep text-surface rounded-sm font-medium cursor-pointer disabled:opacity-60"
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
