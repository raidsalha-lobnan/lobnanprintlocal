import { useEffect, useRef } from 'react';
import { posSound } from './audio';

interface HardwareScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minChars?: number;
  maxIntervalMs?: number; // Maximum time between keystrokes to consider it a hardware scanner (default: 50ms)
  playSound?: boolean;
}

/**
 * Hook to listen for hardware barcode scanners (USB / Bluetooth HID keyboard wedge scanners)
 * Hardware scanners type the full barcode sequence in tens of milliseconds and hit Enter.
 */
export function useHardwareBarcodeScanner({
  onScan,
  enabled = true,
  minChars = 3,
  maxIntervalMs = 60,
  playSound = true
}: HardwareScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e || typeof e.key !== 'string') return;

      // Don't intercept function keys or modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If key is Enter, evaluate if we have a scanned barcode
      if (e.key === 'Enter') {
        const barcode = (bufferRef.current || '').trim();
        bufferRef.current = '';

        if (barcode && barcode.length >= minChars) {
          // If the event target is not an interactive input or textarea, prevent default submission
          const target = e.target as HTMLElement | null;
          const isTextarea = target?.tagName === 'TEXTAREA';
          if (!isTextarea) {
            e.preventDefault();
          }

          if (playSound) {
            posSound.playSuccessBeep();
          }
          onScan(barcode);
        }
        return;
      }

      // If elapsed time since last key is too long (user typing manually), reset buffer
      if (elapsed > maxIntervalMs && (bufferRef.current || '').length > 0) {
        bufferRef.current = '';
      }

      // Only accumulate printable single characters
      if (e.key.length === 1) {
        bufferRef.current = (bufferRef.current || '') + e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onScan, minChars, maxIntervalMs, playSound]);
}
