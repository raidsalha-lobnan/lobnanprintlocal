import React, { useEffect, useState } from 'react';
import { DesktopDownloadButton } from './DesktopDownloadButton';
import { PWAInstallButton } from './PWAInstallButton';
import { DesktopStorageStatus } from './DesktopStorageStatus';
import { DesktopUpdateStatus } from './DesktopUpdateStatus';
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

type RememberedLogin = { identifier: string; password: string };
type DesktopCredentialBridge = {
  isElectron?: boolean;
  rememberLogin?: (value: RememberedLogin) => Promise<boolean>;
  readRememberedLogin?: () => Promise<RememberedLogin | null>;
  forgetLogin?: () => Promise<boolean>;
};
const desktopCredentials = () => (globalThis as unknown as {electronAPI?: DesktopCredentialBridge}).electronAPI;
const passwordCredentialConstructor = () => (globalThis as unknown as {
  PasswordCredential?: new (data: {id: string; password: string}) => Credential
}).PasswordCredential;
async function rememberCredentials(identifier: string, password: string) {
  const desktop = desktopCredentials();
  if (desktop?.isElectron) {
    if (!desktop.rememberLogin) throw Error('DESKTOP_CREDENTIAL_BRIDGE_UNAVAILABLE');
    await desktop.rememberLogin({identifier,password});
    return;
  }
  const Constructor = passwordCredentialConstructor();
  if (!Constructor || !navigator.credentials) throw Error('BROWSER_CREDENTIAL_MANAGER_UNAVAILABLE');
  await navigator.credentials.store(new Constructor({id:identifier,password}));
}


