/**
 * Optional AI narrator client. Sends label + story state to the backend;
 * falls back silently when absent.
 */

import { activationCount, previousLabel, sessionSeconds } from './narrative';
import * as session from './session';

export interface AiResult { fragment: string; }

const ENDPOINT = '/api/latent-fragment';
const TIMEOUT_MS = 9000;
/** Vision: send a small crop of the tapped object so the narrator can
 *  reference real visual detail. Crop-only, tap-only. Set false to make
 *  the narrator text-only (nothing visual ever leaves the device). */
const SEND_VISION = true;
const CROP_MAX_SIDE = 320;
let available: boolean | null = null;

/** Crops the object's bbox (with 10% padding) from the live frame. */
export function cropObject(
  video: HTMLVideoElement,
  bbox: [number, number, number, number]
): string | null {
  try {
    const [x, y, w, h] = bbox;
    const padX = w * 0.1;
    const padY = h * 0.1;
    const sx = Math.max(0, x - padX);
    const sy = Math.max(0, y - padY);
    const sw = Math.min(video.videoWidth - sx, w + padX * 2);
    const sh = Math.min(video.videoHeight - sy, h + padY * 2);
    if (sw < 8 || sh < 8) return null;
    const scale = Math.min(1, CROP_MAX_SIDE / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    c.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

export function aiStatus(): 'unknown' | 'on' | 'off' {
  return available === null ? 'unknown' : available ? 'on' : 'off';
}

function isValid(r: unknown): r is AiResult {
  const c = r as AiResult;
  return !!c && typeof c.fragment === 'string' && c.fragment.length > 0 && c.fragment.length < 400;
}

export async function fetchFragment(
  label: string,
  encounter: number,
  sceneLabels: string[],
  imageDataUrl?: string | null
): Promise<AiResult | null> {
  if (available === false) return null;
  const s = session.load();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        label,
        encounter,
        prevLabel: previousLabel(),
        sceneContext: sceneLabels.filter((l) => l !== label).slice(0, 8).join(', '),
        activations: activationCount(),
        visits: s.visits,
        observerId: s.observerId,
        sessionMinutes: Math.floor(sessionSeconds() / 60),
        image: SEND_VISION && imageDataUrl ? imageDataUrl : undefined,
      }),
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 405) available = false;
      return null;
    }
    const data: unknown = await res.json();
    if (!isValid(data)) return null;
    available = true;
    return data;
  } catch {
    if (available === null) available = false;
    return null;
  } finally { clearTimeout(timer); }
}
