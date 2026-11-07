import React, { useState, useEffect } from 'react';
import { auth, db, GoogleAuthProvider, signInWithPopup, collection, getDocs, doc, setDoc } from '../firebase';
import { Lock, Mail, KeyRound, LogIn, AlertCircle, UserCheck, RefreshCw } from 'lucide-react';
import { DEFAULT_SYSTEM_USERS } from '../data/defaultCompanyBranchUserData';
import { SystemUser } from '../types';

export const LoginView: React.FC<{ onLocalLogin?: (id: string) => void }> = ({ onLocalLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<SystemUser[]>(() => {
    try {
      const local = localStorage.getItem('alnoor_press_accounting_v1_users');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_SYSTEM_USERS;
    } catch {
      return DEFAULT_SYSTEM_USERS;
    }
  });

  // Load users strictly from Firestore on mount so real saved users from database are available immediately
  useEffect(() => {
    let isMounted = true;
    const loadCloudUsers = async () => {
      try {
        if (import.meta.env.VITE_SYNC_BACKEND === 'local-postgres') return;
        const snap = await getDocs(collection(db, 'users'));
        if (!snap.empty && isMounted) {
          const cloudUsers: SystemUser[] = snap.docs.map(d => d.data() as SystemUser).filter(u => u && u.id);
          if (cloudUsers.length > 0) {
            setAvailableUsers(cloudUsers);
            localStorage.setItem('alnoor_press_accounting_v1_users', JSON.stringify(cloudUsers));
          }
        }
      } catch (err) {
        console.warn('Could not fetch cloud users on login mount:', err);
      }
    };
    loadCloudUsers();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleQuickLogin = async (user: SystemUser) => {
    setLoading(true);
    try {
      await auth.signOut();
    } catch {}

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    localStorage.setItem('active_session_id', sessionId);
    localStorage.setItem('auth_type', 'local');
    localStorage.setItem('alnoor_press_accounting_v1_current_user_id', user.id);
    localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(user));

    try {
      await setDoc(doc(db, 'userSessions', user.id), { sessionId, timestamp: Date.now() });
    } catch (e) {}

    if (onLocalLogin) {
      onLocalLogin(user.id);
    } else {
      window.location.reload();
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      if (res.user && res.user.email) {
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        const userEmail = res.user.email.toLowerCase().trim();

        // Match user by email in availableUsers or query cloud
        let matched = availableUsers.find(u => 
          (u.email || '').toLowerCase().trim() === userEmail ||
          (u.username || '').toLowerCase().trim() === userEmail ||
          (u.email || '').toLowerCase().trim().split('@')[0] === userEmail.split('@')[0]
        ) || DEFAULT_SYSTEM_USERS.find(u =>
          (u.email || '').toLowerCase().trim() === userEmail ||
          (u.username || '').toLowerCase().trim() === userEmail
        );

        if (!matched) {
          try {
            const snap = await getDocs(collection(db, 'users'));
            if (!snap.empty) {
              const cloudUsers: SystemUser[] = snap.docs.map(d => d.data() as SystemUser);
              matched = cloudUsers.find(u => 
                (u.email || '').toLowerCase().trim() === userEmail ||
                (u.username || '').toLowerCase().trim() === userEmail ||
                (u.email || '').toLowerCase().trim().split('@')[0] === userEmail.split('@')[0]
              );
            }
          } catch {}
        }

        const isOwner = userEmail === 'admin@example.invalid' || userEmail === 'press@example.invalid' || userEmail.includes('lobnan') || userEmail.includes('raid');
        const resolvedUserId = matched ? matched.id : (userEmail.includes('lobnan') ? 'user-1789170883526' : 'usr-1');

        localStorage.setItem('active_session_id', sessionId);
        localStorage.setItem('auth_type', 'firebase');
        localStorage.setItem('alnoor_press_accounting_v1_session_admin', isOwner ? 'true' : 'false');
        localStorage.setItem('alnoor_press_accounting_v1_logged_in_user_id', resolvedUserId);
        localStorage.setItem('alnoor_press_accounting_v1_current_user_id', resolvedUserId);
        if (matched) {
          localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(matched));
        }

        try {
          await setDoc(doc(db, 'userSessions', res.user.email.toLowerCase()), { sessionId, timestamp: Date.now() });
        } catch (e) {}

        if (onLocalLogin) {
          onLocalLogin(resolvedUserId);
        } else {
          window.location.reload();
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('فشل تسجيل الدخول. لا يمكن تجاوز المصادقة تلقائياً.');
    }
  };

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Sign out of any background Google auth session to prevent session mismatches
    try {
      await auth.signOut();
    } catch {}

    const cleanInput = email.trim();
    const cleanPassword = password.trim();

    const normalize = (s?: string) => {
      if (!s) return '';
      return s.trim().toLowerCase()
        .split('@')[0]
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\s_.-]+/g, '');
    };

    const isUserMatch = (u: SystemUser): boolean => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uUsername = (u.username || '').toLowerCase().trim();
      const uFullName = (u.fullName || '').toLowerCase().trim();
      const cleanLower = cleanInput.toLowerCase().trim();
      const normInput = normalize(cleanInput);

      const matchEmail = uEmail === cleanLower || normalize(uEmail) === normInput || uEmail.split('@')[0] === cleanLower;
      const matchUsername = uUsername === cleanLower || normalize(uUsername) === normInput;
      const matchFullName = uFullName === cleanLower || normalize(uFullName) === normInput;
      const matchPhone = u.phone && u.phone.trim().replace(/[\s-]+/g, '') === cleanInput.replace(/[\s-]+/g, '');
      const matchId = u.id === cleanInput;

      // Special aliases for owners
      const isRaidAlias = (cleanLower === 'raid_salha' || cleanLower === 'raid.salha' || cleanLower === 'raidsalha' || cleanLower === 'raid' || cleanLower === 'admin@example.invalid') && (u.id === 'usr-1' || uEmail.includes('raid'));
      const isLobnanAlias = (cleanLower === 'lobnanprint' || cleanLower === 'lobnan' || cleanLower === 'lobnan_print' || cleanLower === 'press@example.invalid') && (u.id === 'user-1789170883526' || uEmail.includes('lobnan'));
      const isOwner = isRaidAlias || isLobnanAlias || u.id === 'usr-1' || u.id === 'user-1789170883526' || uEmail === 'admin@example.invalid' || uEmail === 'press@example.invalid';

      if (!matchEmail && !matchUsername && !matchFullName && !matchPhone && !matchId && !isRaidAlias && !isLobnanAlias) {
        return false;
      }

      const userPass = (u.password || '').trim();
      if (!userPass) {
        return false; // Never accept an embedded fallback password.
      }
      return userPass === cleanPassword;
    };

    // 1. Check in loaded users and default system users
    let matchedUser = availableUsers.find(isUserMatch) || DEFAULT_SYSTEM_USERS.find(isUserMatch);

    // 2. Fallback: Query Firestore collection 'users' directly in case user was just added on another device
    if (!matchedUser) {
      try {
        if (import.meta.env.VITE_SYNC_BACKEND === 'local-postgres') return;
        const snap = await getDocs(collection(db, 'users'));
        if (!snap.empty) {
          const cloudUsers: SystemUser[] = snap.docs.map(d => d.data() as SystemUser);
          matchedUser = cloudUsers.find(isUserMatch);

          if (matchedUser) {
            const updated = [...availableUsers.filter(u => u.id !== matchedUser!.id), matchedUser];
            setAvailableUsers(updated);
            localStorage.setItem('alnoor_press_accounting_v1_users', JSON.stringify(updated));
          }
        }
      } catch (cloudErr) {
        console.warn('Fallback cloud query notice:', cloudErr);
      }
    }

    // 3. Final guarantee for admin@example.invalid
    // No automatic owner login when no user matches.

    setLoading(false);

    if (matchedUser) {
      const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem('active_session_id', sessionId);
      localStorage.setItem('auth_type', 'local');
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', matchedUser.id);
      localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(matchedUser));
      const isUserAdmin = Boolean(
        matchedUser.roleId === 'role-admin' ||
        matchedUser.id === 'usr-1' ||
        matchedUser.id === 'user-1789170883526' ||
        matchedUser.email === 'admin@example.invalid' ||
        matchedUser.email === 'press@example.invalid' ||
        matchedUser.roleName === 'مدير النظام'
      );
      localStorage.setItem('alnoor_press_accounting_v1_session_admin', isUserAdmin ? 'true' : 'false');
      localStorage.setItem('alnoor_press_accounting_v1_logged_in_user_id', matchedUser.id);

      try {
        await setDoc(doc(db, 'userSessions', matchedUser.id), { sessionId, timestamp: Date.now() });
      } catch (e) {}

      if (onLocalLogin) {
        onLocalLogin(matchedUser.id);
      } else {
        window.location.reload();
      }
    } else {
      setError('اسم المستخدم / البريد الإلكتروني أو كلمة المرور غير صحيحة. كلمة المرور الافتراضية للمستخدمين هي 123456.');
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
            disabled={loading}
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
                <span>دخول المدير عبر Google</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
