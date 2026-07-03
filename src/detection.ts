/**
 * Object detection: loads COCO-SSD and runs a throttled detection loop,
 * tracking objects across frames (IoU matching) so each object keeps a
 * stable id, chain, and poem while it stays in view.
 */

import type * as cocoSsd from '@tensorflow-models/coco-ssd';
import type { BBox, TrackedObject } from './types';
import { generatePoem, getChains, randomChainIndex } from './latentChains';

const DETECT_INTERVAL_MS = 500;
const MIN_CONFIDENCE = 0.55;
const IOU_MATCH_THRESHOLD = 0.25;
const STALE_MS = 1400;
const DRIFT_MS = 8000;

let model: cocoSsd.ObjectDetection | null = null;

/** Loads TFJS + COCO-SSD once (code-split so the landing screen stays light). */
export async function loadModel(): Promise<void> {
  if (model) return;
  const [tf, coco] = await Promise.all([
    import('@tensorflow/tfjs'),
    import('@tensorflow-models/coco-ssd'),
  ]);
  await tf.ready();
  model = await coco.load({ base: 'lite_mobilenet_v2' });
}

function iou(a: BBox, b: BBox): number {
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

function createTracked(label: string, confidence: number, bbox: BBox): TrackedObject {
  const chains = getChains(label);
  const now = performance.now();
  return {
    id: crypto.randomUUID(),
    label,
    confidence,
    bbox,
    smoothBBox: [...bbox] as BBox,
    chains,
    chainIndex: randomChainIndex(chains),
    chainChangedAt: now,
    poem: generatePoem(label),
    createdAt: now,
    lastSeen: now,
  };
}

export class Tracker {
  private objects = new Map<string, TrackedObject>();
  private timer: number | null = null;
  private busy = false;

  constructor(private video: HTMLVideoElement) {}

  /** All currently tracked objects. */
  list(): TrackedObject[] {
    return [...this.objects.values()];
  }

  get(id: string): TrackedObject | undefined {
    return this.objects.get(id);
  }

  start(): void {
    if (this.timer !== null) return;
    const tick = async () => {
      await this.detectOnce();
      this.timer = window.setTimeout(tick, DETECT_INTERVAL_MS);
    };
    this.timer = window.setTimeout(tick, 0);
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Called every render frame: smooths boxes and advances semantic drift. */
  update(now: number): void {
    for (const obj of this.objects.values()) {
      // Ease the display box toward the latest detection.
      for (let i = 0; i < 4; i++) {
        obj.smoothBBox[i] += (obj.bbox[i] - obj.smoothBBox[i]) * 0.18;
      }
      // Semantic drift: rotate through chain variants.
      if (obj.chains.length > 1 && now - obj.chainChangedAt > DRIFT_MS) {
        obj.chainIndex = (obj.chainIndex + 1) % obj.chains.length;
        obj.chainChangedAt = now;
      }
    }
  }

  /** Re-rolls the chain variant and poem for one object (Regenerate). */
  regenerate(id: string): TrackedObject | undefined {
    const obj = this.objects.get(id);
    if (!obj) return undefined;
    if (obj.chains.length > 1) {
      let next = obj.chainIndex;
      while (next === obj.chainIndex) next = randomChainIndex(obj.chains);
      obj.chainIndex = next;
    }
    obj.chainChangedAt = performance.now();
    obj.poem = generatePoem(obj.label);
    return obj;
  }

  private async detectOnce(): Promise<void> {
    if (!model || this.busy || this.video.readyState < 2) return;
    this.busy = true;
    try {
      const predictions = await model.detect(this.video);
      const now = performance.now();

      const unmatched = new Set(this.objects.keys());
      for (const p of predictions) {
        if (p.score < MIN_CONFIDENCE) continue;
        const bbox = p.bbox as BBox;

        // Match against an existing object of the same label.
        let bestId: string | null = null;
        let bestIou = IOU_MATCH_THRESHOLD;
        for (const id of unmatched) {
          const existing = this.objects.get(id)!;
          if (existing.label !== p.class) continue;
          const score = iou(existing.bbox, bbox);
          if (score > bestIou) {
            bestIou = score;
            bestId = id;
          }
        }

        if (bestId) {
          const obj = this.objects.get(bestId)!;
          obj.bbox = bbox;
          obj.confidence = p.score;
          obj.lastSeen = now;
          unmatched.delete(bestId);
        } else {
          const created = createTracked(p.class, p.score, bbox);
          this.objects.set(created.id, created);
        }
      }

      // Drop objects that have not been seen recently.
      for (const [id, obj] of this.objects) {
        if (now - obj.lastSeen > STALE_MS) this.objects.delete(id);
      }
    } catch {
      /* transient detection errors (e.g. during resize) are non-fatal */
    } finally {
      this.busy = false;
    }
  }
}
