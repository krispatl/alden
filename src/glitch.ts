/**
 * Glitch surface — occasionally distorts a rectangular region that spans
 * across / between detected objects. Reads as the simulation stuttering.
 *
 * Approach: at random intervals, grab the current camera frame, paint a
 * chromatic-offset copy over the region, add scan tearing and a wireframe
 * flash. Runs for ~350ms, then dormant for several seconds.
 *
 * Also handles per-object "inspect glitch" bursts triggered on hold.
 */

import type { BBox } from './types';

const MIN_DORMANT_MS = 4500;
const MAX_DORMANT_MS = 9000;
const EVENT_DURATION_MS = 380;

interface Event {
  rect: BBox;
  startedAt: number;
  duration: number;
  intensity: number;
}

export class GlitchSurface {
  private events: Event[] = [];
  private nextAmbientAt = 0;
  /** Total ambient anomalies fired (lets the app react, e.g. with sound). */
  eventCount = 0;

  constructor(private video: HTMLVideoElement) {
    this.nextAmbientAt = performance.now() + 2500;
  }

  /** Triggers an intense inspect-glitch on a specific rect. */
  inspectBurst(rect: BBox): void {
    this.events.push({
      rect,
      startedAt: performance.now(),
      duration: 550,
      intensity: 1,
    });
  }

  update(now: number, rects: BBox[]): void {
    // Purge finished events.
    this.events = this.events.filter((e) => now - e.startedAt < e.duration);

    // Maybe start an ambient event spanning several boxes.
    if (now >= this.nextAmbientAt && rects.length > 0) {
      const region = this.pickRegion(rects);
      this.events.push({
        rect: region,
        startedAt: now,
        duration: EVENT_DURATION_MS,
        intensity: 0.55,
      });
      this.eventCount += 1;
      this.nextAmbientAt = now + MIN_DORMANT_MS + Math.random() * (MAX_DORMANT_MS - MIN_DORMANT_MS);
    }
  }

  /** Chooses a region that spans between 2+ boxes when possible. */
  private pickRegion(rects: BBox[]): BBox {
    if (rects.length === 1) {
      const [x, y, w, h] = rects[0];
      // Expand outward to catch adjacent space too.
      return [x - w * 0.15, y - h * 0.1, w * 1.3, h * 1.2];
    }
    // Pick two nearby boxes and take a rectangle bridging them.
    const a = rects[Math.floor(Math.random() * rects.length)];
    let b = rects[Math.floor(Math.random() * rects.length)];
    if (b === a && rects.length > 1) {
      b = rects[(rects.indexOf(a) + 1) % rects.length];
    }
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    const x2 = Math.max(a[0] + a[2], b[0] + b[2]);
    const y2 = Math.max(a[1] + a[3], b[1] + b[3]);
    return [x, y, x2 - x, y2 - y];
  }

  render(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    if (!this.events.length || this.video.readyState < 2) return;

    const vw = this.video.videoWidth || viewW;
    const vh = this.video.videoHeight || viewH;
    const scale = Math.max(viewW / vw, viewH / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (viewW - dw) / 2;
    const oy = (viewH - dh) / 2;

    ctx.save();

    for (const e of this.events) {
      const now = performance.now();
      const t = (now - e.startedAt) / e.duration; // 0..1
      const envelope = Math.sin(t * Math.PI); // 0→1→0
      const strength = envelope * e.intensity;
      if (strength < 0.02) continue;

      const [rx, ry, rw, rh] = e.rect;
      // Clip so distortion stays inside the region.
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();

      // Chromatic RGB offset: re-draw the underlying video slightly shifted
      // in cyan and magenta with additive blending.
      const off = strength * 6;
      ctx.globalCompositeOperation = 'lighter';

      // Two offset copies in opposite directions read as RGB fringing.
      ctx.globalAlpha = 0.3 * strength;
      ctx.drawImage(this.video, ox + off, oy, dw, dh);
      ctx.globalAlpha = 0.3 * strength;
      ctx.drawImage(this.video, ox - off, oy + off * 0.4, dw, dh);

      // Scan tearing: shift horizontal slices by random amounts.
      ctx.globalCompositeOperation = 'source-over';
      const slices = 4 + Math.floor(strength * 5);
      for (let i = 0; i < slices; i++) {
        const sy = ry + (rh * i) / slices + Math.random() * (rh / slices);
        const sh = 2 + Math.random() * 6;
        const shift = (Math.random() - 0.5) * strength * 22;
        ctx.globalAlpha = strength * 0.6;
        ctx.drawImage(
          this.video,
          (rx - ox) / scale,
          (sy - oy) / scale,
          rw / scale,
          sh / scale,
          rx + shift,
          sy,
          rw,
          sh
        );
      }

      // Wireframe flash across the region.
      ctx.globalAlpha = strength * 0.5;
      ctx.strokeStyle = '#7af4d2';
      ctx.lineWidth = 1;
      const step = 22;
      ctx.beginPath();
      for (let gy = ry; gy < ry + rh; gy += step) {
        ctx.moveTo(rx, gy);
        ctx.lineTo(rx + rw, gy);
      }
      for (let gx = rx; gx < rx + rw; gx += step) {
        ctx.moveTo(gx, ry);
        ctx.lineTo(gx, ry + rh);
      }
      ctx.stroke();

      // Signature line: small caption at the corner.
      ctx.globalAlpha = strength;
      ctx.fillStyle = '#ffb454';
      ctx.font = '9px "Space Mono", ui-monospace, monospace';
      ctx.fillText('RENDER ANOMALY', rx + 4, ry + 12);

      ctx.restore();
    }

    ctx.restore();
  }
}
