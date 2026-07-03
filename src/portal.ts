/**
 * Portal bloom: expanding chromatic rings and orbiting particles around a
 * point, rendered on a dedicated transparent canvas above the overlay.
 */

const PHOSPHOR = '#7af4d2';
const MAGENTA = '#ff5ec4';
const AMBER = '#ffb454';
const DURATION_MS = 2600;

interface Particle {
  angle: number;
  speed: number;
  radius: number;
  drift: number;
  size: number;
  hue: string;
}

interface Bloom {
  x: number;
  y: number;
  startedAt: number;
  maxRadius: number;
  particles: Particle[];
}

export class PortalLayer {
  private ctx: CanvasRenderingContext2D;
  private blooms: Bloom[] = [];
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Triggers a portal bloom centered on (x, y) in CSS pixels. */
  bloom(x: number, y: number, objectSize: number): void {
    const particles: Particle[] = Array.from({ length: 26 }, (_, i) => ({
      angle: (i / 26) * Math.PI * 2 + Math.random() * 0.4,
      speed: 0.0012 + Math.random() * 0.002,
      radius: objectSize * (0.25 + Math.random() * 0.35),
      drift: 0.02 + Math.random() * 0.06,
      size: 1 + Math.random() * 2.2,
      hue: [PHOSPHOR, MAGENTA, AMBER][i % 3],
    }));
    this.blooms.push({
      x,
      y,
      startedAt: performance.now(),
      maxRadius: Math.max(objectSize * 0.9, 120),
      particles,
    });
    if (navigator.vibrate) navigator.vibrate(30);
  }

  get active(): boolean {
    return this.blooms.length > 0;
  }

  render(now: number): void {
    this.resize();
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    if (!this.blooms.length) return;

    this.blooms = this.blooms.filter((b) => now - b.startedAt < DURATION_MS);

    for (const b of this.blooms) {
      const t = (now - b.startedAt) / DURATION_MS; // 0..1
      const ease = 1 - Math.pow(1 - t, 3);
      const fade = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.55) / 0.45);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Three expanding rings, chromatically offset.
      for (let r = 0; r < 3; r++) {
        const ringT = Math.max(0, ease - r * 0.12);
        const radius = b.maxRadius * ringT;
        if (radius <= 0) continue;
        const alpha = fade * (0.5 - r * 0.12);

        ctx.lineWidth = 1.6 - r * 0.3;
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = MAGENTA;
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = PHOSPHOR;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Pulsing scan segments around the core.
      const segs = 8;
      const segRadius = b.maxRadius * 0.35 * (0.9 + 0.1 * Math.sin(now / 120));
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2 + now / 700;
        ctx.beginPath();
        ctx.arc(b.x, b.y, segRadius, a0, a0 + 0.28);
        ctx.stroke();
      }

      // Orbiting particles spiralling outward.
      for (const p of b.particles) {
        const a = p.angle + now * p.speed;
        const rad = p.radius + ease * b.maxRadius * p.drift * 10;
        const px = b.x + Math.cos(a) * rad;
        const py = b.y + Math.sin(a) * rad;
        ctx.globalAlpha = fade * 0.9;
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Soft core glow.
      const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.maxRadius * 0.5);
      glow.addColorStop(0, 'rgba(122, 244, 210, 0.35)');
      glow.addColorStop(1, 'rgba(122, 244, 210, 0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.maxRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }
}
