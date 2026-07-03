/**
 * Optional AI enhancement layer. Talks to /api/latent-chain (a tiny
 * serverless function that proxies to the Anthropic API). Only the detected
 * label and other visible labels are sent — never camera frames.
 *
 * If the endpoint is missing (local dev, static hosting) or fails, the app
 * silently stays on the local curated dictionary.
 */

export interface AiResult {
  chain: string[];
  poem: string;
}

const ENDPOINT = '/api/latent-chain';
const TIMEOUT_MS = 7000;
const CACHE_KEY = 'latent-ai-cache-v1';
const MAX_CACHE = 60;

let available: boolean | null = null; // null = untested
let cache: Record<string, AiResult> = loadCache();

function loadCache(): Record<string, AiResult> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function persistCache(): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) {
      cache = Object.fromEntries(keys.slice(-MAX_CACHE).map((k) => [k, cache[k]]));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full — cache stays in memory */
  }
}

export function aiStatus(): 'unknown' | 'on' | 'off' {
  return available === null ? 'unknown' : available ? 'on' : 'off';
}

function isValid(r: unknown): r is AiResult {
  const c = r as AiResult;
  return (
    !!c &&
    Array.isArray(c.chain) &&
    c.chain.length >= 3 &&
    c.chain.every((w) => typeof w === 'string' && w.length < 60) &&
    typeof c.poem === 'string' &&
    c.poem.length > 0 &&
    c.poem.length < 400
  );
}

/**
 * Requests an AI-generated chain + poem for a label. Resolves null on any
 * failure; the caller keeps its local chain.
 */
export async function fetchLatentChain(
  label: string,
  sceneLabels: string[],
  fresh = false
): Promise<AiResult | null> {
  if (available === false) return null;
  if (!fresh && cache[label]) return cache[label];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        label,
        sceneContext: sceneLabels.filter((l) => l !== label).slice(0, 8).join(', '),
        tone: 'mystical, cosmic, cybernetic',
      }),
    });
    if (!res.ok) {
      // 404/405 means no backend deployed — stop asking this session.
      if (res.status === 404 || res.status === 405) available = false;
      return null;
    }
    const data: unknown = await res.json();
    if (!isValid(data)) return null;
    available = true;
    cache[label] = data;
    persistCache();
    return data;
  } catch {
    if (available === null) available = false; // network/timeout on first try
    return null;
  } finally {
    clearTimeout(timer);
  }
}
