import './sync-next/installDesktopNetworkBridge';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { enforceArabicNumeralsGlobally } from './utils/numberFormat';
import './index.css';
import {initializeActiveDrafts,activeDraftNeedsAttention} from './services/localActiveDrafts';
import {applyWebDisplayScale,readWebDisplayScale} from './utils/webDisplayScale';

applyWebDisplayScale(readWebDisplayScale());

// Register Service Worker for full Offline PWA capability in production builds
if (location.protocol!=='file:' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// تفعيل الحظر الصارم للأرقام الهندية واعتماد الأرقام العربية 0-9 بغض النظر عن الجهاز أو لغة المتصفح
enforceArabicNumeralsGlobally();

window.addEventListener('beforeunload',event=>{if(activeDraftNeedsAttention()){event.preventDefault();event.returnValue='';}});
async function start(){
  try{await initializeActiveDrafts();}catch(error){console.warn('Durable draft recovery unavailable; legacy copy retained',error);}
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="حدث خطأ في واجهة البرنامج">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

}
void start();
