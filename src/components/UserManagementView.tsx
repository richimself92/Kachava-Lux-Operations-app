import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { AppUser, Role } from '../types';
import { ShieldAlert, CheckCircle2, AlertCircle, UserPlus, X } from 'lucide-react';

export const UserManagementView: React.FC = () => {
  const { role, language, currentUser, isLiveMode } = useAuth();
  const { usersList, addAuthorizedUser, toggleUserActive } = useRequests();
  const t = translations[language];

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('staff');
  const [newTitle, setNewTitle] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const isAdmin = role === 'admin';

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName) return;

    addAuthorizedUser({
      email: newEmail.trim().toLowerCase(),
      displayName: newName.trim(),
      role: newRole,
      title: newTitle.trim() || 'Staff',
      phone: newPhone.trim() || undefined,
      active: true,
    });

    setIsAddModalOpen(false);
    setNewEmail('');
    setNewName('');
    setNewRole('staff');
    setNewTitle('');
    setNewPhone('');
  };

  const getRoleBadge = (userRole: Role) => {
    switch (userRole) {
      case 'admin':
        return 'bg-[#6D4627] text-white';
      case 'supervisor':
        return 'bg-[#989166] text-white';
      default:
        return 'bg-[#F3F3F1] text-[#202124] border border-[#DADCE0]';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-[#DADCE0]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
            {t.usersTitle}
          </h1>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6D4627] hover:bg-[#55361D] text-white text-xs sm:text-sm font-medium rounded shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>{language === 'es' ? 'Agregar Personal' : 'Add Personnel'}</span>
          </button>
        )}
      </div>

      {/* Roster & Permission Clarification Notice */}
      <div className="p-3 bg-[#F4EFEA] border border-[#E8DEC9] rounded-lg text-xs text-[#202124] flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-[#6D4627] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold text-[#6D4627]">
            {language === 'es' ? 'Lista Oficial de Personal y Roles Técnicos' : 'Official Personnel Roster & Access Roles'}
          </div>
          <div className="text-[#5F6368] text-[11px] leading-relaxed">
            {language === 'es'
              ? 'Los puestos corporativos no otorgan automáticamente permisos de administración. Randel Can Chuc (Maintenance Manager) funge como Supervisor de Mantenimiento propuesto. La lista refleja personal autorizado; las cuentas requieren creación individual en Firebase Authentication.'
              : 'Company job titles do not automatically convey administrative privileges. Randel Can Chuc (Maintenance Manager) is the designated Maintenance Supervisor. Roster records represent authorized personnel and require individual provisioning in Firebase Authentication.'}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F3F3F1] border-b border-[#DADCE0] text-[#5F6368] uppercase text-[11px] font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-2.5">{t.colName}</th>
                <th className="px-4 py-2.5">{t.colTitle}</th>
                <th className="px-4 py-2.5">{t.colEmail}</th>
                <th className="px-4 py-2.5">{t.colRole}</th>
                <th className="px-4 py-2.5">Firebase Auth</th>
                {isAdmin && <th className="px-4 py-2.5 text-right">{t.colActions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DADCE0]">
              {usersList.map((user) => (
                <tr key={user.uid} className="hover:bg-[#F3F3F1] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-[#202124] whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#6D4627] text-white flex items-center justify-center font-bold text-xs">
                        {user.displayName.charAt(0)}
                      </div>
                      <span>{user.displayName}</span>
                      {currentUser?.uid === user.uid && (
                        <span className="text-[10px] bg-gray-200 text-[#5F6368] px-1 py-0.2 rounded font-normal">
                          {language === 'es' ? 'Sesión' : 'Current'}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-2.5 text-[#5F6368] whitespace-nowrap font-medium">
                    {user.title}
                  </td>

                  <td className="px-4 py-2.5 text-[#5F6368] font-mono text-xs whitespace-nowrap">
                    {user.email}
                  </td>

                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase ${getRoleBadge(
                        user.role
                      )}`}
                    >
                      {user.role}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                        isLiveMode && user.isFirebaseVerified
                          ? 'bg-[#E6F4EA] text-[#137333]'
                          : 'bg-[#FEF7E0] text-[#B06000]'
                      }`}
                    >
                      {isLiveMode && user.isFirebaseVerified ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{language === 'es' ? 'Verificada' : 'Verified'}</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 text-[#E37400]" />
                          <span>{language === 'es' ? 'Roster / Demo' : 'Roster Record'}</span>
                        </>
                      )}
                    </span>
                  </td>

                  {isAdmin && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {currentUser?.uid !== user.uid && (
                        <button
                          onClick={() => toggleUserActive(user.uid)}
                          className="text-xs text-[#6D4627] hover:underline font-medium cursor-pointer"
                        >
                          {user.active
                            ? language === 'es'
                              ? 'Desactivar'
                              : 'Deactivate'
                            : language === 'es'
                            ? 'Activar'
                            : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-[#DADCE0] p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#DADCE0] mb-3">
              <h3 className="font-semibold text-sm text-[#202124]">
                {language === 'es' ? 'Agregar Personal al Roster' : 'Add Personnel to Roster'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-[#5F6368] hover:text-[#202124] rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#202124] mb-1">
                  {t.colName} <span className="text-[#D93025]">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Randel Can Chuc"
                  className="w-full border border-[#DADCE0] rounded p-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#202124] mb-1">
                  {t.colEmail} <span className="text-[#D93025]">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. randel@kachavalux.com"
                  className="w-full border border-[#DADCE0] rounded p-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#202124] mb-1">
                  {t.colTitle} <span className="text-[#D93025]">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Maintenance Manager"
                  className="w-full border border-[#DADCE0] rounded p-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#202124] mb-1">
                  {t.colRole} <span className="text-[#D93025]">*</span>
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full border border-[#DADCE0] rounded p-2 text-sm"
                >
                  <option value="staff">{t.roleStaff}</option>
                  <option value="supervisor">{t.roleSupervisor}</option>
                  <option value="admin">{t.roleAdmin}</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#DADCE0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-[#5F6368] hover:bg-gray-100 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#6D4627] hover:bg-[#55361D] text-white rounded font-medium cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
