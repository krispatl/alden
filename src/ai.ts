/**
 * Optional AI narrator client. Sends label + story state to the backend;
 * falls back silently when absent.
 */

import { activationCount, previousLabel, sessionSeconds } from './narrative';
import * as session from './session';

export interface AiResult { fragment: string; }

const ENDPOINT = '/api/latent-fragment';
const TIMEOUT_MS = 7000;
let available: boolean | null = null;

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
  sceneLabels: string[]
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
