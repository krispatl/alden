/**
 * Canvas overlay renderer — the original scanner look: glowing corner
 * brackets, drifting node particles, and (new) the narrative layer: a small
 * telemetry tag plus a word-by-word revealed story fragment per object.
 * Also hosts the glitch surface (under everything) and the AR particle
 * layer (between video and brackets).
 */

import type { BBox, BBoxMapper, TrackedObject } from './types';
import { entityId, lodTag } from './narrative';
import { ParticleLayer } from './particles';
import { GlitchSurface } from './glitch';

const PHOSPHOR = '#7af4d2';
const SIGNAL = '#ffb454';
const MAGENTA = '#ff5ec4';
const REVEAL_MS = 90; // per word — fragments are sentences, keep them quick

interface Node {
  angle: number;
  speed: number;
  radiusJitter: number;
  size: number;
}

export class OverlayRenderer {
  private ctx: CanvasRenderingContext2D;
  private nodes = new Map<string, Node[]>();
  private dpr = 1;
  readonly particles = new ParticleLayer();
  readonly glitch: GlitchSurface;
  /** Fires when any fragment finishes revealing (for the audio tick). */
  onReveal: (() => void) | null = null;
  private revealed = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.glitch = new GlitchSurface(video);
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (this.canvas.width !== Math.round(w * this.dpr) || this.canvas.height !== Math.round(h * this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
  }

  /** Video-pixel → CSS-pixel mapper accounting for object-fit: cover. */
  mapper(): BBoxMapper {
    const vw = this.video.videoWidth || 1;
    const vh = this.video.videoHeight || 1;
    const dw = this.canvas.clientWidth || 1;
    const dh = this.canvas.clientHeight || 1;
    const scale = Math.max(dw / vw, dh / vh);
    const ox = (dw - vw * scale) / 2;
    const oy = (dh - vh * scale) / 2;
    return ([x, y, w, h]: BBox): BBox => [x * scale + ox, y * scale + oy, w * scale, h * scale];
  }

  render(objects: TrackedObject[], now: number, selectedId: string | null): void {
    this.resize();
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const viewW = this.canvas.clientWidth;
    const viewH = this.canvas.clientHeight;
    ctx.clearRect(0, 0, viewW, viewH);

    const map = this.mapper();
    const mappedRects = objects.map((o) => map(o.smoothBBox));

    // 1. Glitch surface (render anomalies) — under everything.
    this.glitch.update(now, mappedRects);
    this.glitch.render(ctx, viewW, viewH);

    // 2. AR particles per object.
    const rectInfo = new Map<string, { rect: BBox; label: string }>();
    objects.forEach((o, i) => rectInfo.set(o.id, { rect: mappedRects[i], label: o.label }));
    this.particles.step(now, rectInfo);
    this.particles.render(ctx);

    // 3. Brackets, orbit nodes, narrative text.
    const liveIds = new Set<string>();
    objects.forEach((obj, i) => {
      liveIds.add(obj.id);
      const [x, y, w, h] = mappedRects[i];
      const selected = obj.id === selectedId;
      const appear = Math.min(1, (now - obj.createdAt) / 400);

      this.drawBrackets(x, y, w, h, now, appear, selected);
      this.drawNodes(obj.id, x, y, w, h, now, appear);
      this.drawNarrative(obj, x, y, w, h, now, appear, viewW);
    });

    for (const id of this.nodes.keys()) {
      if (!liveIds.has(id)) this.nodes.delete(id);
    }
    for (const id of this.revealed) {
      if (!liveIds.has(id)) this.revealed.delete(id);
    }
  }

  /* -------------------------------------------------- brackets */

  private drawBrackets(
    x: number,
    y: number,
    w: number,
    h: number,
    now: number,
    appear: number,
    selected: boolean
  ): void {
    const { ctx } = this;
    const breath = 0.75 + 0.25 * Math.sin(now / 900);
    const len = Math.min(w, h) * 0.22;
    const color = selected ? SIGNAL : PHOSPHOR;

    ctx.save();
    ctx.globalAlpha = appear * (selected ? 1 : 0.85) * breath;
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2 : 1.4;
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 14 : 8;
    ctx.lineCap = 'round';

    const corners: Array<[number, number, number, number]> = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x + w, y + h, -1, -1],
      [x, y + h, 1, -1],
    ];
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of corners) {
      ctx.moveTo(cx + sx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * len);
    }
    ctx.stroke();

    // Travelling shimmer along the top edge.
    const t = (now / 1600) % 1;
    ctx.globalAlpha = appear * 0.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x + w * Math.max(0, t - 0.12), y);
    ctx.lineTo(x + w * t, y);
    ctx.stroke();
    ctx.restore();
  }

  /* -------------------------------------------------- orbit nodes */

  private drawNodes(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    now: number,
    appear: number
  ): void {
    let nodes = this.nodes.get(id);
    if (!nodes) {
      nodes = Array.from({ length: 5 }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 0.00025 + Math.random() * 0.0004,
        radiusJitter: 0.9 + Math.random() * 0.25,
        size: 1 + Math.random() * 1.6,
      }));
      this.nodes.set(id, nodes);
    }

    const { ctx } = this;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = (w / 2) * 1.06;
    const ry = (h / 2) * 1.06;

    ctx.save();
    for (const n of nodes) {
      const a = n.angle + now * n.speed;
      ctx.globalAlpha = appear * (0.35 + 0.35 * Math.sin(now / 500 + n.angle * 7));
      ctx.fillStyle = PHOSPHOR;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rx * n.radiusJitter, cy + Math.sin(a) * ry * n.radiusJitter, n.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* -------------------------------------------------- narrative text */

  private drawNarrative(
    obj: TrackedObject,
    x: number,
    y: number,
    w: number,
    h: number,
    now: number,
    appear: number,
    viewW: number
  ): void {
    const { ctx } = this;
    const tagSize = 9;
    const fontSize = Math.max(11, Math.min(13.5, w * 0.05));
    const lineHeight = fontSize * 1.5;

    const words = obj.fragment.split(' ');
    const sinceChange = now - obj.fragmentChangedAt;
    const revealCount = Math.min(words.length, Math.floor(sinceChange / REVEAL_MS) + 1);

    // Fire a single reveal tick per fragment.
    const revealKey = `${obj.id}:${obj.fragmentChangedAt}`;
    if (revealCount >= words.length && !this.revealed.has(revealKey)) {
      this.revealed.add(revealKey);
      this.onReveal?.();
    }

    ctx.save();

    // Telemetry tag: 0x4A2F · chair · LOD-1
    ctx.font = `${tagSize}px "Space Mono", ui-monospace, monospace`;
    const tag = `${entityId(obj.id)} · ${obj.label} · ${lodTag(obj.id)}`;
    const startX = Math.max(12, Math.min(x, viewW - 200));
    ctx.textBaseline = 'bottom';

    // Fragment lines (word-revealed, wrapped).
    ctx.font = `${fontSize}px "Space Mono", ui-monospace, monospace`;
    const maxWidth = Math.min(viewW - startX - 12, Math.max(w * 1.35, 230));
    const shown = words.slice(0, revealCount).join(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of shown.split(' ')) {
      const attempt = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(attempt).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = attempt;
      }
    }
    if (line) lines.push(line);

    const blockHeight = lines.length * lineHeight + tagSize + 8;
    let baseY = y - 10;
    if (baseY - blockHeight < 8) baseY = y + h + blockHeight + 6; // below the box if no room above

    // Backing panel.
    const widest = Math.max(
      ctx.measureText(lines[lines.length - 1] ?? '').width,
      ...lines.map((l) => ctx.measureText(l).width),
      120
    );
    ctx.globalAlpha = appear * 0.55;
    ctx.fillStyle = 'rgba(5, 9, 14, 0.72)';
    ctx.fillRect(startX - 6, baseY - blockHeight - 2, widest + 12, blockHeight + 8);

    // Tag.
    ctx.globalAlpha = appear * 0.9;
    ctx.font = `${tagSize}px "Space Mono", ui-monospace, monospace`;
    ctx.fillStyle = SIGNAL;
    ctx.fillText(tag, startX, baseY - lines.length * lineHeight - 4);

    // Fragment with a faint chromatic ghost.
    ctx.font = `${fontSize}px "Space Mono", ui-monospace, monospace`;
    lines.forEach((text, i) => {
      const ty = baseY - (lines.length - 1 - i) * lineHeight + Math.sin(now / 1400 + i) * 1.2;
      ctx.globalAlpha = appear * 0.22;
      ctx.fillStyle = MAGENTA;
      ctx.fillText(text, startX + 1, ty + 0.5);
      ctx.globalAlpha = appear * 0.95;
      ctx.fillStyle = '#eafff7';
      ctx.fillText(text, startX, ty);
    });

    // Caret while revealing.
    if (revealCount < words.length && Math.floor(now / 280) % 2 === 0) {
      const last = lines[lines.length - 1] ?? '';
      ctx.globalAlpha = appear;
      ctx.fillStyle = PHOSPHOR;
      ctx.fillRect(startX + ctx.measureText(last).width + 3, baseY - fontSize, 5, fontSize);
    }
    ctx.restore();
  }
}
