/**
 * Audio engine — sound design that evolves with the narrative arc.
 *
 * Act I:   quiet, neutral drone. Sparse data ticks.
 * Act II:  second oscillator fades in (detuned fifth). Ticks more frequent.
 * Act III: low heartbeat pulse appears. Drone shifts darker.
 * Act IV:  everything present, dissonant undertone, breathing.
 * Ending:  drone fades to nothing over 8 seconds.
 *
 * Events: detect blip, inspect sweep, glitch stutter, log chime, tick.
 */

const MUTE_KEY = 'lse-muted';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private layer2Gain: GainNode | null = null;
  private heartGain: GainNode | null = null;
  private dissonanceGain: GainNode | null = null;
  private heartOsc: OscillatorNode | null = null;
  muted = localStorage.getItem(MUTE_KEY) === '1';

  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.buildDrone();
    this.scheduleTicks();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  /* ---- drone layers ---- */

  private buildDrone(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    // Layer 1: always-on base drone.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.04;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 200;
    lp.connect(this.droneGain).connect(this.master);

    for (const [f, type, d] of [[55, 'sine', 0], [82, 'triangle', 5]] as const) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = d;
      o.connect(lp); o.start();
    }

    // LFO breathing on the base.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.015;
    lfo.connect(lfoG).connect(this.droneGain.gain);
    lfo.start();

    // Layer 2: detuned fifth, fades in at Act II.
    this.layer2Gain = ctx.createGain();
    this.layer2Gain.gain.value = 0;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass'; lp2.frequency.value = 180;
    lp2.connect(this.layer2Gain).connect(this.master);
    for (const [f, d] of [[82, -8], [123, 3]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = d;
      o.connect(lp2); o.start();
    }

    // Heartbeat: sub-bass pulse, fades in at Act III.
    this.heartGain = ctx.createGain();
    this.heartGain.gain.value = 0;
    this.heartGain.connect(this.master);
    this.heartOsc = ctx.createOscillator();
    this.heartOsc.type = 'sine';
    this.heartOsc.frequency.value = 38;
    const heartEnv = ctx.createGain();
    heartEnv.gain.value = 0;
    this.heartOsc.connect(heartEnv).connect(this.heartGain);
    this.heartOsc.start();
    // Pulse LFO (heartbeat speed ~66 bpm = 1.1 Hz).
    const hLfo = ctx.createOscillator();
    hLfo.frequency.value = 1.1;
    const hLfoG = ctx.createGain();
    hLfoG.gain.value = 0.08;
    hLfo.connect(hLfoG).connect(heartEnv.gain);
    hLfo.start();

    // Dissonance: tritone hum, barely there, Act IV.
    this.dissonanceGain = ctx.createGain();
    this.dissonanceGain.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 140;
    dlp.connect(this.dissonanceGain).connect(this.master);
    const diss = ctx.createOscillator();
    diss.type = 'sine'; diss.frequency.value = 77.8; // tritone of 55
    diss.connect(dlp); diss.start();
  }

  /** Call from the render loop with the current activation count. */
  updateArc(activations: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Act II: second drone layer.
    this.layer2Gain?.gain.setTargetAtTime(activations >= 6 ? 0.025 : 0, t, 2);
    // Act III: heartbeat.
    this.heartGain?.gain.setTargetAtTime(activations >= 11 ? 0.06 : 0, t, 2);
    // Act IV: dissonance.
    this.dissonanceGain?.gain.setTargetAtTime(activations >= 18 ? 0.018 : 0, t, 2);
  }

  /** Deep sub thump — act transition punctuation. */
  beat(): void {
    this.play((t, out, ctx) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(55, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.5);
    });
  }

  /** Loop reset: noise swell → hard cut → drone returns at Act I level. */
  resetBurst(onCut?: () => void): void {
    if (!this.ctx || !this.master) { onCut?.(); return; }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (!this.muted) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const n = ctx.createBufferSource(); n.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(6000, t + 1.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 1.05);
      g.gain.setValueAtTime(0.0001, t + 1.12); // hard cut
      n.connect(f).connect(g).connect(this.master);
      n.start(t);
    }
    setTimeout(() => {
      // Drone returns at base level; act layers stay silent until updateArc.
      const tc = ctx.currentTime;
      this.droneGain?.gain.setTargetAtTime(0.04, tc, 0.8);
      this.layer2Gain?.gain.setTargetAtTime(0, tc, 0.1);
      this.heartGain?.gain.setTargetAtTime(0, tc, 0.1);
      this.dissonanceGain?.gain.setTargetAtTime(0, tc, 0.1);
      onCut?.();
    }, 1150);
  }

  /** Fade all drones to silence for the ending. */
  fadeOut(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.droneGain, this.layer2Gain, this.heartGain, this.dissonanceGain]) {
      g?.gain.setTargetAtTime(0, t, 3);
    }
  }

  private scheduleTicks(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const next = () => {
      if (this.muted) { setTimeout(next, 4000); return; }
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1600 + Math.random() * 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(this.master!);
      o.start(t); o.stop(t + 0.04);
      setTimeout(next, 2500 + Math.random() * 5500);
    };
    setTimeout(next, 3000);
  }

  /* ---- events ---- */

  detect(): void { this.play((t, out, ctx) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(760, t);
    o.frequency.exponentialRampToValueAtTime(1240, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.16);
  }); }

  inspect(): void { this.play((t, out, ctx) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.28);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.36);
  }); }

  glitch(): void { this.play((t, out, ctx) => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.18), ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.value = 600 + Math.random() * 2600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.035, t + i * 0.05); g.gain.setValueAtTime(0.0001, t + i * 0.05 + 0.028); }
    n.connect(f).connect(g).connect(out); n.start(t);
  }); }

  log(): void { this.play((t, out, ctx) => {
    for (const [freq, at] of [[660, 0], [990, 0.11]] as const) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.05, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.3);
      o.connect(g).connect(out); o.start(t + at); o.stop(t + at + 0.32);
    }
  }); }

  tick(): void { this.play((t, out, ctx) => {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.015, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.03);
  }); }

  private play(build: (t: number, out: GainNode, ctx: AudioContext) => void): void {
    if (!this.ctx || !this.master || this.muted) return;
    build(this.ctx.currentTime, this.master, this.ctx);
  }
}
