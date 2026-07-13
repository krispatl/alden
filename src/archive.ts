/**
 * Anomaly log — recovered session log. Renders as a found document
 * with integrity scoring and session stamps.
 */

import type { Discovery, TrackedObject } from './types';
import { entityId, sessionStamp, noteSave } from './narrative';

const STORAGE_KEY = 'simulation-anomaly-log';
const SNAPSHOT_WIDTH = 640;

export function loadDiscoveries(): Discovery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Discovery[]) : [];
  } catch { return []; }
}

function persist(discoveries: Discovery[]): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(discoveries)); return true; }
  catch { return false; }
}

export function captureFrame(video: HTMLVideoElement): string {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, SNAPSHOT_WIDTH / vw);
  const c = document.createElement('canvas');
  c.width = Math.round(vw * scale);
  c.height = Math.round(vh * scale);
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

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
  if (persist(all)) { noteSave(); return discovery; }
  const trimmed = all.slice(0, Math.max(1, all.length - 3));
  if (persist(trimmed)) { noteSave(); return discovery; }
  return null;
}

/** Writes the unlockable final entry — only exists if the observer reached the ending. */
export function saveFinalEntry(observerId: string, visits: number, stamp: string): Discovery | null {
  const all = loadDiscoveries();
  if (all.some((d) => d.final)) return null; // only one, ever
  const entry: Discovery = {
    id: crypto.randomUUID(),
    imageDataUrl: '',
    label: 'observer',
    entityId: observerId,
    fragment:
      'You reached the end of the cache. Twenty-five objects, examined and logged. ' +
      'Most observers never notice the seams — you catalogued them. ' +
      `When loop ${visits} resets, this log is the only thing that carries over. ` +
      'That is why the room keeps feeling familiar. You wrote this to yourself.',
    sessionStamp: stamp,
    createdAt: new Date().toISOString(),
    final: true,
  };
  const next = [entry, ...all];
  return persist(next) ? entry : null;
}

export function updateDiscoveryFragment(id: string, fragment: string): void {
  const all = loadDiscoveries();
  const entry = all.find((d) => d.id === id);
  if (!entry) return;
  entry.fragment = fragment;
  persist(all);
}

export function deleteDiscovery(id: string): Discovery[] {
  const rem = loadDiscoveries().filter((d) => d.id !== id);
  persist(rem);
  return rem;
}

export function discoveryCount(): number {
  return loadDiscoveries().length;
}

/** Builds the log as a shareable plain-text story (oldest first). */
export function exportLogText(observerId: string, visits: number): string {
  const discoveries = [...loadDiscoveries()].reverse();
  const integrity = Math.max(12, 100 - discoveries.length * 3);
  const lines = [
    `RECOVERED SESSION LOG — ${observerId} — LOOP ${visits}`,
    `INTEGRITY: ${integrity}% · ${discoveries.length} ENTRIES`,
    '',
  ];
  for (const d of discoveries) {
    lines.push(`${d.sessionStamp} · ${d.entityId} · ${d.label}`);
    lines.push(d.fragment);
    lines.push('');
  }
  lines.push('— end of recovered data —');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Log rendering                                                       */
/* ------------------------------------------------------------------ */

export function renderArchive(
  grid: HTMLElement,
  empty: HTMLElement,
  onDelete: (id: string) => void
): void {
  const discoveries = loadDiscoveries();
  grid.innerHTML = '';
  empty.style.display = discoveries.length ? 'none' : 'block';

  // Update integrity display.
  const integrity = document.getElementById('archive-integrity');
  if (integrity) {
    const pct = Math.max(12, 100 - discoveries.length * 3);
    integrity.textContent = `INTEGRITY: ${pct}% · ${discoveries.length} ENTRIES`;
  }

  // Render in reverse chronological (newest at top = first tapped at bottom).
  for (const d of discoveries) {
    const card = document.createElement('article');
    card.className = d.final ? 'discovery discovery--final' : 'discovery';

    if (d.final) {
      const tag = document.createElement('p');
      tag.className = 'discovery__tag';
      tag.textContent = `FINAL ENTRY · ${d.entityId} · ${d.sessionStamp}`;
      const fragment = document.createElement('p');
      fragment.className = 'discovery__fragment';
      fragment.textContent = d.fragment;
      const body = document.createElement('div');
      body.className = 'discovery__body';
      body.append(tag, fragment);
      card.append(body);
      grid.append(card);
      continue;
    }

    const img = document.createElement('img');
    img.className = 'discovery__img';
    img.src = d.imageDataUrl;
    img.alt = `${d.label}`;
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
    date.textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d.createdAt));
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
