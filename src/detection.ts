/**
 * Detection loop + tracker. YOLO runs every 600 ms; IoU matching keeps
 * stable ids across frames. Objects carry no narrative until activated —
 * the single-active-object model means fragments (and LLM calls) happen
 * only when the observer taps something.
 */

import type { BBox, TrackedObject } from './types';
import { loadDetector, detect } from './yolo';

const DETECT_INTERVAL_MS = 600;
const IOU_MATCH_THRESHOLD = 0.25;
const STALE_MS = 1500;

export { loadDetector as loadModel };

function iou(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

export class Tracker {
  private objects = new Map<string, TrackedObject>();
  private timer: number | null = null;
  private busy = false;

  constructor(private video: HTMLVideoElement) {}

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

  /** Called every render frame: smooths display boxes. */
  update(): void {
    for (const obj of this.objects.values()) {
      for (let i = 0; i < 4; i++) {
        obj.smoothBBox[i] += (obj.bbox[i] - obj.smoothBBox[i]) * 0.18;
      }
    }
  }

  /** Sets an object's fragment (from the narrative engine or the LLM). */
  setFragment(id: string, fragment: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.fragment = fragment;
    obj.fragmentChangedAt = performance.now();
  }

  private async detectOnce(): Promise<void> {
    if (this.busy || this.video.readyState < 2) return;
    this.busy = true;
    try {
      const predictions = await detect(this.video);
      const now = performance.now();

      const unmatched = new Set(this.objects.keys());
      for (const p of predictions) {
        let bestId: string | null = null;
        let bestIou = IOU_MATCH_THRESHOLD;
        for (const id of unmatched) {
          const existing = this.objects.get(id)!;
          if (existing.label !== p.label) continue;
          const score = iou(existing.bbox, p.bbox);
          if (score > bestIou) {
            bestIou = score;
            bestId = id;
          }
        }

        if (bestId) {
          const obj = this.objects.get(bestId)!;
          obj.bbox = p.bbox;
          obj.confidence = p.score;
          obj.lastSeen = now;
          unmatched.delete(bestId);
        } else {
          const obj: TrackedObject = {
            id: crypto.randomUUID(),
            label: p.label,
            confidence: p.score,
            bbox: p.bbox,
            smoothBBox: [...p.bbox] as BBox,
            fragment: '',
            fragmentChangedAt: 0,
            encounter: 0,
            createdAt: now,
            lastSeen: now,
          };
          this.objects.set(obj.id, obj);
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
