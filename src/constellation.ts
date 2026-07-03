/**
 * Constellation / telemetry layer — the TouchDesigner-style instrument look:
 *  - a drifting field of feature points sampled from image contrast
 *  - faint "echo" boxes for low-confidence detections, with coordinate readouts
 *  - curved threads between confident objects, and fanned threads from each
 *    object into the surrounding feature field
 */

import type { BBox } from './types';

const WHITE = 'rgba(240, 248, 246, 1)';
const SAMPLE_INTERVAL_MS = 650;
const MAX_POINTS = 130;
const SAMPLE_W = 120;

export interface EchoBox {
  /** bbox already mapped to CSS pixels */
  rect: BBox;
  score: number;
}

interface FeaturePoint {
  /** normalized 0..1 video coords */
  nx: number;
  ny: number;
  bornAt: number;
  life: number; // ms
  flicker: number;
}

export class ConstellationLayer {
  private points: FeaturePoint[] = [];
  private lastSample = 0;
  private sampler: HTMLCanvasElement;
  private samplerCtx: CanvasRenderingContext2D;

  constructor(private video: HTMLVideoElement) {
    this.sampler = document.createElement('canvas');
    this.samplerCtx = this.sampler.getContext('2d', { willReadFrequently: true })!;
  }

  /* ------------------------------------------------ feature sampling */

  update(now: number): void {
    if (now - this.lastSample < SAMPLE_INTERVAL_MS) return;
    if (this.video.readyState < 2 || !this.video.videoWidth) return;
    this.lastSample = now;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const sw = SAMPLE_W;
    const sh = Math.max(1, Math.round((vh / vw) * sw));
    this.sampler.width = sw;
    this.sampler.height = sh;
    this.samplerCtx.drawImage(this.video, 0, 0, sw, sh);

    let data: Uint8ClampedArray;
    try {
      data = this.samplerCtx.getImageData(0, 0, sw, sh).data;
    } catch {
      return;
    }

    // Luminance gradient magnitude at a coarse stride; collect edge candidates.
    const candidates: Array<{ nx: number; ny: number; g: number }> = [];
    const lum = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    for (let y = 1; y < sh - 1; y += 2) {
      for (let x = 1; x < sw - 1; x += 2) {
        const i = (y * sw + x) * 4;
        const gx = lum(i + 4) - lum(i - 4);
        const gy = lum(i + sw * 4) - lum(i - sw * 4);
        const g = Math.abs(gx) + Math.abs(gy);
        if (g > 60) candidates.push({ nx: x / sw, ny: y / sh, g });
      }
    }

    // Refresh a slice of the field each pass so points fade in and out.
    this.points = this.points.filter((p) => now - p.bornAt < p.life);
    const room = MAX_POINTS - this.points.length;
    if (room > 0 && candidates.length) {
      for (let i = 0; i < room; i++) {
        const c = candidates[Math.floor(Math.random() * candidates.length)];
        this.points.push({
          nx: c.nx + (Math.random() - 0.5) * 0.01,
          ny: c.ny + (Math.random() - 0.5) * 0.01,
          bornAt: now,
          life: 1800 + Math.random() * 2600,
          flicker: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  /* ------------------------------------------------------ rendering */

  render(
    ctx: CanvasRenderingContext2D,
    now: number,
    viewW: number,
    viewH: number,
    videoToScreen: (nx: number, ny: number) => [number, number],
    objectRects: BBox[],
    echoes: EchoBox[]
  ): void {
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.fillStyle = WHITE;
    ctx.font = '8px "Space Mono", ui-monospace, monospace';
    ctx.lineWidth = 0.75;

    // --- feature point field (short dashes, flickering) -------------
    const screenPoints: Array<[number, number]> = [];
    for (const p of this.points) {
      const age = now - p.bornAt;
      const fade = Math.min(age / 300, 1, (p.life - age) / 500);
      if (fade <= 0) continue;
      const [x, y] = videoToScreen(p.nx, p.ny);
      if (x < -20 || y < -20 || x > viewW + 20 || y > viewH + 20) continue;
      screenPoints.push([x, y]);
      const flick = 0.35 + 0.3 * Math.sin(now / 260 + p.flicker);
      ctx.globalAlpha = fade * flick;
      const a = p.flicker;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 2, y - Math.sin(a) * 2);
      ctx.lineTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2);
      ctx.stroke();
    }

    // --- echo boxes: low-confidence detections as raw telemetry -----
    for (const e of echoes) {
      const [x, y, w, h] = e.rect;
      ctx.globalAlpha = 0.28 + e.score * 0.4;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 0.5;
      ctx.fillText(
        `x${(x / viewW).toFixed(3)} y${(y / viewH).toFixed(3)}`,
        x + 2,
        y - 3
      );
    }

    // --- threads between confident objects (curved) -----------------
    const centers = objectRects.map(([x, y, w, h]) => [x + w / 2, y + h / 2] as const);
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const [ax, ay] = centers[i];
        const [bx, by] = centers[j];
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const sway = Math.sin(now / 1700 + i * 2 + j) * len * 0.12;
        const cx = mx + (-dy / len) * sway;
        const cy = my + (dx / len) * sway;

        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.stroke();

        // node rings at endpoints, readout at midpoint
        ctx.globalAlpha = 0.6;
        for (const [nx, ny] of [centers[i], centers[j]]) {
          ctx.beginPath();
          ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.45;
        ctx.fillText(`${(len / viewW).toFixed(3)}`, cx + 4, cy);
      }
    }

    // --- fanned threads from each object into the feature field -----
    for (const [x, y, w, h] of objectRects) {
      const ocx = x + w / 2;
      const ocy = y + h / 2;
      const nearest = screenPoints
        .map(([px, py]) => ({ px, py, d: Math.hypot(px - ocx, py - ocy) }))
        .filter((p) => p.d < Math.max(viewW, viewH) * 0.45)
        .sort((a, b) => a.d - b.d)
        .slice(0, 7);
      for (const p of nearest) {
        const mx = (ocx + p.px) / 2;
        const my = (ocy + p.py) / 2 + Math.sin(now / 1300 + p.px) * p.d * 0.08;
        ctx.globalAlpha = 0.14;
        ctx.beginPath();
        ctx.moveTo(ocx, ocy);
        ctx.quadraticCurveTo(mx, my, p.px, p.py);
        ctx.stroke();
      }
      // coordinate readout under the top-left bracket
      ctx.globalAlpha = 0.65;
      ctx.fillText(`x${(x / viewW).toFixed(3)} y${(y / viewH).toFixed(3)}`, x, y + h + 12);
    }

    ctx.restore();
  }
}
