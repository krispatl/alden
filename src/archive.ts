/**
 * Discovery archive: capture a camera frame, persist discoveries to
 * localStorage, and render the gallery grid with delete support.
 */

import type { Discovery, TrackedObject } from './types';

const STORAGE_KEY = 'latent-discoveries';
const SNAPSHOT_WIDTH = 640;

export function loadDiscoveries(): Discovery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Discovery[]) : [];
  } catch {
    return [];
  }
}

function persist(discoveries: Discovery[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(discoveries));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable
  }
}

/** Captures the current video frame as a compact JPEG data URL. */
export function captureFrame(video: HTMLVideoElement): string {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, SNAPSHOT_WIDTH / vw);
  const c = document.createElement('canvas');
  c.width = Math.round(vw * scale);
  c.height = Math.round(vh * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

/**
 * Saves a discovery for a tracked object. Returns the updated list, or null
 * if storage failed (e.g. quota exceeded).
 */
export function saveDiscovery(video: HTMLVideoElement, obj: TrackedObject): Discovery[] | null {
  const discovery: Discovery = {
    id: crypto.randomUUID(),
    imageDataUrl: captureFrame(video),
    originalLabel: obj.label,
    latentChain: [...obj.chains[obj.chainIndex]],
    poeticText: obj.poem,
    createdAt: new Date().toISOString(),
  };
  const all = [discovery, ...loadDiscoveries()];
  if (persist(all)) return all;

  // Quota fallback: drop the oldest entries and retry once.
  const trimmed = all.slice(0, Math.max(1, all.length - 3));
  return persist(trimmed) ? trimmed : null;
}

export function deleteDiscovery(id: string): Discovery[] {
  const remaining = loadDiscoveries().filter((d) => d.id !== id);
  persist(remaining);
  return remaining;
}

/* ------------------------------------------------------------------ */
/* Gallery rendering                                                   */
/* ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function renderArchive(
  grid: HTMLElement,
  empty: HTMLElement,
  onDelete: (id: string) => void
): void {
  const discoveries = loadDiscoveries();
  grid.innerHTML = '';
  empty.style.display = discoveries.length ? 'none' : 'block';

  for (const d of discoveries) {
    const card = document.createElement('article');
    card.className = 'discovery';

    const img = document.createElement('img');
    img.className = 'discovery__img';
    img.src = d.imageDataUrl;
    img.alt = `Snapshot of ${d.originalLabel}`;
    img.loading = 'lazy';

    const body = document.createElement('div');
    body.className = 'discovery__body';

    const chain = document.createElement('p');
    chain.className = 'discovery__chain';
    chain.textContent = d.latentChain.join(' → ');

    const poem = document.createElement('p');
    poem.className = 'discovery__poem';
    poem.textContent = d.poeticText;

    const foot = document.createElement('div');
    foot.className = 'discovery__foot';

    const date = document.createElement('span');
    date.className = 'discovery__date';
    date.textContent = dateFmt.format(new Date(d.createdAt));

    const del = document.createElement('button');
    del.className = 'btn btn--tiny';
    del.textContent = 'Delete';
    del.addEventListener('click', () => onDelete(d.id));

    foot.append(date, del);
    body.append(chain, poem, foot);
    card.append(img, body);
    grid.append(card);
  }
}

export function discoveryCount(): number {
  return loadDiscoveries().length;
}
