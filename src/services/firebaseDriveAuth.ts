import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.example.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

export async function authenticateWithGoogleDrive(): Promise<{ token: string; user: { email: string; displayName: string } }> {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error('تعذر استخراج توكن الوصول لحساب Google Drive من نتيجة تسجيل الدخول');
    }

    return {
      token,
      user: {
        email: result.user?.email || 'admin@example.invalid',
        displayName: result.user?.displayName || 'رائد صالحة'
      }
    };
  } catch (error: any) {
    console.error('Error during Google Drive OAuth via Firebase:', error);
    if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('تم إغلاق نافذة ربط Google Drive قبل إكمال منح الصلاحية.');
    }
    if (error?.code === 'auth/popup-blocked') {
      throw new Error('تم حجب النافذة المنبثقة من قبل المتصفح. يرجى السماح بالنوافذ المنبثقة للتطبيق.');
    }
    throw error;
  }
}
