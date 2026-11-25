import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {secureLoginEnabled} from '../services/secureAuth';
import { 
  Building2, 
  User, 
  Database, 
  Wifi, 
  WifiOff, 
  Wallet, 
  Sparkles, 
  Clock, 
  Calendar, 
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  HardDrive
} from 'lucide-react';

export const DesktopStatusBar: React.FC = () => {
  const {
    settings,
    currentUser,
    branches,
    activeBranchId,
    setActiveBranchId,
    users,
    currentUserId,
    setCurrentUserId,
    hasPermission,
    stats,
    isOnline,
    isLocalOnlyMode,
    lastSyncTime,
    isServerSyncing,
    pendingSyncCount,
    setActiveTab
  } = useAccounting();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [capsLockActive, setCapsLockActive] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      setCurrentTime(timeStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Monitor Caps Lock status
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLockActive(e.getModifierState('CapsLock'));
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, []);

  const isSessionAdmin = Boolean(
    localStorage.getItem('alnoor_press_accounting_v1_session_admin') === 'true' ||
    localStorage.getItem('alnoor_press_accounting_v1_logged_in_user_id') === 'usr-1' ||
    false
  );

  const isAdmin = Boolean(
    currentUser?.roleId === 'role-admin' ||
    currentUser?.id === 'usr-1' ||
    currentUser?.id === 'user-1789170883526' ||
    currentUser?.email === 'admin@example.invalid' ||
    currentUser?.email === 'press@example.invalid' ||
    currentUser?.username?.toLowerCase().includes('lobnan') ||
    currentUser?.username?.toLowerCase().includes('raid') ||
    currentUser?.roleName === 'مدير النظام' ||
    isSessionAdmin
  );
  const todayDate = new Date().toLocaleDateString('ar-SA', {
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });

  return (
    <footer 
      className="print:hidden h-7 min-h-[28px] max-h-[28px] bg-[#f0f2f5] text-slate-700 text-[11px] font-sans border-t border-slate-400 select-none flex items-center justify-between px-1 w-full shrink-0 z-40 overflow-hidden shadow-xs sticky bottom-0"
      dir="rtl"
    >
      {/* Left Panels (Right in RTL) */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 min-w-0">
        {/* Panel 1: System Ready State */}
        <div 
          className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner shrink-0"
          title="حالة النظام: جاهز للعمل واستقبال الأوامر"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
          <span className="font-bold text-slate-800 text-[11px]">جاهز</span>
        </div>

          {/* Active Branch Selector - متاح للتنقل بين الفروع */}
          <div className="flex items-center gap-1 bg-white border border-[#7f9db9] rounded-xs px-1.5 py-0.5 text-xs shadow-inner shrink-0">
            <Building2 className="w-3 h-3 text-blue-700 shrink-0" />
            <span className="text-[10px] text-slate-500">الفرع:</span>
            <select
              value={activeBranchId}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="bg-transparent text-slate-900 text-[11px] font-bold focus:outline-hidden cursor-pointer max-w-[115px] truncate"
              title="الفرع النشط الحالي"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-white text-slate-900 font-sans">
                  {b.name} ({b.branchCode})
                </option>
              ))}
            </select>
          </div>

          {/* PostgreSQL logins are never impersonated by a UI dropdown. The
              legacy user switcher is retained only outside secure-login mode. */}
          {!secureLoginEnabled() && isAdmin ? (
            <div className="flex items-center gap-1 bg-white border border-[#7f9db9] rounded-xs px-1.5 py-0.5 text-xs shadow-inner shrink-0">
              <User className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="text-[10px] text-slate-500 hidden xl:inline">المستخدم:</span>
              <select
                value={currentUserId}
                onChange={(e) => {
                  const targetUid = e.target.value;
                  setCurrentUserId(targetUid);
                  try {
                    localStorage.setItem('alnoor_press_accounting_v1_current_user_id', targetUid);
                  } catch {}
                }}
                className="bg-transparent text-slate-900 text-[11px] font-bold focus:outline-hidden cursor-pointer max-w-[140px] truncate"
                title="المستخدم الحالي والصلاحيات (صلاحية مدير النظام للتنقل بين المستخدمين)"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id} className="bg-white text-slate-900 font-sans">
                    {u.fullName || u.username} ({u.roleName || 'مستخدم'})
                  </option>
                ))}
              </select>
              {currentUserId !== 'usr-1' && isSessionAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentUserId('usr-1');
                    try {
                      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', 'usr-1');
                    } catch {}
                  }}
                  className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xs text-[10px] font-bold shadow-2xs cursor-pointer ml-1"
                  title="العودة لشاشة وصلاحيات مدير النظام"
                >
                  عودة للمدير ↺
                </button>
              )}
            </div>
          ) : (
        <div 
          onClick={() => setActiveTab('users_permissions')}
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-blue-50 transition shrink-0"
          title="المستخدم الحالي - انقر لإدارة الصلاحيات"
        >
          <User className="w-3 h-3 text-slate-600 shrink-0" />
          <span className="text-slate-500 text-[10px]">المستخدم:</span>
          <span className="font-bold text-slate-800 text-[11px] max-w-[130px] truncate">
            {currentUser?.fullName || 'المدير العام'}
          </span>
          <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded-xs border border-blue-200">
            {currentUser?.roleName || 'مدير'}
          </span>
        </div>

          )}

        {/* Panel 4: Database & Cloud Sync Status */}
        <div 
          onClick={() => setActiveTab('settings_database')}
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-emerald-50 transition shrink-0"
          title={isLocalOnlyMode ? "وضع العمل المحلي الخالص (مُفعل 100% - محلي فقط)" : isOnline ? "قاعدة البيانات السحابية (Google Drive & Server Hub) متصلة ومزامنة فورية" : "النظام في وضع غير متصل (Offline)"}
        >
          {isLocalOnlyMode ? (
            <div className="flex items-center gap-1 text-emerald-800 font-extrabold">
              <HardDrive className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="text-[11px]">🟢 وضع محلي خالص (100% Offline)</span>
            </div>
          ) : isOnline ? (
            <div className="flex items-center gap-1 text-emerald-700">
              <Database className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="font-bold text-[11px]">مزامنة السيرفر وقاعدة البيانات: متصل</span>
              {lastSyncTime && (
                <span className="text-[10px] text-slate-500 font-mono hidden xl:inline">({lastSyncTime})</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-700">
              <WifiOff className="w-3 h-3 text-amber-600 shrink-0" />
              <span className="font-bold text-[11px]">محلي (Offline)</span>
              {pendingSyncCount > 0 && (
                <span className="bg-amber-100 text-amber-900 px-1 rounded text-[10px]">
                  ({pendingSyncCount})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Panel 5: Google Drive Automated Backup Status */}
        <div 
          onClick={() => setActiveTab('settings_backup')}
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-blue-50 transition shrink-0"
          title="النسخ الاحتياطي التلقائي إلى Google Drive (كل ساعة مع حفظ آخر 7 أيام) - انقر للإدارة"
        >
          <Cloud className="w-3 h-3 text-blue-600 shrink-0" />
          <span className="text-slate-500 text-[10px]">نسخ Drive:</span>
          <span className="font-bold text-[11px] text-blue-700">
            كل ساعة (7 أيام)
          </span>
        </div>

        {hasPermission('view_accounting') && <>
        {/* Panel 5: Cash Balance */}
        <div 
          onClick={() => setActiveTab('treasuries')}
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-emerald-50 transition shrink-0"
          title="رصيد الخزينة النقدية - انقر لعرض حركة الصناديق"
        >
          <Wallet className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="text-slate-500 text-[10px]">الصندوق:</span>
          <span className="font-bold font-mono text-emerald-700 text-[11px]">
            {(stats?.cashBalance ?? 0).toLocaleString('ar-SA')}
          </span>
          <span className="text-[9px] text-slate-400">{settings.currency}</span>
        </div>

        {/* Panel 6: Bank Balance */}
        <div 
          onClick={() => setActiveTab('treasuries')}
          className="hidden lg:flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-blue-50 transition shrink-0"
          title="رصيد الحساب البنكي - انقر لعرض حركة الصناديق"
        >
          <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
          <span className="text-slate-500 text-[10px]">البنك:</span>
          <span className="font-bold font-mono text-blue-700 text-[11px]">
            {(stats?.bankBalance ?? 0).toLocaleString('ar-SA')}
          </span>
          <span className="text-[9px] text-slate-400">{settings.currency}</span>
        </div>
        </>}

          {/* Low Stock Alert - ONLY for users with inventory permission */}
          {hasPermission('view_inventory') && stats.lowStockCount > 0 && (
            <button
              onClick={() => setActiveTab('inventory')}
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-rose-100 border border-rose-400 text-rose-900 font-bold text-[10px] hover:bg-rose-200 transition cursor-pointer"
              title="أصناف وصلت لحد الأمان بالمخزون"
            >
              <AlertTriangle className="w-3 h-3 text-rose-700" />
              <span>نواقص: {stats.lowStockCount}</span>
            </button>
          )}
      </div>

      {/* Right Panels (Left in RTL): Date, Time, Locks */}
      <div className="flex items-center gap-1 shrink-0 py-0.5 mr-2">
        {/* Date Panel */}
        <div 
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner shrink-0"
          title="تاريخ اليوم"
        >
          <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="font-medium text-slate-700 text-[11px]">{todayDate}</span>
        </div>

        {/* Live Clock Panel */}
        <div 
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner shrink-0 min-w-[76px] justify-center"
          title="الوقت الحالي"
        >
          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="font-mono font-bold text-slate-800 text-[11px]">{currentTime}</span>
        </div>

        {/* Keyboard Indicators (Classic Desktop Windows Lock Keys) */}
        <div className="hidden xl:flex items-center gap-0.5 px-1 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner text-[9.5px] font-mono font-bold shrink-0">
          <span className={`px-1 rounded-xs ${capsLockActive ? 'bg-amber-400 text-slate-900 font-extrabold' : 'text-slate-400'}`}>
            CAPS
          </span>
          <span className="text-slate-300">|</span>
          <span className="px-1 text-emerald-600 font-extrabold" title="لوحة الأرقام نشطة">
            NUM
          </span>
          <span className="text-slate-300">|</span>
          <span className="px-1 text-blue-600 font-bold" title="إدخال عادي">
            INS
          </span>
        </div>
      </div>
    </footer>
  );
};
