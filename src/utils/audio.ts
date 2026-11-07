// Web Audio API POS sound synthesizer for instant audio feedback without external assets
class PosSoundManager {
  private audioCtx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  // Dual-tone crisp supermarket POS scanner beep
  playSuccessBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now); // A6
      osc.frequency.setValueAtTime(2349.32, now + 0.04); // D7

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (err) {
      console.warn('Audio playback not permitted yet:', err);
    }
  }

  // Error alert tone (low buzz) when barcode is not found in inventory
  playErrorBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.setValueAtTime(220, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (err) {
      console.warn('Audio playback not permitted yet:', err);
    }
  }

  // Pleasant chime for payment and cash disbursement
  playCashBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1046.5, now); // C6
      osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
      osc.frequency.setValueAtTime(1567.98, now + 0.16); // G6

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (err) {
      console.warn('Audio playback not permitted yet:', err);
    }
  }

  beep(_freq?: number, _dur?: number) {
    this.playSuccessBeep();
  }

  cash() {
    this.playCashBeep();
  }

  click() {
    this.playSuccessBeep();
  }

  success() {
    this.playCashBeep();
  }

  playCashDrawer() {
    this.playCashBeep();
  }

  error() {
    this.playErrorBeep();
  }
}

export const posSound = new PosSoundManager();
