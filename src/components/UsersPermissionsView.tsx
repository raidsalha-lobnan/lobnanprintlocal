import React, { useState, useMemo } from 'react';
import {secureLoginEnabled} from '../services/secureAuth';
import {sendAdminDirectoryAction} from '../services/adminDirectoryApi';
import { useAccounting } from '../context/AccountingContext';
import { shareDriveFolderWithEmail, getSavedDriveToken } from '../services/googleDriveService';
import { SystemUser, Role, PermissionKey, PERMISSION_DEFINITIONS, PermissionDefinition, AllowedPriceTierScope } from '../types';
import {
  Users,
  ShieldCheck,
  UserCheck,
  KeyRound,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Store,
  Building2,
  Lock,
  Unlock,
  Check,
  X,
  Search,
  Sliders,
  Sparkles,
  Info,
  User,
  ArrowRight,
  Eye,
  FileCheck,
  BadgeAlert
} from 'lucide-react';

export const UsersPermissionsView: React.FC = () => {
  const {
    users,
    addUser,
    updateUser,
    deleteUser,
    roles,
    addRole,
    updateRole,
    deleteRole,
    branches,
    currentUserId,
    setCurrentUserId,
    currentUser,
    hasPermission,
    canAccessBranch
  } = useAccounting();

  const isAdmin = Boolean(
    currentUser?.roleId === 'role-admin' ||
    currentUser?.id === 'usr-1' ||
    currentUser?.email === 'admin@example.invalid' ||
    currentUser?.email === 'press@example.invalid' ||
    currentUser?.roleName === 'مدير النظام'
  );

  const [activeTab, setActiveTabState] = useState<'users' | 'roles_matrix' | 'audit'>(() => {
    try {
      const saved = localStorage.getItem('users_permissions_subtab');
      if (saved && ['users', 'roles_matrix', 'audit'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'users';
  });

  const setActiveTab = React.useCallback((tab: 'users' | 'roles_matrix' | 'audit') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('users_permissions_subtab', tab);
    } catch {}
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');

  // Modal states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // User form state
  const [userForm, setUserForm] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    roleId: 'role-cashier',
    defaultBranchId: 'br-1',
    allowedBranchIds: ['*'] as string[],
    allBranchesAllowed: true,
    status: 'active' as 'active' | 'inactive',
    avatarColor: 'bg-indigo-600',
    allowedPriceTier: 'all' as AllowedPriceTierScope,
    canEditPrices: false,
    shareDriveAttachments: false
  });

  // Role form state
  const [roleForm, setRoleForm] = useState<{
    code: string;
    name: string;
    description: string;
    permissions: Record<PermissionKey, boolean>;
  }>({
    code: '',
    name: '',
    description: '',
    permissions: {
      view: true,
      add: false,
      edit: false,
      approve: false,
      cancel: false,
      soft_delete: false,
      print: true,
      export: false,
      edit_prices: false,
      edit_cost: false,
      edit_exchange_rate: false,
      create_receipt: false,
      approve_receipt: false,
      create_payment: false,
      approve_payment: false,
      create_clearing: false,
      approve_clearing: false,
      transfer_funds: false,
      close_cash_drawer: false,
      reopen_closed_period: false
    }
  });

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchRole = selectedRoleFilter === 'all' || u.roleId === selectedRoleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchQuery, selectedRoleFilter]);

  // Open User Modal
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Open User Modal
  const handleOpenUserModal = (user?: SystemUser) => {
    if (user) {
      setEditingUser(user);
      const isAll = user.allowedBranchIds.includes('*');
      const userRole = roles.find(r => r.id === user.roleId);
      const userCanEdit = user.customPermissions?.edit_prices !== undefined
        ? !!user.customPermissions.edit_prices
        : !!userRole?.permissions.edit_prices;

      setUserForm({
        username: user.username,
        fullName: user.fullName,
        email: user.email || '',
        password: user.password || '',
        phone: user.phone || '',
        roleId: user.roleId,
        defaultBranchId: user.defaultBranchId || branches[0]?.id || 'br-1',
        allowedBranchIds: isAll ? branches.map(b => b.id) : [...user.allowedBranchIds],
        allBranchesAllowed: isAll,
        status: user.status,
        avatarColor: user.avatarColor || 'bg-indigo-600',
        allowedPriceTier: user.allowedPriceTier || 'all',
        canEditPrices: userCanEdit,
        shareDriveAttachments: !!user.shareDriveAttachments
      });
    } else {
      setEditingUser(null);
      const defaultRole = roles[0] || { id: 'role-cashier', permissions: {} as any };
      setUserForm({
        username: '',
        fullName: '',
        email: '',
        password: '',
        phone: '',
        roleId: defaultRole.id,
        defaultBranchId: branches[0]?.id || 'br-1',
        allowedBranchIds: ['*'],
        allBranchesAllowed: true,
        status: 'active',
        avatarColor: 'bg-indigo-600',
        allowedPriceTier: 'all',
        canEditPrices: !!defaultRole.permissions?.edit_prices,
        shareDriveAttachments: false
      });
    }
    setIsUserModalOpen(true);
  };

  // Save User
  const [isSharingDrive, setIsSharingDrive] = useState(false);
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userForm.username.trim() || !userForm.fullName.trim()) {
      alert('يرجى إدخال اسم المستخدم والاسم الكامل');
      return;
    }

    if (secureLoginEnabled()) {
      // Authoritative PostgreSQL user changes are committed by the server.
      // Do not fall back to localStorage/legacy authentication or pretend a pending change succeeded.
      const allowed = userForm.allBranchesAllowed ? ['*'] : userForm.allowedBranchIds;
      const nextPassword = String((userForm as any).password || '').trim();
      if (!editingUser && !nextPassword) {
        alert('يرجى تعيين كلمة مرور قوية للمستخدم الجديد (10 أحرف على الأقل).');
        return;
      }
      try {
        const role=roles.find(r=>r.id===userForm.roleId);
        await sendAdminDirectoryAction('user.upsert',{
          ...(editingUser ? {id:editingUser.id} : {}),
          profile:{
            username:userForm.username.trim(),fullName:userForm.fullName.trim(),
            companyId:editingUser?.companyId||'comp-1',
            email:userForm.email.trim(),phone:userForm.phone.trim(),
            roleId:userForm.roleId,roleName:role?.name||'مستخدم',
            defaultBranchId:userForm.defaultBranchId,
            allowedBranchIds:allowed.length?allowed:[userForm.defaultBranchId],
            status:userForm.status,
            customPermissions:{...(editingUser?.customPermissions||{}),edit_prices:userForm.canEditPrices}
          },
          ...(nextPassword ? {password:nextPassword} : {})
        });
        setSaveSuccessNotice('حُفظ حساب الموظف في PostgreSQL بنجاح. ستظهر التحديثات في الأجهزة بعد المزامنة.');
        setIsUserModalOpen(false);
        setTimeout(()=>setSaveSuccessNotice(null),8000);
      } catch(error) {
        alert('لم يُحفظ حساب الموظف: '+String((error as Error).message||error));
      }
      return;
    }

    let driveNotice = '';
    if (userForm.shareDriveAttachments && userForm.email) {
      setIsSharingDrive(true);
      try {
        const driveRes = await shareDriveFolderWithEmail(userForm.email, 'writer');
        if (driveRes?.message) {
          driveNotice = driveRes.message;
        }
      } catch (err) {
        console.error('Drive share error:', err);
      } finally {
        setIsSharingDrive(false);
      }
    }

    const assignedRole = roles.find(r => r.id === userForm.roleId);
    const finalAllowedBranches = userForm.allBranchesAllowed ? ['*'] : userForm.allowedBranchIds;

    const finalPassword = userForm.password?.trim()
      ? userForm.password.trim()
      : (editingUser?.password || '123456');

    const payload = {
      companyId: 'comp-1',
      username: userForm.username.trim(),
      fullName: userForm.fullName.trim(),
      email: userForm.email.trim() || undefined,
      password: finalPassword,
      phone: userForm.phone.trim() || undefined,
      roleId: userForm.roleId,
      roleName: assignedRole?.name || 'مستخدم',
      defaultBranchId: userForm.defaultBranchId,
      allowedBranchIds: finalAllowedBranches.length > 0 ? finalAllowedBranches : [userForm.defaultBranchId],
      status: userForm.status,
      avatarColor: userForm.avatarColor,
      allowedPriceTier: userForm.allowedPriceTier,
      shareDriveAttachments: userForm.shareDriveAttachments,
      driveSharedAt: userForm.shareDriveAttachments
        ? (editingUser?.driveSharedAt || new Date().toISOString())
        : undefined,
      customPermissions: {
        ...(editingUser?.customPermissions || {}),
        edit_prices: userForm.canEditPrices
      }
    };

    if (editingUser) {
      updateUser(editingUser.id, payload);
      setSaveSuccessNotice(driveNotice || `تم تحديث بيانات المستخدم (${payload.fullName}) وتفعيل مشاركة وصلاحيات رفع وتحميل ملفات الدرايف بنجاح!`);
    } else {
      addUser(payload);
      setSaveSuccessNotice(driveNotice || `تم إنشاء المستخدم (${payload.fullName}) وتفعيل حسابه ومشاركته بنجاح!`);
    }
    
    setIsUserModalOpen(false);
    setTimeout(() => setSaveSuccessNotice(null), 6000);
  };

  // Open Role Modal
  const handleOpenRoleModal = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({
        code: role.code,
        name: role.name,
        description: role.description || '',
        permissions: { ...role.permissions }
      });
    } else {
      setEditingRole(null);
      setRoleForm({
        code: `ROLE_CUSTOM_${roles.length + 1}`,
        name: '',
        description: '',
        permissions: {
          view: true,
          add: false,
          edit: false,
          approve: false,
          cancel: false,
          soft_delete: false,
          print: true,
          export: false,
          edit_prices: false,
          edit_cost: false,
          edit_exchange_rate: false,
          create_receipt: false,
          approve_receipt: false,
          create_payment: false,
          approve_payment: false,
          create_clearing: false,
          approve_clearing: false,
          transfer_funds: false,
          close_cash_drawer: false,
          reopen_closed_period: false
        }
      });
    }
    setIsRoleModalOpen(true);
  };

  // Save Role
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name.trim() || !roleForm.code.trim()) {
      alert('يرجى إدخال اسم الدور الوظيفي وكوده');
      return;
    }

    if (secureLoginEnabled()) {
      try {
        await sendAdminDirectoryAction('role.upsert',{
          ...(editingRole ? {id:editingRole.id} : {}),
          profile:{...roleForm,code:roleForm.code.toUpperCase()}
        });
        setIsRoleModalOpen(false);
        setSaveSuccessNotice('تم حفظ الدور والصلاحيات في PostgreSQL، وستصل التحديثات عبر المزامنة.');
        setTimeout(()=>setSaveSuccessNotice(null),8000);
      }catch(error){alert('تعذر حفظ الدور: '+String((error as Error).message||error));}
      return;
    }

    if (editingRole) {
      updateRole(editingRole.id, roleForm);
    } else {
      addRole({
        code: roleForm.code.toUpperCase(),
        name: roleForm.name,
        description: roleForm.description,
        isSystem: false,
        permissions: roleForm.permissions
      });
    }
    setIsRoleModalOpen(false);
  };

  // Permission toggles helper
  const setAllPermissionsInForm = (val: boolean) => {
    const updated = { ...roleForm.permissions };
    PERMISSION_DEFINITIONS.forEach(p => {
      updated[p.key] = val;
    });
    setRoleForm({ ...roleForm, permissions: updated });
  };

  // Group permission definitions by category
  const groupedPermissions: Record<string, PermissionDefinition[]> = useMemo(() => {
    const map: Record<string, PermissionDefinition[]> = {};
    PERMISSION_DEFINITIONS.forEach(p => {
      if (!map[p.categoryLabel]) {
        map[p.categoryLabel] = [];
      }
      map[p.categoryLabel].push(p);
    });
    return map;
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">نظام المستخدمين والصلاحيات الدقيقة</h1>
              <span className="text-xs bg-blue-500/30 text-blue-300 font-semibold px-2.5 py-0.5 rounded-full border border-blue-400/40">
                Granular RBAC
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1">
              إدارة أدوار المنظومة (12 دوراً وظيفياً و 20 صلاحية تشغيلية ومحاسبية مستقلة) مع تحديد الفروع المسموح لكل مستخدم بالوصول إليها.
            </p>
          </div>
        </div>

        {/* Current User Persona Quick Info */}
        <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700 self-stretch md:self-auto">
          <div className={`w-9 h-9 rounded-lg ${currentUser.avatarColor || 'bg-indigo-600'} flex items-center justify-center font-bold text-white shadow-xs`}>
            {currentUser.fullName.charAt(0)}
          </div>
          <div className="text-xs">
            <span className="text-slate-400 block text-[10px]">المستخدم الحالي:</span>
            <strong className="text-white font-bold">{currentUser.fullName}</strong>
            <span className="text-blue-300 font-semibold block text-[11px]">[{currentUser.roleName}]</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>المستخدمون وحسابات الدخول</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
              activeTab === 'users' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('roles_matrix')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
              activeTab === 'roles_matrix'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>الأدوار ومصفوفة الصلاحيات (20 صلاحية)</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
              activeTab === 'roles_matrix' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {roles.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>مدقق الصلاحيات الفعلي</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' && (
            <button
              onClick={() => handleOpenUserModal()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مستخدم جديد</span>
            </button>
          )}

          {activeTab === 'roles_matrix' && (
            <button
              onClick={() => handleOpenRoleModal()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء دور مخصص</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. USERS TAB */}
      {/* ========================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {saveSuccessNotice && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{saveSuccessNotice}</span>
              </div>
              <button onClick={() => setSaveSuccessNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold p-1">✕</button>
            </div>
          )}

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="relative min-w-[260px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث باسم المستخدم، البريد، الاسم الكامل..."
                className="w-full pl-3 pr-9 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-400 font-light font-bold">تصفية حسب الدور:</span>
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="all">كافة الأدوار ({roles.length})</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Users Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredUsers.map(user => {
              const isCurrent = user.id === currentUserId;
              const role = roles.find(r => r.id === user.roleId);
              const defaultBranch = branches.find(b => b.id === user.defaultBranchId);
              const hasAllBranches = user.allowedBranchIds.includes('*');
              const allowedBranchesList = branches.filter(b => user.allowedBranchIds.includes(b.id));

              return (
                <div
                  key={user.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between ${
                    isCurrent ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl ${user.avatarColor || 'bg-indigo-600'} text-white font-black text-base flex items-center justify-center shadow-xs`}>
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900 text-base flex items-center gap-1.5">
                            <span>{user.fullName}</span>
                            {isCurrent && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                                أنت الآن 👤
                              </span>
                            )}
                          </h3>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-light font-mono">
                            <span>@{user.username}</span>
                            <span>•</span>
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                              {role?.name || user.roleName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          user.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {user.status === 'active' ? 'نشط' : 'معطل'}
                        </span>
                        {user.shareDriveAttachments && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200" title="مشاركة مجلد Google Drive بكامل صلاحيات رفع وتحميل وتعديل المرفقات">
                            📁 درايف (رفع وتحميل) ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="py-3 space-y-2 text-xs text-slate-600">
                      {user.email && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">البريد:</span>
                          <span className="font-mono text-slate-800" dir="ltr">{user.email}</span>
                        </div>
                      )}

                      {user.phone && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">الهاتف:</span>
                          <span className="font-mono text-slate-800" dir="ltr">{user.phone}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-400">الفرع الافتراضي:</span>
                        <span className="font-bold text-slate-800">{defaultBranch?.name || 'غير محدد'}</span>
                      </div>

                      {/* Allowed Branches (تحديد الفروع التي يستطيع الوصول إليها) */}
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1">
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>الفروع المصرح بالوصول إليها:</span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {hasAllBranches ? (
                            <span className="text-[11px] bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-md border border-emerald-200">
                              ✓ الوصول لكافة فروع المنشأة ({branches.length})
                            </span>
                          ) : (
                            allowedBranchesList.map(b => (
                              <span key={b.id} className="text-[10px] bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded border border-slate-200">
                                {b.name} ({b.branchCode})
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Price Policy & Edit Permission */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium">فئة السعر والتعديل:</span>
                        <div className="flex items-center gap-1">
                          <span className="bg-amber-50 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                            {user.allowedPriceTier === 'price1'
                              ? 'سعر 1 فقط'
                              : user.allowedPriceTier === 'price2'
                              ? 'سعر 2 فقط'
                              : user.allowedPriceTier === 'price3'
                              ? 'سعر 3 فقط'
                              : 'كافة الفئات'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded font-bold border ${
                            (user.customPermissions?.edit_prices ?? role?.permissions?.edit_prices)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {(user.customPermissions?.edit_prices ?? role?.permissions?.edit_prices) ? '✏️ تعديل السعر' : '🔒 سعر مقفل'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {isAdmin && (
                      <button
                        onClick={() => setCurrentUserId(user.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          isCurrent
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700'
                        }`}
                        title="التبديل إلى هذا المستخدم لتجربة صلاحياته وشاشته (خاص بمدير النظام)"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{isCurrent ? 'أنت تستخدم هذا الحساب' : 'الدخول بهذا المستخدم'}</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenUserModal(user)}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                        title="تعديل المستخدم والصلاحيات"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {users.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف المستخدم ${user.fullName}؟`)) {
                              if (secureLoginEnabled()) {
                                void sendAdminDirectoryAction('user.disable',{id:user.id})
                                  .then(()=>setSaveSuccessNotice('تم تعطيل حساب الموظف على الخادم؛ لم تُحذف سجلاته المالية.'))
                                  .catch(error=>alert('تعذر تعطيل المستخدم: '+String(error.message||error)));
                              } else {
                                const res=deleteUser(user.id);
                                if(!res.success)alert(res.message);
                              }
                            }
                          }}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                          title="حذف المستخدم"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. ROLES & PERMISSIONS MATRIX TAB */}
      {/* ========================================================= */}
      {activeTab === 'roles_matrix' && (
        <div className="space-y-6">
          {/* Introduction Card */}
          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl text-xs text-indigo-950 flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-indigo-900 mb-1">مصفوفة الصلاحيات الموحدة (20 صلاحية تشغيلية ومحاسبية)</h4>
              <p className="text-indigo-800/90 leading-relaxed">
                لكل وظيفة أو دور صلاحيات مستقلة تماماً تشمل: (مشاهدة، إضافة، تعديل، اعتماد، إلغاء، حذف منطقي، طباعة، تصدير، تعديل الأسعار، تعديل التكلفة، تعديل سعر الصرف، إنشاء قبض، اعتماد قبض، إنشاء صرف، اعتماد صرف، إنشاء مقاصة، اعتماد مقاصة، تحويل أموال، إغلاق صندوق، وفتح فترة محاسبية مغلقة).
              </p>
            </div>
          </div>

          {/* Detailed Roles Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-900 text-white border-b border-slate-800">
                    <th className="p-3.5 sticky right-0 bg-slate-900 z-10 w-48 font-black">الدور الوظيفي</th>
                    <th className="p-3.5 text-center font-bold">الكود</th>
                    <th className="p-3.5 text-center font-bold">الوصف</th>
                    <th className="p-3.5 text-center font-bold">الصلاحيات الفعالة</th>
                    <th className="p-3.5 text-center font-bold w-24">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {roles.map(role => {
                    const activeCount = Object.values(role.permissions).filter(Boolean).length;
                    const totalCount = PERMISSION_DEFINITIONS.length;

                    return (
                      <tr key={role.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5 sticky right-0 bg-white z-10 font-bold text-slate-900 border-l border-slate-200">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-indigo-600" />
                            <span>{role.name}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-indigo-700">
                          {role.code}
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-xs">
                          {role.description || '-'}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <span>{activeCount} من أصل {totalCount} صلاحية</span>
                            <span className="text-[10px] text-indigo-500">
                              ({Math.round((activeCount / totalCount) * 100)}%)
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenRoleModal(role)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition cursor-pointer"
                              title="تعديل صلاحيات هذا الدور"
                            >
                              تعديل الصلاحيات
                            </button>
                            {!role.isSystem && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`هل أنت متأكد من حذف دور ${role.name}؟`)) {
                                    if(secureLoginEnabled()) {
                                      void sendAdminDirectoryAction('role.delete',{id:role.id})
                                        .then(()=>setSaveSuccessNotice('تم حذف الدور غير المستخدم من PostgreSQL.'))
                                        .catch(error=>alert('تعذر حذف الدور: '+String(error.message||error)));
                                    }else{deleteRole(role.id);}
                                  }
                                }}
                                className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition"
                                title="حذف الدور"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full Visual Permissions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-5">
            <h3 className="text-base font-black text-slate-900 mb-3 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600" />
              <span>جدول تفصيل الصلاحيات الـ 20 للأدوار القياسية</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <th className="p-2.5 text-right font-black sticky right-0 bg-slate-100 z-10 w-44">الصلاحية</th>
                    {roles.map(r => (
                      <th key={r.id} className="p-2 font-bold whitespace-nowrap min-w-[70px]">
                        <span className="block text-[11px]">{r.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <React.Fragment key={category}>
                      <tr className="bg-indigo-950 text-indigo-200 font-black">
                        <td colSpan={roles.length + 1} className="p-2 text-right">
                          {category}
                        </td>
                      </tr>
                      {perms.map(p => (
                        <tr key={p.key} className="hover:bg-slate-50 transition">
                          <td className="p-2 text-right font-bold text-slate-800 sticky right-0 bg-white z-10 border-l border-slate-200">
                            <div>{p.label}</div>
                            <span className="text-[10px] text-slate-400 font-normal">{p.description}</span>
                          </td>
                          {roles.map(role => {
                            const isAllowed = role.permissions[p.key];
                            return (
                              <td key={role.id} className="p-2">
                                {isAllowed ? (
                                  <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center font-bold">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="inline-flex w-5 h-5 rounded-full bg-slate-100 text-slate-400 items-center justify-center font-bold">
                                    ✕
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. PERMISSIONS AUDIT TAB */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl ${currentUser.avatarColor || 'bg-indigo-600'} text-white font-black text-xl flex items-center justify-center shadow-xs`}>
                  {currentUser.fullName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">{currentUser.fullName}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-light">
                    <span className="font-mono">@{currentUser.username}</span>
                    <span>•</span>
                    <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded">
                      الدور: {currentUser.roleName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Switch User Persona - Only for System Admin */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">تبديل المستخدم الحالي للتجربة:</span>
                  <select
                    value={currentUserId}
                    onChange={(e) => setCurrentUserId(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.roleName})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Allowed Branches for current user */}
            <div className="py-4 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2">الفروع التي يستطيع هذا المستخدم الوصول إليها:</h4>
              <div className="flex flex-wrap gap-2">
                {currentUser.allowedBranchIds.includes('*') ? (
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>كامل فروع المنشأة ({branches.length} فروع)</span>
                  </span>
                ) : (
                  branches.map(b => {
                    const canAccess = canAccessBranch(b.id, currentUser);
                    return (
                      <span
                        key={b.id}
                        className={`text-xs font-bold px-3 py-1 rounded-lg border flex items-center gap-1.5 ${
                          canAccess
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200 opacity-60'
                        }`}
                      >
                        {canAccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-rose-600" />}
                        <span>{b.name} ({b.branchCode})</span>
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            {/* Live 20-Permissions Checker for current user */}
            <div className="pt-4">
              <h4 className="text-xs font-bold text-slate-700 mb-3">حالة الصلاحيات الـ 20 للمستخدم النشط الآن:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {PERMISSION_DEFINITIONS.map(p => {
                  const allowed = hasPermission(p.key);
                  return (
                    <div
                      key={p.key}
                      className={`p-3 rounded-xl border transition flex items-center justify-between ${
                        allowed
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${allowed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <strong className="text-xs font-bold">{p.label}</strong>
                        </div>
                        <span className="text-[10px] block text-slate-500 mt-0.5">{p.categoryLabel}</span>
                      </div>

                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        allowed ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {allowed ? 'مسموح ✓' : 'محظور ✕'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT USER */}
      {/* ========================================================= */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingUser ? 'تعديل بيانات المستخدم والصلاحيات' : 'إضافة مستخدم جديد للنظام'}
                </h3>
              </div>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الدخول (Username) *</label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="khalid.pos"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    value={userForm.fullName}
                    onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                    placeholder="خالد صالحة"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الدور الوظيفي (Role) *</label>
                  <select
                    value={userForm.roleId}
                    onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفرع الافتراضي *</label>
                  <select
                    value={userForm.defaultBranchId}
                    onChange={(e) => setUserForm({ ...userForm, defaultBranchId: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="user@example.com"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
                  <input
                    type="text"
                    value={userForm.password || ''}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono text-left"
                    placeholder="******"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الهاتف</label>
                  <input
                    type="text"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="0599-..."
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Allowed Branches Selection (تحديد الفروع التي يستطيع الوصول إليها) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-900">
                    تحديد الفروع التي يستطيع هذا المستخدم الوصول إليها:
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-indigo-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.allBranchesAllowed}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUserForm({
                          ...userForm,
                          allBranchesAllowed: checked,
                          allowedBranchIds: checked ? branches.map(b => b.id) : [userForm.defaultBranchId]
                        });
                      }}
                      className="rounded text-indigo-600"
                    />
                    <span>الوصول لكافة الفروع دون قيود ⭐</span>
                  </label>
                </div>

                {!userForm.allBranchesAllowed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {branches.map(b => {
                      const isChecked = userForm.allowedBranchIds.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            isChecked ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold' : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setUserForm({ ...userForm, allowedBranchIds: [...userForm.allowedBranchIds, b.id] });
                              } else {
                                setUserForm({ ...userForm, allowedBranchIds: userForm.allowedBranchIds.filter(id => id !== b.id) });
                              }
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span>{b.name} ({b.branchCode})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* إعدادات وصلاحيات أسعار البيع والتسعير المسموح به */}
              <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-700" />
                  <h4 className="text-xs font-black text-amber-900">
                    صلاحيات وسياسات أسعار البيع في الكاشير والفواتير:
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* تحديد فئة السعر المسموح بها */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      فئة السعر المسموح بها للمستخدم:
                    </label>
                    <select
                      value={userForm.allowedPriceTier}
                      onChange={(e) => setUserForm({ ...userForm, allowedPriceTier: e.target.value as AllowedPriceTierScope })}
                      className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="all">كافة الفئات (سعر بيع، سعر بيع 1، سعر بيع 2)</option>
                      <option value="price1">سعر بيع فقط</option>
                      <option value="price2">سعر بيع 1 فقط</option>
                      <option value="price3">سعر بيع 2 فقط</option>
                    </select>
                    <p className="text-[9px] text-slate-400 font-light mt-1">
                      يحدد فئات التسعير المتاحة للمستخدم عند إصدار الفاتورة بالكاشير.
                    </p>
                  </div>

                  {/* Google Drive Sharing */}
                  <div className="bg-indigo-50/80 p-3.5 rounded-xl border border-indigo-200 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="shareDrive"
                      checked={userForm.shareDriveAttachments}
                      onChange={(e) => setUserForm({ ...userForm, shareDriveAttachments: e.target.checked })}
                      className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <label htmlFor="shareDrive" className="text-xs font-black text-indigo-950 block cursor-pointer">
                        مشاركة مجلد مرفقات Google Drive مع هذا المستخدم (صلاحية رفع وتحميل الملفات)
                      </label>
                      <p className="text-[10.5px] text-indigo-800 mt-1 leading-relaxed">
                        عند تفعيل هذا الخيار، سيتم منح الإيميل المدخل (<strong>{userForm.email || 'يرجى إدخال البريد الإلكتروني أعلاه'}</strong>) صلاحية كاملة (محرر ومشارك Writer) لرفع وتحميل وإدارة جميع المرفقات والتصاميم داخل مجلد Google Drive المشترك.
                      </p>
                    </div>
                  </div>

                  {/* إمكانية التعديل على السعر يدوياً */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      إمكانية التعديل على السعر في الكاشير:
                    </label>
                    <select
                      value={userForm.canEditPrices ? 'allow' : 'deny'}
                      onChange={(e) => setUserForm({ ...userForm, canEditPrices: e.target.value === 'allow' })}
                      className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="allow">✅ مسموح (يمكنه تعديل السعر يدوياً)</option>
                      <option value="deny">🔒 مقفل ومحمي (لا يمكنه تعديل السعر)</option>
                    </select>
                    <p className="text-[9px] text-slate-400 font-light mt-1">
                      إذا تم القفل، لن يتمكن المستخدم من تعديل سعر البيع مباشرة في الكاشير.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحالة</label>
                  <select
                    value={userForm.status}
                    onChange={(e) => setUserForm({ ...userForm, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">نشط ومفعل</option>
                    <option value="inactive">معطل مؤقتاً</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">لون الأفاتار</label>
                  <select
                    value={userForm.avatarColor}
                    onChange={(e) => setUserForm({ ...userForm, avatarColor: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="bg-indigo-600">أزرق داكن</option>
                    <option value="bg-emerald-600">أخضر زمردي</option>
                    <option value="bg-amber-600">برتقالي ذهبي</option>
                    <option value="bg-purple-600">بنفسجي ملكي</option>
                    <option value="bg-rose-600">وردي ياقوتي</option>
                    <option value="bg-teal-600">فيروزي</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSharingDrive}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSharingDrive ? 'جاري المشاركة...' : 'حفظ المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT ROLE WITH 20 GRANULAR PERMISSIONS */}
      {/* ========================================================= */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingRole ? `تعديل صلاحيات الدور: ${editingRole.name}` : 'إنشاء دور وظيفي جديد ومصفوفة الصلاحيات'}
                </h3>
              </div>
              <button
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الدور الوظيفي *</label>
                  <input
                    type="text"
                    required
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-bold"
                    placeholder="مثال: مسؤول المخازن والمشتريات"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود الدور *</label>
                  <input
                    type="text"
                    required
                    value={roleForm.code}
                    onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono font-bold text-indigo-700"
                    placeholder="WH_PURCHASE_MGR"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الوصف الإداري للدور</label>
                <input
                  type="text"
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="وصف المهام والمسؤوليات الموكلة لهذا الدور..."
                />
              </div>

              {/* Permissions Header & Bulk Toggles */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-black text-slate-900">
                  تحديد الصلاحيات المستقلة الـ 20 لهذا الدور:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAllPermissionsInForm(true)}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold cursor-pointer transition"
                  >
                    تحديد الكل ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllPermissionsInForm(false)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold cursor-pointer transition"
                  >
                    إلغاء الكل ✕
                  </button>
                </div>
              </div>

              {/* Grouped 20 Permissions Checklists */}
              <div className="space-y-4 pt-1">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <h5 className="text-xs font-black text-indigo-950 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{category}</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {perms.map(p => {
                        const isChecked = !!roleForm.permissions[p.key];
                        return (
                          <label
                            key={p.key}
                            className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                setRoleForm({
                                  ...roleForm,
                                  permissions: {
                                    ...roleForm.permissions,
                                    [p.key]: e.target.checked
                                  }
                                });
                              }}
                              className="mt-0.5 rounded text-indigo-600"
                            />
                            <div>
                              <span className="block">{p.label}</span>
                              <span className="text-[10px] text-slate-400 font-normal">{p.description}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
                >
                  حفظ الدور والصلاحيات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