// PostgreSQL-only login entry point; no secondary cloud authentication.
export const LoginView: React.FC<Props> = ({ onLocalLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [directoryNotice, setDirectoryNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [readingSaved, setReadingSaved] = useState(false);
  const isDesktop = Boolean(desktopCredentials()?.isElectron);
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

  const authenticate = async (identifier: string, password: string, shouldRemember: boolean) => {
    if (loading) return;
    setError('');
    setLoading(true);
    const saveIfRequested = async () => {
      if (!shouldRemember) return;
      try { await rememberCredentials(identifier.trim(), password); }
      catch { window.alert(isDesktop ? 'تم التحقق من الحساب، لكن تعذر حفظ بيانات الدخول المشفرة على هذا الجهاز.' : 'تم التحقق من الحساب، لكن تعذر الحفظ تلقائيًا. يمكنك حفظ كلمة المرور من مدير كلمات المرور في Chrome.'); }
    };
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
        // Do not replace the entire saved user directory with the one
        // person who just authenticated. The PostgreSQL directory is
        // reconciled separately after login using actual server permissions.
        setUsers([matched]);
        const {password:_secret,...safeUser}=matched;
        localStorage.setItem('auth_type','postgres');
        localStorage.setItem('alnoor_press_accounting_v1_current_user_id',matched.id);
        localStorage.setItem('alnoor_press_accounting_v1_logged_in_user_id',matched.id);
        localStorage.setItem('alnoor_press_accounting_v1_current_user',JSON.stringify(safeUser));
        localStorage.setItem('alnoor_press_accounting_v1_session_admin','false');
        await saveIfRequested();
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
      await saveIfRequested();
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

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Read native form values so browser password-manager autofill is honored.
    const values = new FormData(event.currentTarget);
    await authenticate(String(values.get('username') || identifier), String(values.get('password') || password), remember);
  };
  const useSavedLogin = async () => {
    if (loading || readingSaved) return;
    setError('');
    setReadingSaved(true);
    try {
      let saved: RememberedLogin | null = null;
      if (isDesktop) {
        const bridge = desktopCredentials();
        if (!bridge?.readRememberedLogin) throw Error('DESKTOP_CREDENTIAL_BRIDGE_UNAVAILABLE');
        saved = await bridge.readRememberedLogin();
      } else if (passwordCredentialConstructor() && navigator.credentials) {
        const credential = await navigator.credentials.get({password:true,mediation:'required'} as CredentialRequestOptions & {password:boolean}) as (Credential & {password?:string}) | null;
        if (credential?.type === 'password' && credential.password) saved = {identifier:credential.id,password:credential.password};
      }
      if (!saved) {
        setError('لا توجد بيانات دخول محفوظة أو لم يتم اختيار حساب. سجّل الدخول أولًا وحدد خيار حفظ بيانات الدخول.');
        return;
      }
      setIdentifier(saved.identifier);
      setPassword(saved.password);
      await authenticate(saved.identifier,saved.password,false);
    } catch {
      setError(isDesktop ? 'تعذر استرجاع بيانات الدخول المحفوظة. أدخل بياناتك يدويًا.' : 'تعذر استرجاع بيانات الدخول. اختر الحساب من مدير كلمات المرور في Chrome أو أدخل بياناتك يدويًا.');
    } finally { setReadingSaved(false); }
  };
  const forgetSavedLogin = async () => {
    try {
      const bridge = desktopCredentials();
      if (!bridge?.forgetLogin) throw Error('DESKTOP_CREDENTIAL_BRIDGE_UNAVAILABLE');
      await bridge.forgetLogin();
      setRemember(false);
      setPassword('');
      setIdentifier('');
      setError('');
      setDirectoryNotice('تم حذف بيانات الدخول المحفوظة من هذا الجهاز.');
    } catch { setError('تعذر حذف بيانات الدخول المحفوظة.'); }
  };

  return (
    <div dir="rtl" className="relative isolate min-h-screen overflow-x-hidden flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-100 to-indigo-200 px-4 py-8 sm:px-8 font-sans text-right">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-sky-300/50 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-[500px] h-[500px] rounded-full bg-indigo-400/30 blur-3xl" />
        <div className="absolute top-[18%] left-[12%] w-48 h-48 rounded-[2rem] rotate-12 border border-white/70 bg-white/20" />
        <div className="absolute bottom-[16%] right-[10%] w-56 h-56 rounded-full border border-white/70 bg-white/20" />
      </div>
      <main className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-7 lg:gap-12 items-center">
        <header className="text-center lg:text-right px-2 lg:px-8">
          <div className="mx-auto lg:mx-0 mb-5 w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-indigo-800 shadow-xl shadow-indigo-700/20 flex items-center justify-center text-white"><Lock className="w-8 h-8" /></div>
          <p className="text-sm font-bold text-indigo-700 mb-2">النظام المحاسبي والإداري المتكامل</p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl leading-[1.45] font-black text-slate-900">برنامج الأيهم المحاسبي</h1>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-indigo-800">مطبعة ومكتبة لبنان</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/55 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"><span className="h-2 w-2 rounded-full bg-indigo-500" /> إدارة وتشغيل: م. رائد صالحة</div>
        </header>
        <section aria-label="تسجيل الدخول" className="w-full max-w-md mx-auto lg:max-w-none rounded-[2rem] border border-white/90 bg-white/65 p-5 sm:p-8 backdrop-blur-xl shadow-[0_24px_80px_rgba(30,64,175,0.14)]">
        <div className="flex justify-center mb-3 text-indigo-700"><div className="w-12 h-12 bg-white/80 rounded-2xl flex items-center justify-center shadow-sm border border-white"><KeyRound className="w-6 h-6" /></div></div>
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-1">مرحبًا بك</h2>
        <p className="text-center text-slate-600 mb-4 text-sm">سجّل الدخول إلى حسابك للمتابعة</p>
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2" aria-label="خيارات تثبيت البرنامج">
          <DesktopDownloadButton />
          <PWAInstallButton />
          <DesktopStorageStatus />
          <DesktopUpdateStatus />
        </div>
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
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" name="username" required dir="ltr" value={identifier} onChange={event => setIdentifier(event.target.value)}
                autoComplete="username" placeholder="اسم المستخدم أو البريد" className="w-full pl-3 pr-9 py-3 text-sm bg-white/80 border border-white rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="password" name="password" required dir="ltr" value={password} onChange={event => setPassword(event.target.value)}
                autoComplete="current-password" className="w-full pl-3 pr-9 py-3 text-sm bg-white/80 border border-white rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} className="accent-indigo-600" disabled={loading || readingSaved} />
            حفظ اسم المستخدم وكلمة المرور على هذا الجهاز
          </label>
          <button type="submit" disabled={loading || readingSaved}
            className="w-full py-3 bg-gradient-to-l from-indigo-700 to-blue-600 hover:from-indigo-800 hover:to-blue-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-70 text-sm">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? 'جارٍ التحقق من الحساب...' : 'تسجيل الدخول'}
          </button>
        </form>
        <button type="button" disabled={loading || readingSaved} onClick={() => void useSavedLogin()} className="mt-3 w-full py-2.5 bg-white/55 border border-indigo-200 text-indigo-700 hover:bg-white rounded-xl font-bold text-sm disabled:opacity-50">
          {readingSaved ? 'جارٍ استرجاع بيانات الدخول...' : 'الدخول بالبيانات المحفوظة'}
        </button>
        {isDesktop ? <button type="button" disabled={loading || readingSaved} onClick={() => void forgetSavedLogin()} className="mt-2 w-full text-xs text-slate-500 underline">حذف بيانات الدخول المحفوظة</button> : <p className="mt-2 text-xs text-slate-500 text-center">يتم الحفظ في مدير كلمات المرور في Chrome حسب إعدادات المتصفح. استخدمه لحذف البيانات المحفوظة.</p>}
        <p className="mt-2 text-xs text-slate-500 text-center">استخدم الحفظ على جهازك الشخصي فقط.</p>
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
        </section>
        <footer className="lg:col-span-2 text-center text-xs text-slate-600">برنامج الأيهم المحاسبي · مطبعة ومكتبة لبنان</footer>
      </main>
    </div>
  );
};
