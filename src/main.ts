/**
 * Latent Space Explorer — main orchestration.
 * Screen flow: landing → loader → scanner (⇄ sheet, ⇄ archive), with an
 * error screen for camera/model failures.
 */

import { startCamera, CameraError } from './camera';
import { loadModel, Tracker } from './detection';
import { OverlayRenderer } from './overlays';
import { PortalLayer } from './portal';
import { deleteDiscovery, discoveryCount, renderArchive, saveDiscovery } from './archive';
import type { TrackedObject } from './types';

/* ------------------------------------------------------------------ DOM */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const screens = {
  landing: $('landing'),
  loader: $('loader'),
  error: $('error'),
  scanner: $('scanner'),
  archive: $('archive'),
};

const video = $<HTMLVideoElement>('camera');
const overlayCanvas = $<HTMLCanvasElement>('overlay');
const portalCanvas = $<HTMLCanvasElement>('portal-layer');
const loaderStatus = $('loader-status');
const errorMessage = $('error-message');
const hudCount = $('hud-count');
const archiveCountBadge = $('archive-count');
const sheet = $('sheet');
const sheetLabel = $('sheet-label');
const sheetConfidence = $('sheet-confidence');
const sheetChain = $('sheet-chain');
const sheetPoem = $('sheet-poem');
const archiveGrid = $('archive-grid');
const archiveEmpty = $('archive-empty');
const toast = $('toast');

/* ---------------------------------------------------------------- state */

const tracker = new Tracker(video);
const overlay = new OverlayRenderer(overlayCanvas, video);
const portal = new PortalLayer(portalCanvas);

let running = false;
let selectedId: string | null = null;
let rafId = 0;
let toastTimer = 0;

function showScreen(name: keyof typeof screens): void {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('screen--visible', key === name);
  }
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2200);
}

function updateArchiveBadge(): void {
  archiveCountBadge.textContent = String(discoveryCount());
}

/* ----------------------------------------------------------- enter flow */

async function enterLatentSpace(): Promise<void> {
  showScreen('loader');
  try {
    loaderStatus.textContent = 'requesting camera…';
    const modelPromise = loadModel(); // load in parallel with permission
    await startCamera(video);

    loaderStatus.textContent = 'loading detection model…';
    await modelPromise;

    loaderStatus.textContent = 'calibrating semantic field…';
    await new Promise((r) => setTimeout(r, 400));

    showScreen('scanner');
    running = true;
    tracker.start();
    renderLoop();
    updateArchiveBadge();
  } catch (err) {
    running = false;
    tracker.stop();
    errorMessage.textContent =
      err instanceof CameraError
        ? err.message
        : 'The detection model could not be loaded. Check your connection and try again.';
    showScreen('error');
  }
}

/* ---------------------------------------------------------- render loop */

function renderLoop(): void {
  if (!running) return;
  const now = performance.now();
  tracker.update(now);
  const objects = tracker.list();

  // Drop the selection if its object left the frame.
  if (selectedId && !tracker.get(selectedId)) {
    selectedId = null;
    closeSheet();
  }

  overlay.render(objects, now, selectedId);
  portal.render(now);
  hudCount.textContent = `${objects.length} signal${objects.length === 1 ? '' : 's'}`;
  rafId = requestAnimationFrame(renderLoop);
}

/* ----------------------------------------------------- tap & hold input */

const TAP_MAX_MS = 350;
const HOLD_MS = 550;
const TAP_MAX_MOVE = 12;

let pointerDown: { x: number; y: number; t: number; holdTimer: number } | null = null;

function hitTest(x: number, y: number): TrackedObject | null {
  const map = overlay.mapper();
  let best: TrackedObject | null = null;
  let bestArea = Infinity;
  for (const obj of tracker.list()) {
    const [bx, by, bw, bh] = map(obj.smoothBBox);
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
      const area = bw * bh;
      if (area < bestArea) {
        bestArea = area;
        best = obj; // prefer the smallest (most specific) box
      }
    }
  }
  return best;
}

function triggerPortal(obj: TrackedObject): void {
  const [x, y, w, h] = overlay.mapper()(obj.smoothBBox);
  portal.bloom(x + w / 2, y + h / 2, Math.max(w, h));
}

