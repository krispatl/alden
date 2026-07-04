/**
 * AR particle layer — every tracked object emits particles tuned to its
 * category. Screens shed drifting pixels, plants release slow spores,
 * furniture stirs dust motes, vessels breathe a subtle vapor, etc.
 * Everything is anchored to the object's bounding box in screen space.
 */

import type { BBox } from './types';
import { categoryOf, type Category } from './narrative';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  shape: 'dot' | 'pixel' | 'streak' | 'glyph';
  hue: string;
  glyph?: string;
}

interface Emitter {
  label: string;
  category: Category;
  particles: Particle[];
  lastEmit: number;
}

const HUES = {
  phosphor: '#7af4d2',
  amber: '#ffb454',
  magenta: '#ff5ec4',
  white: '#eafff7',
};

const GLYPHS = ['◊', '△', '○', '□', '▽', '✕', '⌘', '§', '¶', '∆', '≈'];

/** Per-category emitter behavior. */
const BEHAVIOR: Record<
  Category,
  {
    emitPerSecond: number;
    life: [number, number];
    speed: [number, number];
    upward: number;
    shape: Particle['shape'];
    size: [number, number];
    hue: string;
    fromEdge?: boolean;
  }
> = {
  screen: {
    emitPerSecond: 8,
    life: [900, 1400],
    speed: [8, 22],
    upward: -0.5,
    shape: 'pixel',
    size: [1.4, 2.4],
    hue: HUES.phosphor,
  },
  seat: {
    emitPerSecond: 3,
    life: [2200, 3400],
    speed: [4, 10],
    upward: -0.35,
    shape: 'dot',
    size: [0.9, 1.6],
    hue: HUES.white,
  },
  vessel: {
    emitPerSecond: 2.5,
    life: [1400, 2200],
    speed: [3, 8],
    upward: -0.9,
    shape: 'dot',
    size: [1, 1.8],
    hue: HUES.phosphor,
    fromEdge: true,
  },
  flora: {
    emitPerSecond: 2,
    life: [3000, 5000],
    speed: [2, 6],
    upward: -0.15,
    shape: 'dot',
    size: [1.2, 2.2],
    hue: HUES.phosphor,
  },
  fauna: {
    emitPerSecond: 4,
    life: [1000, 1800],
    speed: [6, 14],
    upward: 0,
    shape: 'glyph',
    size: [8, 11],
    hue: HUES.amber,
  },
  human: {
    emitPerSecond: 3,
    life: [1200, 2000],
    speed: [5, 12],
    upward: -0.4,
    shape: 'glyph',
    size: [9, 12],
    hue: HUES.magenta,
  },
  vehicle: {
    emitPerSecond: 4,
    life: [900, 1600],
    speed: [10, 22],
    upward: 0.1,
    shape: 'streak',
    size: [2, 4],
    hue: HUES.amber,
  },
  text: {
    emitPerSecond: 5,
    life: [1400, 2400],
    speed: [4, 10],
    upward: -0.6,
    shape: 'glyph',
    size: [8, 11],
    hue: HUES.phosphor,
  },
  food: {
    emitPerSecond: 2,
    life: [1400, 2200],
    speed: [3, 7],
    upward: -0.5,
    shape: 'dot',
    size: [1, 1.8],
    hue: HUES.amber,
  },
  tool: {
    emitPerSecond: 3,
    life: [1000, 1600],
    speed: [6, 12],
    upward: 0,
    shape: 'pixel',
    size: [1.2, 2],
    hue: HUES.phosphor,
  },
  container: {
    emitPerSecond: 2.5,
    life: [1600, 2400],
    speed: [4, 9],
    upward: -0.3,
    shape: 'dot',
    size: [1, 1.8],
    hue: HUES.white,
  },
  surface: {
    emitPerSecond: 3,
    life: [2000, 3200],
    speed: [4, 10],
    upward: -0.4,
    shape: 'dot',
    size: [0.9, 1.6],
    hue: HUES.white,
  },
  artifact: {
    emitPerSecond: 3,
    life: [1400, 2400],
    speed: [5, 11],
    upward: -0.3,
    shape: 'dot',
    size: [1.1, 1.9],
    hue: HUES.phosphor,
  },
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class ParticleLayer {
  private emitters = new Map<string, Emitter>();
  private lastTick = performance.now();

  /**
   * Steps physics for all active emitters and returns the set of live ids
   * so the caller can prune. `rects` is the current on-screen box per id.
   */
  step(now: number, rects: Map<string, { rect: BBox; label: string }>): void {
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;

    // Drop emitters whose object is gone.
    for (const id of [...this.emitters.keys()]) {
      if (!rects.has(id)) this.emitters.delete(id);
    }

    for (const [id, info] of rects) {
      let em = this.emitters.get(id);
      if (!em) {
        em = {
          label: info.label,
          category: categoryOf(info.label),
          particles: [],
          lastEmit: now,
        };
        this.emitters.set(id, em);
      }
      const b = BEHAVIOR[em.category];

      // Emit particles at a steady rate.
      const wanted = ((now - em.lastEmit) / 1000) * b.emitPerSecond;
      const toSpawn = Math.min(6, Math.floor(wanted));
      if (toSpawn > 0) em.lastEmit = now;
      for (let i = 0; i < toSpawn; i++) {
        const [x, y, w, h] = info.rect;
        const originX = b.fromEdge ? x + Math.random() * w : x + w * 0.25 + Math.random() * w * 0.5;
        const originY = b.fromEdge
          ? y + (Math.random() < 0.5 ? h * 0.1 : h * 0.9)
          : y + h * 0.4 + Math.random() * h * 0.4;
        const speed = rand(b.speed[0], b.speed[1]);
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
        const life = rand(b.life[0], b.life[1]);
        em.particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + b.upward * speed,
          life,
          maxLife: life,
          size: rand(b.size[0], b.size[1]),
          shape: b.shape,
          hue: b.hue,
          glyph: b.shape === 'glyph' ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : undefined,
        });
      }

      // Advance and cull.
      for (const p of em.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= dt * 1000;
      }
      em.particles = em.particles.filter((p) => p.life > 0);
      // Cap particle count for perf.
      if (em.particles.length > 60) em.particles.splice(0, em.particles.length - 60);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const em of this.emitters.values()) {
      for (const p of em.particles) {
        const life = p.life / p.maxLife;
        const fadeIn = Math.min(1, (p.maxLife - p.life) / 200);
        const alpha = life * fadeIn;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.hue;
        if (p.shape === 'pixel') {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else if (p.shape === 'streak') {
          ctx.fillRect(p.x, p.y, p.size * 3, 1);
        } else if (p.shape === 'glyph' && p.glyph) {
          ctx.font = `${p.size}px "Space Mono", ui-monospace, monospace`;
          ctx.fillText(p.glyph, p.x, p.y);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}
