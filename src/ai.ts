/**
 * Optional AI enhancement layer. Talks to /api/latent-fragment (a tiny
 * serverless function that proxies to an LLM provider). Only detected
 * labels and story state are sent — never camera frames.
 *
 * If the endpoint is missing (local dev, static hosting) or fails, the app
 * silently stays on the local narrative engine.
 */

import { previousLabel, sessionSeconds } from './narrative';

export interface AiResult {
  fragment: string;
}

const ENDPOINT = '/api/latent-fragment';
const TIMEOUT_MS = 7000;

let available: boolean | null = null; // null = untested

export function aiStatus(): 'unknown' | 'on' | 'off' {
  return available === null ? 'unknown' : available ? 'on' : 'off';
}

function isValid(r: unknown): r is AiResult {
  const c = r as AiResult;
  return !!c && typeof c.fragment === 'string' && c.fragment.length > 0 && c.fragment.length < 400;
}

/**
 * Requests an AI-generated fragment for a label. Resolves null on any
 * failure; the caller keeps its local fragment.
 */
export async function fetchFragment(
  label: string,
  encounter: number,
  sceneLabels: string[]
): Promise<AiResult | null> {
  if (available === false) return null;

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
  } finally {
    clearTimeout(timer);
  }
}
