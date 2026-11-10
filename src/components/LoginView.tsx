import React, { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Lock, LogIn, Mail, RefreshCw, WifiOff } from 'lucide-react';
import type { SystemUser } from '../types';
import {loginOnline,loginOffline,secureLoginEnabled} from '../services/secureAuth';
import {
  cacheSavedUsers,
  fetchUsersFromLocalServer,
  findSavedUser,
  getCurrentWorkspace,
  readCachedUsers
} from '../services/savedUserDirectory';

type Props = { onLocalLogin?: (id: string) => void };

// PostgreSQL-only login entry point; no secondary cloud authentication.
export const LoginView: React.FC<Props> = ({ onLocalLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [directoryNotice, setDirectoryNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>(() => secureLoginEnabled()?[]:readCachedUsers());

  useEffect(() => {
    if(secureLoginEnabled()){
      if(navigator.onLine===false)
        setDirectoryNotice('الجهاز دون إنترنت. يمكنك الدخول بكلمة مرورك بعد تسجيل دخول ناجح سابق على هذا الجهاز.');
      return;
    }
    let active = true;
    void fetchUsersFromLocalServer().then(list => {
      if (!active) return;
      cacheSavedUsers(list, getCurrentWorkspace());
      setUsers(list);
      setDirectoryNotice(list.length ? '' : 'الخادم متصل، لكنه لا يحتوي على حسابات موظفين. يجب نقل الحسابات المحفوظة من النسخة السابقة إلى PostgreSQL أولًا.');
    }).catch(() => {
      if (active) setDirectoryNotice('تعذر الاتصال بخادم PostgreSQL. افتح إعداد الاتصال وتأكد من تشغيل جهاز الخادم ورابط HTTPS الصحيح.');
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      if(secureLoginEnabled()){
        let matched:SystemUser;
        try {
          matched=await loginOnline(identifier,password);
        }catch(onlineErr){
          // Only network unavailability qualifies for offline credential unlock.
          // Invalid remote passwords and server-side rejections MUST NOT fall back.
          const networkFailure=navigator.onLine===false || onlineErr instanceof TypeError;
          if(!networkFailure)throw onlineErr;
          matched=await loginOffline(identifier,password);
          setDirectoryNotice('تم فتح الحساب أوفلاين باستخدام بيانات دخول سبق التحقق منها. العمليات محفوظة محليًا حتى إعادة المزامنة.');
        }
        cacheSavedUsers([matched],getCurrentWorkspace());
        setUsers([matched]);
        const {password:_secret,...safeUser}=matched;
        localStorage.setItem('auth_type','postgres');
        localStorage.setItem('alnoor_press_accounting_v1_current_user_id',matched.id);
        localStorage.setItem('alnoor_press_accounting_v1_logged_in_user_id',matched.id);
        localStorage.setItem('alnoor_press_accounting_v1_current_user',JSON.stringify(safeUser));
        localStorage.setItem('alnoor_press_accounting_v1_session_admin','false');
        if(onLocalLogin)onLocalLogin(matched.id);else window.location.reload();
        return;
      }
      // Legacy paired-server login is supported only for local testing.
      const remoteUsers = await fetchUsersFromLocalServer();
      cacheSavedUsers(remoteUsers, getCurrentWorkspace());
      setUsers(remoteUsers);
      if (!remoteUsers.length) {
        setError('لا توجد حسابات محفوظة في قاعدة PostgreSQL الحالية. يلزم استيراد المستخدمين من قاعدة النظام السابقة دون فقد بياناتهم.');
        return;
      }
      const matched = findSavedUser(remoteUsers, identifier, password);
      if (!matched) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة، أو الحساب غير نشط. تأكد من بيانات المستخدم المحفوظة على الخادم.');
        return;
      }
      const sessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : String(Date.now());
      const { password: _unused, ...safeUser } = matched;
      localStorage.setItem('active_session_id', sessionId);
      localStorage.setItem('auth_type', 'local');
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', matched.id);
      localStorage.setItem('alnoor_press_accounting_v1_logged_in_user_id', matched.id);
      localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(safeUser));
      localStorage.setItem('alnoor_press_accounting_v1_session_admin', matched.roleId === 'role-admin' ? 'true' : 'false');
      if (onLocalLogin) onLocalLogin(matched.id);
      else window.location.reload();
    } catch (err) {
      console.warn('PostgreSQL user directory unavailable', err);
      const message = err instanceof Error ? err.message : '';
      setError(
        message === 'BAD_USERNAME_OR_PASSWORD'
          ? 'اسم المستخدم أو كلمة المرور غير صحيحة.'
          : message === 'AUTH_RATE_LIMIT'
          ? 'محاولات كثيرة لتسجيل الدخول. حاول بعد 15 دقيقة.'
          : message === 'OFFLINE_LOGIN_NOT_ENROLLED'
          ? 'لا يمكن تسجيل الدخول أوفلاين قبل تسجيل الدخول مرة واحدة بالإنترنت على هذا الجهاز.'
          : message === 'OFFLINE_LOGIN_EXPIRED'
          ? 'انتهت صلاحية الدخول دون اتصال. يلزم الاتصال بالخادم لتجديد الجلسة.'
          : message.startsWith('AUTH_HTTP_')
          ? 'تعذر إكمال تسجيل الدخول من خادم PostgreSQL (رمز '+message.slice(10)+').'
          : message === 'LOCAL_SERVER_NOT_CONFIGURED'
          ? 'لم يتم تعريف خادم PostgreSQL. افتح إعداد الاتصال وحدد عنوان الخادم ورمز الربط.'
          : message.includes('401') || message.includes('403')
            ? 'خادم PostgreSQL رفض الاتصال. تحقق من رمز الربط والصلاحيات.'
            : 'تعذر الوصول إلى خادم PostgreSQL خلال المهلة المحددة. تحقق من اتصال الإنترنت ورابط HTTPS وتشغيل الخادم الرئيسي.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans text-right" dir="rtl">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex justify-center mb-6 text-blue-600">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-1">تسجيل الدخول للنظام</h2>
        <p className="text-center text-slate-500 mb-5 text-xs">برنامج مطبعة ومكتبة لبنان — PostgreSQL</p>
        {directoryNotice && (
          <div role="status" className="mb-4 p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200">
            {directoryNotice}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم أو البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="text" required dir="ltr" value={identifier} onChange={event => setIdentifier(event.target.value)}
                autoComplete="username" placeholder="اسم المستخدم أو البريد" className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="password" required dir="ltr" value={password} onChange={event => setPassword(event.target.value)}
                autoComplete="current-password" className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-70 text-sm">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? 'جارٍ التحقق من الحساب...' : 'تسجيل الدخول'}
          </button>
        </form>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
          <WifiOff className="w-4 h-4" /><span>{secureLoginEnabled() ? 'دخول PostgreSQL آمن — يدعم فتح الحساب دون اتصال بعد التفعيل الأول' : 'يتم تسجيل الدخول من خلال نظام المستخدمين الخاص بالبرنامج'}</span>
        </div>
        {!secureLoginEnabled() && <button type="button" className="mt-4 w-full text-center text-sm text-blue-700 underline"
          onClick={() => {
            // Clear pairing details only; do not erase saved invoices, users or offline outbox.
            localStorage.removeItem('lobnan_local_sync_server_url');
            localStorage.removeItem('lobnan_local_sync_device_token');
            window.location.reload();
          }}>إعادة إعداد الاتصال بالخادم</button>}
      </div>
    </div>
  );
};
