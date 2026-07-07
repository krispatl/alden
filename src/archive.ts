/**
 * Anomaly log: capture a camera frame, persist logged anomalies to
 * localStorage, and render the log with delete support.
 */

import type { Discovery, TrackedObject } from './types';
import { entityId, sessionStamp, noteSave } from './narrative';

const STORAGE_KEY = 'simulation-anomaly-log';
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
    return false;
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

/** Logs an anomaly. Returns the new entry, or null if storage failed. */
export function saveDiscovery(video: HTMLVideoElement, obj: TrackedObject): Discovery | null {
  const discovery: Discovery = {
    id: crypto.randomUUID(),
    imageDataUrl: captureFrame(video),
    label: obj.label,
    entityId: entityId(obj.id),
    fragment: obj.fragment,
    sessionStamp: sessionStamp(),
    createdAt: new Date().toISOString(),
  };
  const all = [discovery, ...loadDiscoveries()];
  if (persist(all)) {
    noteSave();
    return discovery;
  }
  const trimmed = all.slice(0, Math.max(1, all.length - 3));
  if (persist(trimmed)) {
    noteSave();
    return discovery;
  }
  return null;
}

/** Updates a logged entry's fragment (e.g. when the LLM narrator responds). */
export function updateDiscoveryFragment(id: string, fragment: string): void {
  const all = loadDiscoveries();
  const entry = all.find((d) => d.id === id);
  if (!entry) return;
  entry.fragment = fragment;
  persist(all);
}

export function deleteDiscovery(id: string): Discovery[] {
  const remaining = loadDiscoveries().filter((d) => d.id !== id);
  persist(remaining);
  return remaining;
}

/* ------------------------------------------------------------------ */
/* Log rendering                                                       */
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
    img.alt = `Logged ${d.label}`;
    img.loading = 'lazy';

    const body = document.createElement('div');
    body.className = 'discovery__body';

    const tag = document.createElement('p');
    tag.className = 'discovery__tag';
    tag.textContent = `${d.sessionStamp} · ${d.entityId} · ${d.label}`;

    const fragment = document.createElement('p');
    fragment.className = 'discovery__fragment';
    fragment.textContent = d.fragment;

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
    body.append(tag, fragment, foot);
    card.append(img, body);
    grid.append(card);
  }
}

export function discoveryCount(): number {
  return loadDiscoveries().length;
}
