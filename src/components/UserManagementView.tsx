import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, UserPlus, X } from 'lucide-react';
import { ROLES } from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { translations } from '../i18n/translations';
import { addUser, InvalidEmailError, subscribeUsers, updateUser, UserExistsError } from '../services/users';
import type { AppUser, Role } from '../types';

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-[#6D4627] text-white',
  supervisor: 'bg-[#989166] text-white',
  staff: 'bg-[#F3F3F1] text-[#202124] border border-[#DADCE0]',
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
      <div className="p-4 bg-[#FCE8E6] border border-[#FAD2CF] rounded-lg text-sm text-[#D93025] flex items-center gap-2">
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-[#DADCE0]">
        <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">{t.usersTitle}</h1>
        <button
          onClick={() => {
            resetForm();
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6D4627] hover:bg-[#55361D] text-white text-xs sm:text-sm font-medium rounded shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>{es ? 'Agregar usuario' : 'Add user'}</span>
        </button>
      </div>

      {errorText && (
        <div className="p-2.5 bg-[#FCE8E6] border border-[#FAD2CF] rounded text-[#D93025] flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      <div className="bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F3F3F1] border-b border-[#DADCE0] text-[#5F6368] uppercase text-[11px] font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-2.5">{t.colName}</th>
                <th className="px-4 py-2.5">{t.colTitle}</th>
                <th className="px-4 py-2.5">{t.colEmail}</th>
                <th className="px-4 py-2.5">{t.colRole}</th>
                <th className="px-4 py-2.5">{es ? 'Último acceso' : 'Last sign-in'}</th>
                <th className="px-4 py-2.5 text-right">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DADCE0]">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5F6368]">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    {t.loading}
                  </td>
                </tr>
              )}
              {users.map((user) => {
                const isSelf = currentUser?.email === user.email;
                const busy = busyEmail === user.email;
                return (
                  <tr key={user.email} className={`transition-colors ${user.active ? 'hover:bg-[#F3F3F1]' : 'opacity-60'}`}>
                    <td className="px-4 py-2.5 font-medium text-[#202124] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#6D4627] text-white flex items-center justify-center font-bold text-xs">
                          {user.displayName.charAt(0)}
                        </div>
                        <span>{user.displayName}</span>
                        {isSelf && (
                          <span className="text-[10px] bg-gray-200 text-[#5F6368] px-1 rounded font-normal">{es ? 'Usted' : 'You'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[#5F6368] whitespace-nowrap">{user.title}</td>
                    <td className="px-4 py-2.5 text-[#5F6368] font-mono text-xs whitespace-nowrap">{user.email}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isSelf ? (
                        <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase ${ROLE_BADGE[user.role]}`}>
                          {roleLabel(user.role)}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          disabled={busy}
                          onChange={(e) => runUpdate(user.email, { role: e.target.value as Role })}
                          className="border border-[#DADCE0] rounded px-1.5 py-0.5 text-xs bg-white cursor-pointer"
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
                        <span className="inline-flex items-center gap-1 text-[#137333]">
                          <CheckCircle2 className="w-3 h-3" />
                          {user.lastSignInAt.toLocaleString(es ? 'es-MX' : 'en-US', {
                            timeZone: 'America/Cancun',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      ) : (
                        <span className="text-[#B06000]">{es ? 'Nunca' : 'Never'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {!isSelf && (
                        <button
                          disabled={busy}
                          onClick={() => runUpdate(user.email, { active: !user.active })}
                          className="text-xs text-[#6D4627] hover:underline font-medium cursor-pointer disabled:opacity-50"
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

      <div className="p-3 bg-[#F4EFEA] border border-[#E8DEC9] rounded-lg text-xs text-[#202124] flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-[#6D4627] shrink-0 mt-0.5" />
        <div className="text-[#5F6368] text-[11px] leading-relaxed">
          {es
            ? 'Solo las personas en esta lista (cuenta Microsoft @kachavalux.com) pueden entrar. Desactivar a un usuario bloquea su acceso de inmediato. El rol define los permisos; el puesto es solo informativo.'
            : 'Only people on this list (Microsoft @kachavalux.com account) can sign in. Deactivating a user blocks access immediately. Role defines permissions; job title is informational only.'}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-[#DADCE0] p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#DADCE0] mb-3">
              <h3 className="font-semibold text-sm text-[#202124]">{es ? 'Agregar usuario aprobado' : 'Add approved user'}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-[#5F6368] hover:text-[#202124] rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              {addError && (
                <div className="p-2 bg-[#FCE8E6] border border-[#FAD2CF] rounded text-[#D93025] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}
              <label className="block">
                <span className="block font-medium text-[#202124] mb-1">
                  {t.colName} <span className="text-[#D93025]">*</span>
                </span>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full border border-[#DADCE0] rounded p-2 text-sm" required />
              </label>
              <label className="block">
                <span className="block font-medium text-[#202124] mb-1">
                  {t.colEmail} <span className="text-[#D93025]">*</span>
                </span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@kachavalux.com"
                  className="w-full border border-[#DADCE0] rounded p-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="block font-medium text-[#202124] mb-1">
                  {t.colTitle} <span className="text-[#D93025]">*</span>
                </span>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border border-[#DADCE0] rounded p-2 text-sm" required />
              </label>
              <label className="block">
                <span className="block font-medium text-[#202124] mb-1">
                  {t.colRole} <span className="text-[#D93025]">*</span>
                </span>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className="w-full border border-[#DADCE0] rounded p-2 text-sm">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pt-2 border-t border-[#DADCE0] flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-3 py-1.5 border rounded text-[#5F6368] hover:bg-gray-100 cursor-pointer">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-1.5 bg-[#6D4627] hover:bg-[#55361D] text-white rounded font-medium cursor-pointer disabled:opacity-60"
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
