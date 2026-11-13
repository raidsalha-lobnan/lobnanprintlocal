import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { InventoryItem } from '../types';
import { posSound } from '../utils/audio';
import { matchItemByBarcode } from '../utils/barcodeGenerator';
import { BarcodeCameraSession, stopBarcodeVideoStream } from '../utils/barcodeCameraLifecycle';
import {
  Camera,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Barcode,
  Volume2,
  VolumeX,
  Zap,
  Sparkles,
  Info,
  Pause,
  Play
} from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory?: InventoryItem[];
  // Mode: 'pos' (look up and add to cart) or 'input' (capture code for item form)
  mode?: 'pos' | 'input';
  title?: string;
  subtitle?: string;
  onScanItem?: (item: InventoryItem) => void;
  onScanBarcode?: (barcode: string) => void;
  onScanSuccess?: (barcode: string) => void;
  currency?: string;
  currentBarcode?: string;
  autoCloseOnScan?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  inventory = [],
  mode = 'pos',
  title,
  subtitle,
  onScanItem,
  onScanBarcode,
  onScanSuccess,
  currency = 'ر.س',
  currentBarcode,
  autoCloseOnScan = true
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoClose, setAutoClose] = useState(autoCloseOnScan);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [lastScannedItem, setLastScannedItem] = useState<{ item: InventoryItem; time: number } | null>(null);
  const [capturedCode, setCapturedCode] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<InventoryItem | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimestampRef = useRef<number>(0);
  const lastBarcodeRef = useRef<string>('');
  const isProcessingRef = useRef<boolean>(false);
  const cameraSessionRef = useRef(new BarcodeCameraSession());
  const cameraStartPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const cameraStopPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const isOpenRef = useRef(isOpen);
  const closingRef = useRef(false);
  const selectedCameraIdRef = useRef(selectedCameraId);
  const processBarcodeRef = useRef<(code:string)=>void>(()=>{});
  // Updated synchronously without restarting a live webcam on parent re-renders.
  isOpenRef.current = isOpen;
  selectedCameraIdRef.current = selectedCameraId;
  const scannerContainerId = 'app-barcode-scanner-viewport';

  // Sample items for quick test buttons in the modal
  const sampleItems = (inventory || []).slice(0, 5);

  // A paused decoder still holds the physical MediaStream. Always stop
  // the tracks, even if html5-qrcode throws during stop() or clear().
  const releaseCamera = useCallback(async (scanner: Html5Qrcode) => {
    const video = document.getElementById(scannerContainerId)?.querySelector('video');
    const stream = video && typeof MediaStream !== 'undefined' &&
      video.srcObject instanceof MediaStream ? video.srcObject : null;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch (err) {
      console.warn('Barcode camera stop failed, releasing media tracks:', err);
    } finally {
      stopBarcodeVideoStream(stream);
      if (video && video.srcObject === stream) video.srcObject = null;
      try { await scanner.clear(); }
      catch (err) { console.warn('Barcode camera clear failed:', err); }
    }
  }, []);

  // Invalidate any unfinished getCameras()/start() before releasing the camera.
  const stopScanner = useCallback(async () => {
    cameraSessionRef.current.invalidate();
    const scanner = html5QrCodeRef.current;
    html5QrCodeRef.current = null;
    setIsScanning(false);
    setIsPaused(false);
    setTorchOn(false);
    setTorchSupported(false);
    // Serialize releases so a rapid close -> reopen cannot reuse a busy camera.
    const release = cameraStopPromiseRef.current.catch(() => {})
      .then(async () => { if (scanner) await releaseCamera(scanner); });
    cameraStopPromiseRef.current = release;
    await release;
  }, [releaseCamera]);

  const handleClose = useCallback(() => {
    closingRef.current = true;
    void stopScanner();
    onClose();
  }, [onClose, stopScanner]);

  const processBarcode = useCallback((barcodeText: string) => {
    const cleanCode = barcodeText.trim();
    if (!cleanCode) return;

    // Prevent re-entrant calls
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // IMMEDIATELY pause/stop the scanner to prevent repeated readings!
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch {
      // ignore
    }
    setIsPaused(true);

    const now = Date.now();
    lastScanTimestampRef.current = now;
    lastBarcodeRef.current = cleanCode;

    if (mode === 'input') {
      // In Input mode: Capture barcode for the item form
      if (soundEnabled) {
        posSound.playSuccessBeep();
      }
      setCapturedCode(cleanCode);

      // Check if another item in inventory already has this barcode (primary or additional)
      const existing = (inventory || []).find(
        it => matchItemByBarcode(it, cleanCode)
      );
      setDuplicateWarning(existing || null);

      if (onScanBarcode) {
        onScanBarcode(cleanCode);
      } else if (onScanSuccess) {
        onScanSuccess(cleanCode);
      }

      if (autoClose) {
        handleClose(); // Hide immediately; stop physical camera tracks.
      } else {
        isProcessingRef.current = false;
      }
      return;
    }

    // In POS mode: Search inventory by primary barcode, code, or any additional barcode
    const matched = (inventory || []).find(
      it => matchItemByBarcode(it, cleanCode)
    );

    if (matched) {
      if (soundEnabled) {
        posSound.playSuccessBeep();
      }
      setNotFoundBarcode(null);
      setLastScannedItem({ item: matched, time: now });

      // Call ONLY one matching callback to avoid duplicate row creations
      if (onScanItem) {
        onScanItem(matched);
      } else if (onScanBarcode) {
        onScanBarcode(cleanCode);
      } else if (onScanSuccess) {
        onScanSuccess(cleanCode);
      }

      if (autoClose) {
        handleClose(); // Hide immediately; stop physical camera tracks.
      } else {
        isProcessingRef.current = false;
      }
    } else {
      if (soundEnabled) {
        posSound.playErrorBeep();
      }
      setLastScannedItem(null);
      setNotFoundBarcode(cleanCode);

      if (onScanBarcode) {
        onScanBarcode(cleanCode);
      } else if (onScanSuccess) {
        onScanSuccess(cleanCode);
      }

      if (autoClose) {
        handleClose(); // Hide immediately; stop physical camera tracks.
      } else {
        isProcessingRef.current = false;
      }
    }
  }, [inventory, soundEnabled, mode, autoClose, onScanItem, onScanBarcode, onScanSuccess, handleClose]);
  processBarcodeRef.current = processBarcode;

  // Start serially. A previous asynchronous start must finish releasing its
  // webcam before a new open/change-camera attempt can begin.
  const startScanner = useCallback(async (cameraId?: string) => {
    const generation = cameraSessionRef.current.begin();
    const previousStart = cameraStartPromiseRef.current;
    const isCurrent = () => cameraSessionRef.current.isCurrent(generation) &&
      isOpenRef.current && !closingRef.current;
    const startup = (async () => {
      await previousStart.catch(() => {});
      await cameraStopPromiseRef.current.catch(() => {});
      if (!isCurrent()) return;
      let createdScanner: Html5Qrcode | null = null;
      const releaseCreatedScanner = async () => {
        const scanner = createdScanner;
        createdScanner = null;
        if (!scanner) return;
        if (html5QrCodeRef.current === scanner) html5QrCodeRef.current = null;
        await releaseCamera(scanner);
      };
      const onDecoded = (decodedText: string) => {
        if (isCurrent()) processBarcodeRef.current(decodedText);
      };
    setCameraError(null);
    setIsPaused(false);
    isProcessingRef.current = false;

    // Ensure DOM container element exists and is mounted
    let containerEl = document.getElementById(scannerContainerId);
    if (!containerEl || !containerEl.isConnected) {
      await new Promise(r => setTimeout(r, 100));
      containerEl = document.getElementById(scannerContainerId);
      if (!containerEl || !containerEl.isConnected) {
        return;
      }
    }

    try {
      const previousScanner = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      if (previousScanner) await releaseCamera(previousScanner);
      if (!isCurrent()) return;

      const qrScanner = new Html5Qrcode(scannerContainerId, {
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

      createdScanner = qrScanner;
      html5QrCodeRef.current = qrScanner;
      if (!isCurrent()) {
        html5QrCodeRef.current = null;
        await releaseCamera(qrScanner);
        return;
      }

      // Get available cameras if not loaded
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
          setCameras(devices.map((d, index) => ({
            id: d.id,
            label: d.label || (d.id ? `كاميرا ${d.id.slice(0, 5)}` : `كاميرا ${index + 1}`)
          })));
          if (!selectedCameraIdRef.current) {
            selectedCameraIdRef.current = devices[devices.length - 1].id;
            setSelectedCameraId(devices[devices.length - 1].id); // prefer rear camera
          }
        }
      } catch {
        // Continue with default facing mode
      }
      if (!isCurrent()) { await releaseCreatedScanner(); return; }

      // Re-verify container is still in DOM after async camera query
      const checkEl = document.getElementById(scannerContainerId);
      if (!checkEl || !checkEl.isConnected) {
        await releaseCreatedScanner();
        return;
      }

      let started = false;
      const scanConfig = {
        fps: 22,
        disableFlip: false
      };

      if (cameraId) {
        try {
          await qrScanner.start(
            { deviceId: { exact: cameraId } },
            scanConfig,
            onDecoded,
            () => {}
          );
          started = true;
          if (!isCurrent()) { await releaseCreatedScanner(); return; }
        } catch (e) {
          if (!isCurrent()) { await releaseCreatedScanner(); return; }
          console.warn('Selected cameraId failed, trying fallback:', e);
        }
      }

      if (!started) {
        try {
          // 1. Try environment camera (for phones)
          await qrScanner.start(
            { facingMode: 'environment' },
            scanConfig,
            onDecoded,
            () => {}
          );
          started = true;
          if (!isCurrent()) { await releaseCreatedScanner(); return; }
        } catch (envErr) {
          if (!isCurrent()) { await releaseCreatedScanner(); return; }
          console.warn('Environment facingMode failed, trying user camera:', envErr);
          try {
            // 2. Try user camera (for laptops / webcams)
            await qrScanner.start(
              { facingMode: 'user' },
              scanConfig,
              onDecoded,
              () => {}
            );
            started = true;
            if (!isCurrent()) { await releaseCreatedScanner(); return; }
          } catch (userErr) {
            if (!isCurrent()) { await releaseCreatedScanner(); return; }
            // 3. Try device ID from enumerated cameras
            const devices = await Html5Qrcode.getCameras().catch(() => []);
            if (!isCurrent()) { await releaseCreatedScanner(); return; }
            if (devices && devices.length > 0) {
              await qrScanner.start(
                devices[0].id,
                scanConfig,
                onDecoded,
                () => {}
              );
              started = true;
              if (!isCurrent()) { await releaseCreatedScanner(); return; }
            } else {
              throw userErr || envErr || new Error('تعذر تشغيل كاميرا المسح الضوئي');
            }
          }
        }
      }

      if (!isCurrent()) { await releaseCreatedScanner(); return; }
      setIsScanning(true);
      setIsPaused(false);

      // Check if torch is supported
      try {
        const capabilities = qrScanner.getRunningTrackCapabilities();
        if (capabilities && (capabilities as { torch?: boolean }).torch) {
          setTorchSupported(true);
        }
      } catch {
        setTorchSupported(false);
      }
    } catch (err: unknown) {
      await releaseCreatedScanner();
      if (!isCurrent()) return;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('clientWidth') || errMsg.includes('not found')) {
        console.warn('Scanner container DOM not ready or unmounted during startup.');
        return;
      }
      console.error('Failed to start barcode scanner:', err);
      setIsScanning(false);
      setIsPaused(false);
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        setCameraError('لم يتم منح إذن الوصول للكاميرا. يرجى تفعيل إذن الكاميرا من إعدادات المتصفح.');
      } else if (errMsg.includes('NotFound') || errMsg.includes('device')) {
        setCameraError('لم يتم العثور على كاميرا متصلة بالجهاز. يمكنك استخدام ماسح الباركود اليدوي أو إدخال الكود أدناه.');
      } else {
        setCameraError('تعذر تشغيل كاميرا المسح الضوئي: ' + errMsg);
      }
    }
    })();
    cameraStartPromiseRef.current = startup;
    await startup;
  }, [releaseCamera]);

  // Resume Scanning
  const resumeScanner = useCallback(async () => {
    try {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.resume();
      } else {
        await startScanner(selectedCameraId);
      }
    } catch {
      await startScanner(selectedCameraId);
    }
    setIsPaused(false);
    setNotFoundBarcode(null);
    setDuplicateWarning(null);
    lastBarcodeRef.current = '';
    isProcessingRef.current = false;
  }, [startScanner, selectedCameraId]);

  // Toggle Pause/Play
  const togglePauseScanner = useCallback(async () => {
    if (isPaused) {
      await resumeScanner();
    } else {
      try {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.pause(true);
        }
      } catch {
        // ignore
      }
      setIsPaused(true);
    }
  }, [isPaused, resumeScanner]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !torchSupported) return;
    try {
      const newTorchState = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: newTorchState } as unknown as MediaTrackConstraintSet]
      });
      setTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      closingRef.current = false;
      // Delay slightly for container element to mount in DOM
      const timer = setTimeout(() => {
        startScanner().catch((err) => {
          console.warn('Barcode scanner modal startup notice:', err);
        });
      }, 150);
      return () => {
        clearTimeout(timer);
        closingRef.current = true;
        void stopScanner();
      };
    } else {
      closingRef.current = true;
      void stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    processBarcode(manualCode.trim());
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Barcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span>
                  {title || (mode === 'input' ? 'قارئ الباركود بالكاميرا لتسجيل الصنف' : 'قارئ الباركود الضوئي لنقاط البيع')}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h3>
              <p className="text-[10px] text-slate-400">
                {subtitle || (mode === 'input' ? 'وجّه كاميرا الجهاز نحو باركود المنتج لقراءته وتعبئته تلقائياً' : 'قراءة باركود المنتجات وإضافتها تلقائياً إلى السلة')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Pause / Resume Scanner Button */}
            {isScanning && !cameraError && (
              <button
                type="button"
                onClick={togglePauseScanner}
                title={isPaused ? 'استئناف تشغيل القارئ' : 'إيقاف مؤقت للقارئ'}
                className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors cursor-pointer border flex items-center gap-1 ${
                  isPaused
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="w-3 h-3 text-amber-400" />
                    <span>تشغيل القارئ</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 text-slate-400" />
                    <span>إيقاف القارئ</span>
                  </>
                )}
              </button>
            )}

            {/* Auto-Close Mode Badge */}
            <button
              type="button"
              onClick={() => setAutoClose(!autoClose)}
              title={autoClose ? 'الإغلاق التلقائي للشاشة مفعل عند التقاط الباركود والدخول في بند الكمية' : 'إبقاء الشاشة مفتوحة لمسح متواصل'}
              className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer border ${
                autoClose
                  ? 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-500 shadow-2xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {autoClose ? 'إغلاق واعتماد فوري: نعم' : 'إغلاق فوري: لا'}
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'كتم صوت التنبيه' : 'تشغيل صوت التنبيه'}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Viewport Area */}
        <div className="relative bg-black flex flex-col items-center justify-center overflow-hidden min-h-[260px]">
          {/* Scanner Element where html5-qrcode attaches video */}
          <div id={scannerContainerId} className="w-full max-w-[420px]" />

          {/* Laser Scanning Line Animation */}
          {isScanning && !cameraError && (
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
              <div className="w-64 h-36 border-2 border-blue-400/80 rounded-lg relative shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                {/* Corner crosshairs */}
                <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
                <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
                <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400" />
                
                {/* Red Laser Sweep Line */}
                <div className="absolute inset-x-2 h-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse top-1/2 -translate-y-1/2" />
              </div>
              <span className="text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded-full mt-2 font-mono">
                وجّه الباركود داخل الإطار
              </span>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div className="p-4 text-center max-w-sm">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-slate-200 font-medium leading-relaxed">{cameraError}</p>
              <button
                onClick={() => startScanner(selectedCameraId)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة محاولة الاتصال بالكاميرا</span>
              </button>
            </div>
          )}

          {/* Camera Controls Overlay */}
          {isScanning && (
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
              {cameras.length > 1 ? (
                <select
                  value={selectedCameraId}
                  onChange={e => {
                    setSelectedCameraId(e.target.value);
                    startScanner(e.target.value);
                  }}
                  className="bg-black/60 text-white text-[10px] rounded px-2 py-1 border border-white/20 focus:outline-none"
                >
                  {cameras.map(c => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div />
              )}

              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`p-1.5 rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    torchOn ? 'bg-amber-500 text-slate-950' : 'bg-black/60 text-white border border-white/20'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[10px]">{torchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live Feedback Notification Banner */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-xs">
          {mode === 'input' ? (
            capturedCode ? (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                <div className="p-2 bg-emerald-50 border border-emerald-300 rounded-md flex items-center justify-between gap-2 text-emerald-900">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold">تم التقاط الباركود: </span>
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 font-bold text-emerald-800">
                        {capturedCode}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shrink-0 cursor-pointer shadow-xs transition-colors"
                  >
                    اعتماد وإغلاق
                  </button>
                </div>
                {duplicateWarning && (
                  <div className="p-1.5 bg-amber-50 border border-amber-300 rounded text-amber-900 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      تنبيه: هذا الباركود مسجل مسبقاً لصنف: <strong>{duplicateWarning.name}</strong> ({duplicateWarning.code})
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>
                  {currentBarcode ? (
                    <>
                      الباركود الحالي للصنف: <strong className="font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200">{currentBarcode}</strong>. وجّه الكاميرا لاستبداله.
                    </>
                  ) : (
                    'وجّه الكاميرا نحو باركود الصنف ليتم التقاطه وتعبئته مباشرة في النموذج.'
                  )}
                </span>
              </div>
            )
          ) : (
            <>
              {lastScannedItem && (
                <div className="p-2 bg-emerald-50 border border-emerald-300 rounded-md flex items-center justify-between gap-2 text-emerald-900 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold">تمت الإضافة للسلة: </span>
                      <span className="text-slate-800">{lastScannedItem.item.name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 font-mono font-black text-emerald-700">
                    +{lastScannedItem.item.sellingPrice.toFixed(2)} {currency}
                  </div>
                </div>
              )}

              {notFoundBarcode && (
                <div className="p-2 bg-rose-50 border border-rose-300 rounded-md flex items-center gap-1.5 text-rose-900">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-bold">الصنف غير موجود: </span>
                  <span className="text-xs text-rose-700">الباركود: </span>
                  <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200 text-rose-800">
                    {notFoundBarcode}
                  </strong>
                </div>
              )}

              {!lastScannedItem && !notFoundBarcode && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-light">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>
                    يدعم النظام أيضاً <strong>أجهزة قراءة الباركود اللاسلكية والـ USB</strong> مباشرة بمجرد توجيه الباركود.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Manual Input and Quick Test Barcodes Area */}
        <div className="p-3 border-t border-slate-200 space-y-2.5 bg-white overflow-y-auto">
          {/* Manual Barcode input */}
          <form onSubmit={handleManualSubmit} className="flex gap-1.5">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="أدخل رقم الباركود يدوياً (مثال: 62810010001)..."
                className="w-full pr-8 pl-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-md text-xs font-bold cursor-pointer transition-colors shrink-0"
            >
              {mode === 'input' ? 'اعتماد الكود' : 'مسح وإضافة'}
            </button>
          </form>

          {/* Quick Simulation Buttons */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>أكواد سريعة لتجربة المسح (محاكاة بنقرة واحدة):</span>
              </div>
              {mode === 'input' && (
                <button
                  type="button"
                  onClick={() => {
                    const generated = `628${Math.floor(10000000 + Math.random() * 90000000)}`;
                    processBarcode(generated);
                  }}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                >
                  + توليد باركود عشوائي EAN
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sampleItems.map((item, idx) => (
                <button
                  key={`bc-sample-${item.id || idx}-${idx}`}
                  type="button"
                  onClick={() => processBarcode(item.barcode)}
                  className="bg-slate-100 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-slate-800 rounded px-2 py-1 text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Barcode className="w-3 h-3 text-slate-500" />
                  <span className="font-semibold">{(item?.name || '').slice(0, 18)}...</span>
                  <span className="font-mono text-slate-400 text-[9px]">({item.barcode})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-[9px] text-slate-400 font-light">
            {mode === 'input'
              ? 'بمجرد قراءة الباركود، تُغلق الشاشة تلقائياً ويتم الانتقال إلى حقل الكمية، ثم Enter للرجوع للباركود'
              : 'بمجرد قراءة الباركود، تُغلق الشاشة تلقائياً ويتم الانتقال لتعديل كمية الصنف، ثم Enter للرجوع للباركود'}
          </span>
          <button
            onClick={handleClose}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold transition-colors cursor-pointer text-xs"
          >
            {mode === 'input' && capturedCode ? 'تم الاعتماد وإغلاق' : 'إغلاق'}
          </button>
        </div>
      </div>
    </div>
  );
};
