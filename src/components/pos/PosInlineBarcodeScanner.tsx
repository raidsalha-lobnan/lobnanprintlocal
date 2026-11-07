import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  ScanLine,
  GripHorizontal,
  Tv,
  Minus
} from 'lucide-react';
import { posSound } from '../../utils/audio';
import { InventoryItem } from '../../types';
import { matchItemByBarcode } from '../../utils/barcodeGenerator';

interface PosInlineBarcodeScannerProps {
  isActive?: boolean;
  onScan?: (barcode: string) => void;
  onDetected?: (barcode: string) => void;
  onClose?: () => void;
  onOpenFullModal?: () => void;
  className?: string;
  inventory?: InventoryItem[];
}

export const PosInlineBarcodeScanner: React.FC<PosInlineBarcodeScannerProps> = ({
  isActive = true,
  onScan,
  onDetected,
  onClose,
  onOpenFullModal,
  className = '',
  inventory
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [isCodeNotFound, setIsCodeNotFound] = useState<boolean>(false);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [browserPipSupported, setBrowserPipSupported] = useState(false);

  // Floating PiP Dragging State
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0
  });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isCooldownRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const isStartingRef = useRef<boolean>(false);
  const containerId = 'pos-inline-camera-viewport';

  // Check browser native PiP capability
  useEffect(() => {
    if (typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled) {
      setBrowserPipSupported(true);
    }
  }, []);

  // Store latest callbacks in refs to avoid restarting scanner on callback updates
  const onScanRef = useRef(onScan);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onScanRef.current = onScan;
    onDetectedRef.current = onDetected;
  });

  const handleBarcodeDecoded = useCallback((rawCode: string) => {
    if (isCooldownRef.current) return;
    const code = rawCode.trim();
    if (!code) return;

    isCooldownRef.current = true;
    setLastScannedCode(code);

    const exists = inventory ? inventory.some(i => matchItemByBarcode(i, code)) : true;
    setIsCodeNotFound(!exists);

    if (exists) {
      posSound.beep();
    } else {
      posSound.error();
    }

    if (onScanRef.current) {
      onScanRef.current(code);
    } else if (onDetectedRef.current) {
      onDetectedRef.current(code);
    }

    // 1.2 second cooldown between camera scans to prevent double scanning
    setTimeout(() => {
      isCooldownRef.current = false;
    }, 1200);
  }, [inventory]);

  const stopScannerInternal = useCallback(async () => {
    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch (e) {
        console.warn('Silent notice stopping inline camera:', e);
      }
    }
    if (isMountedRef.current) {
      setIsScanning(false);
      setTorchOn(false);
    }
  }, []);

  const startScanner = useCallback(async (cameraIdToUse?: string) => {
    if (!isMountedRef.current) return;
    if (isStartingRef.current) return;

    isStartingRef.current = true;
    setIsInitializing(true);
    setCameraError(null);

    // 1. Clean up any existing scanner instance first
    await stopScannerInternal();

    if (!isMountedRef.current) {
      isStartingRef.current = false;
      setIsInitializing(false);
      return;
    }

    // 2. Ensure container is mounted and ready
    let containerEl = document.getElementById(containerId);
    let attempts = 0;
    while ((!containerEl || !containerEl.isConnected) && attempts < 15) {
      await new Promise((r) => setTimeout(r, 60));
      if (!isMountedRef.current) {
        isStartingRef.current = false;
        setIsInitializing(false);
        return;
      }
      containerEl = document.getElementById(containerId);
      attempts++;
    }

    if (!containerEl) {
      isStartingRef.current = false;
      setIsInitializing(false);
      setCameraError('لم يتم العثور على شاشة الكاميرا في واجهة الصفحة');
      return;
    }

    try {
      // Initialize Html5Qrcode with all standard barcode formats + native accelerated BarcodeDetector
      const html5QrCode = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX
        ],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      scannerRef.current = html5QrCode;

      // Ultra-fast and clear scanning configuration:
      // Full frame decoder without box limits for instant scanning anywhere
      const scanConfig = {
        fps: 26,
        disableFlip: false,
        videoConstraints: {
          focusMode: 'continuous',
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        }
      };

      let started = false;

      // Priority 1: User-selected camera if specified
      if (cameraIdToUse) {
        try {
          await html5QrCode.start(
            cameraIdToUse,
            scanConfig,
            handleBarcodeDecoded,
            () => {}
          );
          started = true;
        } catch (camErr) {
          console.warn('Selected cameraId failed, trying fallbacks...', camErr);
        }
      }

      // Priority 2: Back/Environment camera (ideal for mobile/tablets & external barcode cameras)
      if (!started && isMountedRef.current) {
        try {
          await html5QrCode.start(
            { facingMode: 'environment' },
            scanConfig,
            handleBarcodeDecoded,
            () => {}
          );
          started = true;
        } catch (envErr) {
          console.warn('FacingMode environment failed, trying user camera...', envErr);
          // Priority 3: Front/User camera (laptops, all-in-one POS terminals)
          if (isMountedRef.current) {
            try {
              await html5QrCode.start(
                { facingMode: 'user' },
                scanConfig,
                handleBarcodeDecoded,
                () => {}
              );
              started = true;
            } catch (userErr) {
              console.warn('FacingMode user failed, trying camera devices list...', userErr);
              // Priority 4: Device enumeration fallback
              const devices = await Html5Qrcode.getCameras().catch(() => []);
              if (devices && devices.length > 0 && isMountedRef.current) {
                await html5QrCode.start(
                  devices[0].id,
                  scanConfig,
                  handleBarcodeDecoded,
                  () => {}
                );
                started = true;
              } else {
                throw userErr || envErr || new Error('لم يتم العثور على أي كاميرا صالحة للاستخدام');
              }
            }
          }
        }
      }

      if (started && isMountedRef.current) {
        setIsScanning(true);
        setCameraError(null);

        // Check torch (flashlight) support
        try {
          // @ts-ignore
          const capabilities = html5QrCode.getRunningTrackCapabilities?.();
          if (capabilities && 'torch' in capabilities) {
            setTorchSupported(true);
          }
        } catch {
          setTorchSupported(false);
        }

        // Fetch cameras list in background to populate selector
        Html5Qrcode.getCameras()
          .then((devs) => {
            if (devs && devs.length > 0 && isMountedRef.current) {
              setAvailableCameras(
                devs.map((d, i) => ({
                  id: d.id,
                  label: d.label || `كاميرا ${i + 1}`
                }))
              );
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Camera startup error:', err);
      const errMsg = err?.message || String(err || '');
      if (errMsg.includes('Permission') || errMsg.includes('NotAllowedError')) {
        setCameraError('لم يتم منح إذن الوصول إلى الكاميرا. يرجى الضغط على أيقونة الكاميرا في شريط عنوان المتصفح والسماح بالكاميرا.');
      } else if (errMsg.includes('NotFound') || errMsg.includes('DevicesNotFoundError')) {
        setCameraError('لم يتم العثور على كاميرا متصلة بالجهاز.');
      } else if (errMsg.includes('NotReadableError') || errMsg.includes('TrackStartError')) {
        setCameraError('الكاميرا مشغولة بواسطة تطبيق آخر. يرجى إغلاق التطبيقات الأخرى والمحاولة ثانية.');
      } else {
        setCameraError(`تعذر تشغيل الكاميرا: ${errMsg.substring(0, 75)}`);
      }
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false);
      }
      isStartingRef.current = false;
    }
  }, [handleBarcodeDecoded, stopScannerInternal]);

  // Toggle Torch (Flashlight)
  const toggleTorch = async () => {
    if (!scannerRef.current || !torchSupported) return;
    try {
      const nextState = !torchOn;
      // @ts-ignore
      await scannerRef.current.applyVideoConstraints({
        // @ts-ignore
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Toggle Browser Native PiP (Picture-in-Picture)
  const toggleBrowserPip = async () => {
    try {
      const videoEl = document.querySelector(`#${containerId} video`) as HTMLVideoElement | null;
      if (!videoEl) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoEl.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('Browser PiP failed:', err);
    }
  };

  // Mouse & Touch Dragging Handlers
  const handleDragStart = (clientX: number, clientY: number) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    isDraggingRef.current = true;
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initX: rect.left,
      initY: rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input, a')) return;
    handleDragStart(e.clientX, e.clientY);

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartRef.current.startX;
      const dy = ev.clientY - dragStartRef.current.startY;
      const maxX = Math.max(10, window.innerWidth - 200);
      const maxY = Math.max(10, window.innerHeight - 80);
      const newX = Math.max(10, Math.min(maxX, dragStartRef.current.initX + dx));
      const newY = Math.max(10, Math.min(maxY, dragStartRef.current.initY + dy));
      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input, a')) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    handleDragStart(t.clientX, t.clientY);

    const onTouchMove = (ev: TouchEvent) => {
      if (!isDraggingRef.current || ev.touches.length !== 1) return;
      const touch = ev.touches[0];
      const dx = touch.clientX - dragStartRef.current.startX;
      const dy = touch.clientY - dragStartRef.current.startY;
      const maxX = Math.max(10, window.innerWidth - 200);
      const maxY = Math.max(10, window.innerHeight - 80);
      const newX = Math.max(10, Math.min(maxX, dragStartRef.current.initX + dx));
      const newY = Math.max(10, Math.min(maxY, dragStartRef.current.initY + dy));
      setPosition({ x: newX, y: newY });
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (isActive) {
      // Immediate direct start
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          startScanner(selectedCameraId || undefined);
        }
      }, 40);

      return () => {
        clearTimeout(timer);
        stopScannerInternal();
      };
    } else {
      stopScannerInternal();
    }
  }, [isActive, selectedCameraId, startScanner, stopScannerInternal]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopScannerInternal();
    };
  }, [stopScannerInternal]);

  if (!isActive) return null;

  return (
    <>
      {/* Scoped CSS to enforce crystal-clear, full-bleed video fitting without distorting */}
      <style>{`
        #${containerId} {
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          overflow: hidden !important;
          border-radius: 0.75rem !important;
        }
        #${containerId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 0.75rem !important;
          display: block !important;
        }
        #${containerId} canvas {
          display: none !important;
        }
      `}</style>

      {/* When Minimized: Sleek Floating PiP Pill */}
      {isMinimized ? (
        <div
          ref={cardRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={position ? { position: 'fixed', left: `${position.x}px`, top: `${position.y}px` } : undefined}
          className={`${position ? '' : 'fixed bottom-5 left-5'} z-[100] cursor-grab active:cursor-grabbing select-none`}
          dir="rtl"
        >
          <div className="bg-slate-900/95 text-white border-2 border-emerald-500 rounded-full px-3.5 py-1.5 shadow-2xl flex items-center gap-2.5 backdrop-blur-md hover:border-emerald-400 transition-all">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <Camera className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold font-sans">كاميرا PiP نشطة</span>

            {lastScannedCode && (
              isCodeNotFound ? (
                <span className="font-mono text-[11px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-700 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                  <span>غير موجود: {lastScannedCode}</span>
                </span>
              ) : (
                <span className="font-mono text-[11px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{lastScannedCode}</span>
                </span>
              )
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              title="تكبير واستعراض نافذة الكاميرا"
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white cursor-pointer transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="إغلاق الكاميرا"
                className="p-1 hover:bg-rose-900/70 rounded-full text-rose-300 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Floating Out Picture-in-Picture (PiP) Window */
        <div
          ref={cardRef}
          style={position ? { position: 'fixed', left: `${position.x}px`, top: `${position.y}px` } : undefined}
          className={`${position ? '' : 'fixed bottom-5 left-5'} z-[100] bg-slate-900/95 text-white rounded-2xl border-2 border-emerald-500/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md p-2.5 flex flex-col gap-2 transition-all select-none ${
            isExpanded ? 'w-[440px] sm:w-[500px]' : 'w-[320px] sm:w-[360px]'
          } ${className}`}
          dir="rtl"
        >
          {/* 1. Header Controls Bar (Draggable) */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className="flex items-center justify-between text-xs pb-2 border-b border-slate-700/80 cursor-grab active:cursor-grabbing gap-2"
          >
            <div className="flex items-center gap-2 font-bold min-w-0">
              <GripHorizontal className="w-4 h-4 text-slate-400 hover:text-slate-200 shrink-0" />
              <div className="relative shrink-0">
                <Camera className="w-4 h-4 text-emerald-400 animate-pulse" />
                {isScanning && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-white font-black text-xs sm:text-sm tracking-tight whitespace-nowrap">
                  كاميرا الباركود (PiP)
                </span>
              </div>

              {isScanning ? (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/40 font-bold flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  مباشر
                </span>
              ) : isInitializing ? (
                <span className="bg-blue-500/20 text-blue-300 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/40 font-bold flex items-center gap-1 shrink-0">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
                  جاري التشغيل...
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Flashlight toggle button */}
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  title={torchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}
                  className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                    torchOn
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                      : 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Native OS Picture-in-Picture Button */}
              {browserPipSupported && (
                <button
                  type="button"
                  onClick={toggleBrowserPip}
                  title="فتح في نافذة عائمة خارجية على مستوى النظام (Picture-in-Picture)"
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sky-400 cursor-pointer transition-colors"
                >
                  <Tv className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Camera selector if multiple cameras exist */}
              {availableCameras.length > 1 && (
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="bg-slate-800 border border-slate-600 text-slate-200 text-[11px] rounded-lg px-1.5 py-1 cursor-pointer font-sans max-w-[85px] truncate"
                  title="تبديل الكاميرا"
                >
                  {availableCameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Full Modal Switcher if available */}
              {onOpenFullModal && (
                <button
                  type="button"
                  onClick={onOpenFullModal}
                  title="تكبير إلى نافذة حوار كاملة"
                  className="p-1.5 bg-blue-900/60 hover:bg-blue-700 border border-blue-600 text-blue-200 rounded-lg text-xs cursor-pointer transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Minimize to Floating Pill */}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                title="تصغير إلى شريط عائم صغير"
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 cursor-pointer transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              {/* Toggle Size (Normal PiP vs Expanded PiP) */}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'حجم مدمج' : 'حجم عريض'}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 cursor-pointer transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              {/* Refresh Camera */}
              <button
                type="button"
                onClick={() => startScanner(selectedCameraId || undefined)}
                title="إعادة تشغيل الكاميرا"
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* Close Button */}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  title="إغلاق الكاميرا"
                  className="p-1.5 hover:bg-rose-900/70 rounded-lg text-rose-300 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Last scanned code status badge in PiP */}
          {lastScannedCode && (
            <div className="flex items-center justify-between px-1">
              {isCodeNotFound ? (
                <div className="w-full font-mono text-xs bg-rose-950/90 text-rose-200 px-2.5 py-1 rounded-lg border border-rose-600 font-bold flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-1.5 truncate">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>الصنف غير موجود: [{lastScannedCode}]</span>
                  </div>
                  <span className="text-[10px] text-rose-300 font-sans">تنبيه</span>
                </div>
              ) : (
                <div className="w-full font-mono text-xs bg-emerald-950/90 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-600 font-bold flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-1.5 truncate">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>تم قراءة: {lastScannedCode}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-sans">ناجح</span>
                </div>
              )}
            </div>
          )}

          {/* 2. Error message notification if camera access fails */}
          {cameraError && (
            <div className="bg-amber-950/90 border border-amber-500 text-amber-200 p-2 rounded-lg text-xs flex items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] leading-snug">{cameraError}</span>
              </div>
              <button
                type="button"
                onClick={() => startScanner(selectedCameraId || undefined)}
                className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-[11px] cursor-pointer shrink-0"
              >
                إعادة
              </button>
            </div>
          )}

          {/* 3. Camera Viewport & Full-Frame Scanner Overlay */}
          <div
            className={`relative rounded-xl overflow-hidden bg-black border border-slate-700 shadow-inner flex flex-col justify-center items-center transition-all duration-200 ${
              isExpanded ? 'h-[280px] sm:h-[320px]' : 'h-[190px] sm:h-[220px]'
            }`}
          >
            {/* The DOM element where Html5Qrcode injects the video stream */}
            <div
              id={containerId}
              className="w-full h-full flex justify-center items-center overflow-hidden"
            />

            {/* Not Found Warning Overlay in Camera */}
            {lastScannedCode && isCodeNotFound && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-rose-600/95 text-white px-3 py-1 rounded-xl shadow-xl border border-rose-300 flex items-center gap-1.5 animate-bounce">
                <AlertTriangle className="w-3.5 h-3.5 text-white shrink-0" />
                <div className="text-center">
                  <span className="font-black text-[11px]">الصنف غير موجود</span>
                  <span className="text-[10px] font-mono opacity-90 mr-1">[{lastScannedCode}]</span>
                </div>
              </div>
            )}

            {/* Dynamic laser scanning line traversing the entire frame */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                {/* Full-width laser beam */}
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-scan-laser" />

                {/* Corner boundary markings to frame full camera area */}
                <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-emerald-400/80 rounded-tr" />
                <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-emerald-400/80 rounded-tl" />
                <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-emerald-400/80 rounded-br" />
                <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-emerald-400/80 rounded-bl" />
              </div>
            )}

            {/* Loading overlay while camera initializes */}
            {isInitializing && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20">
                <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                <span className="text-white text-xs font-bold">جاري فتح الكاميرا وتجهيز المسح المباشر...</span>
              </div>
            )}

            {/* Bottom helper badge: Highlights full-frame scanning without square restriction */}
            <div className="absolute inset-x-0 bottom-1.5 flex justify-center pointer-events-none z-10 px-2">
              <span className="bg-slate-950/85 text-[10px] text-emerald-300 px-2.5 py-0.5 rounded-full backdrop-blur-xs font-bold shadow-lg border border-emerald-500/50 flex items-center gap-1.5">
                <ScanLine className="w-3 h-3 text-emerald-400" />
                <span>مسح مباشر وشامل على كامل الكاميرا</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
