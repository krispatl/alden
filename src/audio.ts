/**
 * Audio engine — the instrument's sound design, fully synthesized with the
 * Web Audio API (no audio files). Quiet, textural, diegetic: the sounds a
 * rendering system might leak.
 *
 *  - ambient: low detuned drone + sparse data ticks
 *  - detect:  soft rising blip when a new object is framed
 *  - inspect: descending sweep + filtered noise (hologram open)
 *  - glitch:  short bandpassed noise stutter (render anomaly)
 *  - log:     two-note confirmation chime (anomaly saved)
 *  - tick:    tiny click when a fragment refreshes
 */

const MUTE_KEY = 'lse-muted';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];

  muted = localStorage.getItem(MUTE_KEY) === '1';

  /** Must be called from a user gesture (the Enter tap). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /* ------------------------------------------------------------ ambient */

  private startAmbient(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.05;
    ambientGain.connect(this.master);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 240;
    lowpass.connect(ambientGain);

    for (const [freq, type, detune] of [
      [55, 'sine', 0],
      [82.5, 'triangle', 4],
      [110, 'sine', -6],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g).connect(lowpass);
      osc.start();
      this.ambientNodes.push(osc);
    }

    // Slow breathing on the drone.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(ambientGain.gain);
    lfo.start();
    this.ambientNodes.push(lfo);

    // Sparse "data ticks" wandering in the background.
    const scheduleTick = () => {
      this.dataTick();
      window.setTimeout(scheduleTick, 3000 + Math.random() * 7000);
    };
    window.setTimeout(scheduleTick, 4000);
  }

  private dataTick(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1800 + Math.random() * 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.012, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  /* ------------------------------------------------------------- events */

  /** Soft rising blip: a new object was framed. */
  detect(): void {
    this.tone((t, out, ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, t);
      osc.frequency.exponentialRampToValueAtTime(1240, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  /** Descending sweep + noise: hologram inspection opens. */
  inspect(): void {
    this.tone((t, out, ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.28);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(f).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.36);

      const noise = this.noiseSource(0.25);
      if (noise) {
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.setValueAtTime(3000, t);
        nf.frequency.exponentialRampToValueAtTime(500, t + 0.22);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.03, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        noise.connect(nf).connect(ng).connect(out);
        noise.start(t);
      }
    });
  }

  /** Bandpassed noise stutter: a render anomaly rippled through the frame. */
  glitch(): void {
    this.tone((t, out, ctx) => {
      const noise = this.noiseSource(0.18);
      if (!noise) return;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.value = 600 + Math.random() * 2600;
      const g = ctx.createGain();
      // Stutter envelope: three quick gates.
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.05;
        g.gain.setValueAtTime(0.035, s);
        g.gain.setValueAtTime(0.0001, s + 0.028);
      }
      noise.connect(f).connect(g).connect(out);
      noise.start(t);
    });
  }

  /** Two-note confirmation: anomaly logged. */
  log(): void {
    this.tone((t, out, ctx) => {
      for (const [freq, at] of [
        [660, 0],
        [990, 0.11],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(0.05, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.3);
        osc.connect(g).connect(out);
        osc.start(t + at);
        osc.stop(t + at + 0.32);
      }
    });
  }

  /** Tiny click when a fragment refreshes. */
  tick(): void {
    this.tone((t, out, ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.015, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.03);
    });
  }

  /* ------------------------------------------------------------ helpers */

  private tone(build: (t: number, out: GainNode, ctx: AudioContext) => void): void {
    if (!this.ctx || !this.master || this.muted) return;
    build(this.ctx.currentTime, this.master, this.ctx);
  }

  private noiseSource(seconds: number): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
