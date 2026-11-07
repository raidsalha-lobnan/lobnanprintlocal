import React, { useState, useEffect } from 'react';
import { Download, MonitorSmartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect standalone mode (already installed)
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as unknown as { standalone?: boolean })?.standalone === true;
    setIsInstalled(!!isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator?.userAgent?.toLowerCase() || '';
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.error('PWA install prompt error:', err);
    }
  };

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (deferredPrompt) {
    return (
      <button
        onClick={handleInstall}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 text-xs font-bold shadow-xs hover:bg-indigo-600/40 transition cursor-pointer"
        title="تثبيت التطبيق على جهازك للعمل بدون متصفح وأوفلاين"
      >
        <Download className="w-3.5 h-3.5" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  // iOS Safari flow (only show if not standalone)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
          title="تثبيت التطبيق على الآيفون والآيباد"
        >
          <MonitorSmartphone className="w-3.5 h-3.5 text-blue-400" />
          <span>تثبيت للايفون</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" dir="rtl">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-right">
              <h3 className="text-base font-bold text-white mb-2">تثبيت التطبيق على الآيفون / الآيباد</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                1. اضغط على زر <strong>المشاركة (Share <span className="text-blue-400">⎙</span>)</strong> في شريط أدوات سفاري.<br />
                2. مرر للأسفل واضغط على <strong>إضافة للشاشة الرئيسية (Add to Home Screen)</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
