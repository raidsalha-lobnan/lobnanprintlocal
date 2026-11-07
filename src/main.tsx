import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { enforceArabicNumeralsGlobally } from './utils/numberFormat';
import './index.css';

// Register Service Worker for full Offline PWA capability in production builds
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// تفعيل الحظر الصارم للأرقام الهندية واعتماد الأرقام العربية 0-9 بغض النظر عن الجهاز أو لغة المتصفح
enforceArabicNumeralsGlobally();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="حدث خطأ في واجهة البرنامج">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