portalCanvas.style.pointerEvents = 'none';
overlayCanvas.addEventListener('pointerdown', (e) => {
  const obj = hitTest(e.clientX, e.clientY);
  const holdTimer = window.setTimeout(() => {
    if (!pointerDown) return;
    pointerDown = null;
    if (obj && tracker.get(obj.id)) {
      // Portal bloom on hold, plus fresh poem — the "portal bloom" gesture.
      tracker.regenerate(obj.id);
      triggerPortal(obj);
      selectObject(obj.id);
    }
  }, HOLD_MS);
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), holdTimer };
});

overlayCanvas.addEventListener('pointermove', (e) => {
  if (!pointerDown) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  if (Math.hypot(dx, dy) > TAP_MAX_MOVE) {
    clearTimeout(pointerDown.holdTimer);
    pointerDown = null;
  }
});

overlayCanvas.addEventListener('pointerup', (e) => {
  if (!pointerDown) return;
  clearTimeout(pointerDown.holdTimer);
  const elapsed = performance.now() - pointerDown.t;
  pointerDown = null;
  if (elapsed > TAP_MAX_MS) return;

  const obj = hitTest(e.clientX, e.clientY);
  if (obj) {
    selectObject(obj.id);
  } else {
    selectedId = null;
    closeSheet();
  }
});

overlayCanvas.addEventListener('pointercancel', () => {
  if (pointerDown) clearTimeout(pointerDown.holdTimer);
  pointerDown = null;
});

/* --------------------------------------------------------- bottom sheet */

function selectObject(id: string): void {
  const obj = tracker.get(id);
  if (!obj) return;
  selectedId = id;
  fillSheet(obj);
  sheet.classList.add('sheet--open');
}

function fillSheet(obj: TrackedObject): void {
  sheetLabel.textContent = obj.label;
  sheetConfidence.textContent = `signal confidence ${(obj.confidence * 100).toFixed(0)}%`;
  sheetChain.innerHTML = '';
  const chain = obj.chains[obj.chainIndex];
  chain.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'sheet__chain-word';
    span.style.animationDelay = `${i * 90}ms`;
    span.textContent = word;
    sheetChain.append(span);
    if (i < chain.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'sheet__chain-arrow';
      arrow.textContent = '→';
      sheetChain.append(arrow);
    }
  });
  sheetPoem.textContent = obj.poem;
}

function closeSheet(): void {
  sheet.classList.remove('sheet--open');
}

$('sheet-close').addEventListener('click', () => {
  selectedId = null;
  closeSheet();
});

$('portal-btn').addEventListener('click', () => {
  const obj = selectedId ? tracker.get(selectedId) : null;
  if (obj) triggerPortal(obj);
});

$('regen-btn').addEventListener('click', () => {
  if (!selectedId) return;
  const obj = tracker.regenerate(selectedId);
  if (obj) fillSheet(obj);
});

$('save-btn').addEventListener('click', () => {
  const obj = selectedId ? tracker.get(selectedId) : null;
  if (!obj) return;
  const result = saveDiscovery(video, obj);
  if (result) {
    updateArchiveBadge();
    showToast('Discovery archived');
  } else {
    showToast('Archive is full — delete some discoveries');
  }
});

/* -------------------------------------------------------------- archive */

function refreshArchive(): void {
  renderArchive(archiveGrid, archiveEmpty, (id) => {
    deleteDiscovery(id);
    refreshArchive();
    updateArchiveBadge();
  });
}

$('archive-btn').addEventListener('click', () => {
  refreshArchive();
  screens.archive.classList.add('screen--visible');
});

$('archive-close').addEventListener('click', () => {
  screens.archive.classList.remove('screen--visible');
});

/* ----------------------------------------------------------- lifecycle */

$('enter-btn').addEventListener('click', () => void enterLatentSpace());
$('retry-btn').addEventListener('click', () => void enterLatentSpace());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    tracker.stop();
    cancelAnimationFrame(rafId);
  } else if (running) {
    tracker.start();
    renderLoop();
  }
});

window.addEventListener('resize', () => {
  if (running) overlay.resize();
});
