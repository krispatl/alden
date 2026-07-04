/**
 * Object detection: loads COCO-SSD and runs a throttled detection loop,
 * tracking objects across frames (IoU matching) so each object keeps a
 * stable id and narrative while it stays in view.
 */

import type * as cocoSsd from '@tensorflow-models/coco-ssd';
import type { BBox, TrackedObject } from './types';
import { generateFragment, noteEncounter } from './narrative';

const DETECT_INTERVAL_MS = 500;
const MIN_CONFIDENCE = 0.55;
const IOU_MATCH_THRESHOLD = 0.25;
const STALE_MS = 1400;
const DRIFT_MS = 11000;

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

export class Tracker {
  private objects = new Map<string, TrackedObject>();
  private timer: number | null = null;
  private busy = false;
  /** Called whenever a new object enters tracking. */
  onCreate: ((obj: TrackedObject) => void) | null = null;

  constructor(private video: HTMLVideoElement) {}

  /** All currently tracked objects. */
  list(): TrackedObject[] {
    return [...this.objects.values()];
  }

  labels(): string[] {
    return this.list().map((o) => o.label);
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

  /** Called every render frame: smooths boxes and refreshes stale fragments. */
  update(now: number): void {
    for (const obj of this.objects.values()) {
      for (let i = 0; i < 4; i++) {
        obj.smoothBBox[i] += (obj.bbox[i] - obj.smoothBBox[i]) * 0.18;
      }
      // Narrative drift: the system re-reads the object every so often.
      if (now - obj.fragmentChangedAt > DRIFT_MS) {
        obj.fragment = generateFragment(obj, this.labels());
        obj.fragmentChangedAt = now;
      }
    }
  }

  /** Re-rolls the fragment for one object (New reading). */
  regenerate(id: string): TrackedObject | undefined {
    const obj = this.objects.get(id);
    if (!obj) return undefined;
    obj.fragment = generateFragment(obj, this.labels());
    obj.fragmentChangedAt = performance.now();
    return obj;
  }

  /** Replaces the fragment with an AI-generated one. */
  applyAi(id: string, fragment: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.fragment = fragment;
    obj.fragmentChangedAt = performance.now();
  }

  private createTracked(label: string, confidence: number, bbox: BBox): TrackedObject {
    const now = performance.now();
    const encounter = noteEncounter(label);
    const obj: TrackedObject = {
      id: crypto.randomUUID(),
      label,
      confidence,
      bbox,
      smoothBBox: [...bbox] as BBox,
      fragment: '',
      fragmentChangedAt: now,
      encounter,
      createdAt: now,
      lastSeen: now,
    };
    obj.fragment = generateFragment(obj, this.labels().concat(label));
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
          const created = this.createTracked(p.class, p.score, bbox);
          this.objects.set(created.id, created);
          this.onCreate?.(created);
        }
      }

      for (const [id, obj] of this.objects) {
        if (now - obj.lastSeen > STALE_MS) this.objects.delete(id);
      }
    } catch {
      /* transient detection errors are non-fatal */
    } finally {
      this.busy = false;
    }
  }
}
