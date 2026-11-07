import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
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
    getActiveBranch,
    branches,
    stats,
    isOnline,
    isLocalOnlyMode,
    lastSyncTime,
    isFirebaseSyncing,
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

  const activeBranch = getActiveBranch() || branches[0];
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
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span className="font-bold text-slate-800 text-[11px]">جاهز</span>
        </div>

        {/* Panel 2: Current Branch */}
        <div 
          onClick={() => setActiveTab('branches')}
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-blue-50 transition shrink-0"
          title="الفرع الحالي - انقر لإدارة الفروع"
        >
          <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
          <span className="text-slate-500 text-[10px]">الفرع:</span>
          <span className="font-bold text-slate-800 text-[11px] max-w-[120px] truncate">
            {activeBranch?.name || 'الرئيسي'}
          </span>
        </div>

        {/* Panel 3: Current User & Role */}
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

        {/* Panel 5: Cash Balance */}
        <div 
          onClick={() => setActiveTab('treasuries')}
          className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded-xs shadow-inner cursor-pointer hover:bg-emerald-50 transition shrink-0"
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
