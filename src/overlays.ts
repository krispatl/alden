/**
 * Canvas overlay renderer: glowing scanner brackets, floating latent chain
 * text, and drifting node particles for each tracked object. Handles the
 * mapping from video coordinates to screen coordinates when the video is
 * displayed with object-fit: cover.
 */

import type { BBox, BBoxMapper, TrackedObject } from './types';

const PHOSPHOR = '#7af4d2';
const SIGNAL = '#ffb454';
const MAGENTA = '#ff5ec4';
const CHAIN_REVEAL_MS = 260; // per word

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

  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Keeps the canvas buffer matched to its CSS size × devicePixelRatio. */
  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (canvasNeedsResize(this.canvas, w, h, this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
  }

  /**
   * Returns a mapper from video pixel coords to CSS pixel coords, accounting
   * for object-fit: cover cropping.
   */
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
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    const map = this.mapper();
    const liveIds = new Set<string>();

    for (const obj of objects) {
      liveIds.add(obj.id);
      const [x, y, w, h] = map(obj.smoothBBox);
      const selected = obj.id === selectedId;
      const age = now - obj.createdAt;
      const appear = Math.min(1, age / 400);

      this.drawBrackets(x, y, w, h, now, appear, selected);
      this.drawNodes(obj.id, x, y, w, h, now, appear);
      this.drawChain(obj, x, y, w, now, appear);
    }

    // Prune particle state for departed objects.
    for (const id of this.nodes.keys()) {
      if (!liveIds.has(id)) this.nodes.delete(id);
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

    // Confidence shimmer: a faint travelling dash along the top edge.
    const t = (now / 1600) % 1;
    ctx.globalAlpha = appear * 0.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x + w * Math.max(0, t - 0.12), y);
    ctx.lineTo(x + w * t, y);
    ctx.stroke();
    ctx.restore();
  }

  /* -------------------------------------------------- particles */

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
      const px = cx + Math.cos(a) * rx * n.radiusJitter;
      const py = cy + Math.sin(a) * ry * n.radiusJitter;
      ctx.globalAlpha = appear * (0.35 + 0.35 * Math.sin(now / 500 + n.angle * 7));
      ctx.fillStyle = PHOSPHOR;
      ctx.beginPath();
      ctx.arc(px, py, n.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* -------------------------------------------------- chain text */

  private drawChain(obj: TrackedObject, x: number, y: number, w: number, now: number, appear: number): void {
    const { ctx } = this;
    const chain = obj.chains[obj.chainIndex];
    const sinceDrift = now - obj.chainChangedAt;
    const revealed = Math.min(chain.length, Math.floor(sinceDrift / CHAIN_REVEAL_MS) + 1);

    const fontSize = Math.max(11, Math.min(14, w * 0.055));
    ctx.save();
    ctx.font = `${fontSize}px "Space Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'bottom';

    // Build wrapped lines of "word →" segments that fit the viewport.
    const maxWidth = Math.min(this.canvas.clientWidth - 24, Math.max(w * 1.4, 220));
    const segments = chain.slice(0, revealed).map((word, i) => (i < revealed - 1 ? `${word} → ` : word));
    const lines: string[] = [];
    let line = '';
    for (const seg of segments) {
      if (line && ctx.measureText(line + seg).width > maxWidth) {
        lines.push(line);
        line = seg;
      } else {
        line += seg;
      }
    }
    if (line) lines.push(line);

    const lineHeight = fontSize * 1.45;
    let baseY = y - 12;
    const startX = Math.max(12, Math.min(x, this.canvas.clientWidth - maxWidth - 12));

    // If there is no room above, place the chain below the box.
    if (baseY - lines.length * lineHeight < 8) {
      baseY = y + lineHeight + 4 + (lines.length - 1) * lineHeight + 12;
      // (rendered top-down below the object)
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      const text = lines[i];
      const ty = baseY - (lines.length - 1 - i) * lineHeight + Math.sin(now / 1400 + i) * 1.5;
      const tw = ctx.measureText(text).width;

      // Translucent backing panel for legibility.
      ctx.globalAlpha = appear * 0.55;
      ctx.fillStyle = 'rgba(5, 9, 14, 0.7)';
      ctx.fillRect(startX - 5, ty - fontSize - 4, tw + 10, fontSize + 8);

      // Chromatic ghost + main text.
      ctx.globalAlpha = appear * 0.25;
      ctx.fillStyle = MAGENTA;
      ctx.fillText(text, startX + 1, ty + 0.5);
      ctx.globalAlpha = appear;
      ctx.fillStyle = i === lines.length - 1 ? '#eafff7' : PHOSPHOR;
      ctx.fillText(text, startX, ty);
    }

    // Blinking caret while the chain is still revealing.
    if (revealed < chain.length && Math.floor(now / 300) % 2 === 0) {
      const last = lines[lines.length - 1] ?? '';
      const tw = ctx.measureText(last).width;
      ctx.globalAlpha = appear;
      ctx.fillStyle = SIGNAL;
      ctx.fillRect(startX + tw + 3, baseY - fontSize, 6, fontSize);
    }
    ctx.restore();
  }
}

function canvasNeedsResize(c: HTMLCanvasElement, w: number, h: number, dpr: number): boolean {
  return c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr);
}
