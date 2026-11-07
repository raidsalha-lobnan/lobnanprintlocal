import React, { useState, useEffect } from 'react';
import { auth, db, GoogleAuthProvider, signInWithPopup, collection, getDocs } from '../firebase';
import { Lock, Mail, KeyRound, LogIn, AlertCircle, RefreshCw } from 'lucide-react';
import type { SystemUser } from '../types';
import {
  cacheSavedUsers,
  fetchUsersFromLocalServer,
  findSavedUser,
  getCurrentWorkspace,
  isTrustedOfflineCache,
  readCachedUsers
} from '../services/savedUserDirectory';

const LOCAL_POSTGRES = import.meta.env.VITE_SYNC_BACKEND === 'local-postgres';

// Legacy Firebase configurations may point to retired or unreachable projects.
// Never leave the login spinner waiting indefinitely for an inaccessible server.
function withDeadline<T>(operation: Promise<T>, timeoutMs = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('LOGIN_DIRECTORY_TIMEOUT')), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}


export const LoginView: React.FC<{ onLocalLogin?: (id: string) => void }> = ({ onLocalLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [directoryNotice, setDirectoryNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<SystemUser[]>(readCachedUsers);

  // The old page skipped PostgreSQL entirely, then attempted Firebase on every
  // failed login. Read the paired canonical workspace before authenticating.
  useEffect(() => {
    let mounted = true;
    const loadSavedUsers = async () => {
      try {
        if (LOCAL_POSTGRES) {
          const users = await fetchUsersFromLocalServer();
          if (!mounted) return;
          cacheSavedUsers(users, getCurrentWorkspace());
          setAvailableUsers(users);
          setDirectoryNotice(users.length ? '' : 'قاعدة PostgreSQL متصلة ولكنها لا تحتوي على حسابات مستخدمين. يلزم نقل الحسابات المحفوظة أو إعدادها بصلاحيات صحيحة قبل الدخول.');
          return;
        }
        const snap = await withDeadline(getDocs(collection(db, 'users')));
        if (!mounted) return;
        const users = snap.docs.map(doc => doc.data()).filter(
          (user): user is SystemUser =>
            !!user && typeof user.id === 'string' &&
            (user.status === 'active' || user.status === 'inactive')
        );
        if (users.length) {
          cacheSavedUsers(users);
          setAvailableUsers(users);
        }
      } catch (err) {
        if (mounted) {
          setDirectoryNotice(LOCAL_POSTGRES
            ? 'تعذر الاتصال بخادم المستخدمين. يمكن الدخول دون إنترنت فقط للحسابات التي سبق تحميلها من مساحة العمل نفسها.'
            : 'تعذر تحديث المستخدمين من Firebase. الحسابات المحفوظة في هذا المتصفح فقط هي المتاحة حاليًا.');
        }
      }
    };
    void loadSavedUsers();
    return () => { mounted = false; };
  }, []);

  const completeLogin = (user: SystemUser, authType: 'local' | 'firebase') => {
    const sessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    // Legacy client-side session is for staging/local use; production needs a
    // server-issued authenticated session and server-enforced permissions.
    const { password: _password, ...publicUser } = user;
    localStorage.setItem('active_session_id', sessionId);
    localStorage.setItem('auth_type', authType);
    localStorage.setItem('alnoor_press_accounting_v1_current_user_id', user.id);
    localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(publicUser));
    localStorage.setItem('alnoor_press_accounting_v1_logged_in_user_id', user.id);
    localStorage.setItem('alnoor_press_accounting_v1_session_admin', user.roleId === 'role-admin' ? 'true' : 'false');
    if (onLocalLogin) onLocalLogin(user.id);
    else window.location.reload();
  };

  const handleGoogleSignIn = async () => {
    if (LOCAL_POSTGRES) {
      setError('دخول Google غير متاح مع خادم PostgreSQL المحلي. استخدم حسابًا محفوظًا على الخادم وكلمة مروره.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const googleEmail = result.user.email?.trim().toLowerCase();
      if (!googleEmail) throw new Error('لم يقدم Google عنوان بريد يمكن التحقق منه.');
      let users = availableUsers;
      let matched = users.find(u =>
        u.status === 'active' &&
        [u.email, u.username].some(value => typeof value === 'string' && value.trim().toLowerCase() === googleEmail)
      );
      if (!matched) {
        const snap = await withDeadline(getDocs(collection(db, 'users')));
        users = snap.docs.map(doc => doc.data() as SystemUser).filter(
          user => user && typeof user.id === 'string'
        );
        if (users.length) {
          cacheSavedUsers(users);
          setAvailableUsers(users);
        }
        matched = users.find(u =>
          u.status === 'active' &&
          [u.email, u.username].some(value => typeof value === 'string' && value.trim().toLowerCase() === googleEmail)
        );
      }
      if (!matched) {
        setError('حساب Google موثّق، ولكنه غير مسجل كمستخدم نشط في قاعدة البرنامج. اطلب من مسؤول النظام إضافته.');
        return;
      }
      // Never create an admin from the email contents or fall back to a default
      // owner when Google login fails.
      completeLogin(matched, 'firebase');
    } catch (err) {
      setError('فشل تسجيل الدخول بواسطة Google. تأكد من تفعيل نطاق الموقع في إعدادات Firebase ومن وجود حسابك في المستخدمين.');
      console.warn('Google login error', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLocalSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      let users = readCachedUsers();
      if (LOCAL_POSTGRES) {
        try {
          // Re-read on every login; recently added/disabled remote users must
          // take precedence over potentially stale browser storage.
          users = await fetchUsersFromLocalServer();
          cacheSavedUsers(users, getCurrentWorkspace());
          setAvailableUsers(users);
          setDirectoryNotice('');
        } catch (err) {
          if (!isTrustedOfflineCache()) {
            setError('لا يمكن التحقق من المستخدمين: خادم PostgreSQL غير متصل، ولا توجد نسخة موثوقة للحسابات على هذا الجهاز. افحص عنوان الخادم ثم أعد المحاولة.');
            return;
          }
          users = readCachedUsers();
          setDirectoryNotice('الدخول دون إنترنت من حساب محفوظ سابقًا على هذا الجهاز؛ لا يعد اعتمادًا جديدًا للصلاحيات على الخادم.');
        }
        if (!users.length) {
          setError('لا يوجد أي حساب مستخدم محفوظ على خادم PostgreSQL. يجب استيراد المستخدمين من النظام السابق أو إعدادهم على الخادم أولًا.');
          return;
        }
      } else {
        const existing = findSavedUser(users, email, password);
        if (!existing) {
          try {
            const snap = await withDeadline(getDocs(collection(db, 'users')));
            const cloudUsers = snap.docs.map(doc => doc.data() as SystemUser).filter(
              user => user && typeof user.id === 'string'
            );
            if (cloudUsers.length) {
              users = cloudUsers;
              cacheSavedUsers(users);
              setAvailableUsers(users);
            }
          } catch (err) {
            console.warn('Unable to refresh saved users', err);
          }
        }
      }
      const matched = findSavedUser(users, email, password);
      if (!matched) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحين، أو الحساب معطل/لا يملك كلمة مرور محفوظة. راجع مسؤول النظام لاستعادة الحساب.');
        return;
      }
      // Firebase signOut and Firestore userSessions must not block PostgreSQL
      // logins. The previous early return left the button spinning forever.
      if (!LOCAL_POSTGRES) void auth.signOut().catch(() => {});
      completeLogin(matched, 'local');
    } catch (err) {
      console.warn('Saved user login failed', err);
      setError('تعذر إكمال تسجيل الدخول. تحقق من اتصال الخادم وإعدادات المستخدمين ثم أعد المحاولة.');
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

        <h2 className="text-2xl font-bold text-center text-slate-800 mb-1">
          تسجيل الدخول للنظام
        </h2>
        <p className="text-center text-slate-500 mb-6 text-xs">
          برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان
        </p>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl flex items-start gap-2 border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {directoryNotice && (
          <div role="status" className="mb-4 p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200">
            {directoryNotice}
          </div>
        )}

        <form onSubmit={handleLocalSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم أو البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left outline-none font-mono"
                placeholder="اسم المستخدم أو الإيميل"
                dir="ltr"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left outline-none font-mono"
                placeholder="••••••••"
                dir="ltr"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 mt-4 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>تسجيل الدخول للموظفين والمستخدمين</span>
          </button>



          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-semibold">أو للمدير فقط</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || LOCAL_POSTGRES}
            className="w-full py-2.5 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed shadow-xs cursor-pointer text-sm"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>{LOCAL_POSTGRES ? 'دخول Google غير متاح في وضع PostgreSQL' : 'دخول المدير عبر Google'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
