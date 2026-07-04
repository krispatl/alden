/**
 * Latent Space Explorer — main orchestration.
 * Screen flow: landing → loader → onboarding (first run) → scanner
 * (⇄ sheet, ⇄ anomaly log), with an error screen for camera/model failures.
 */

import { startCamera, CameraError } from './camera';
import { loadModel, Tracker } from './detection';
import { OverlayRenderer } from './overlays';
import { HologramLayer } from './hologram';
import { AudioEngine } from './audio';
import { deleteDiscovery, discoveryCount, renderArchive, saveDiscovery } from './archive';
import { aiStatus, fetchFragment } from './ai';
import { ambientLine, assetPath, categoryOf, entityId, lodTag } from './narrative';
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
const holoCanvas = $<HTMLCanvasElement>('holo-layer');
const loaderStatus = $('loader-status');
const errorMessage = $('error-message');
const hudCount = $('hud-count');
const hudTicker = $('hud-ticker');
const archiveCountBadge = $('archive-count');
const sheet = $('sheet');
const sheetLabel = $('sheet-label');
const sheetTelemetry = $('sheet-telemetry');
const sheetFragment = $('sheet-fragment');
const archiveGrid = $('archive-grid');
const archiveEmpty = $('archive-empty');
const toast = $('toast');
const onboarding = $('onboarding');
const onboardText = $('onboard-text');

/* ---------------------------------------------------------------- state */

const tracker = new Tracker(video);
const overlay = new OverlayRenderer(overlayCanvas, video);
const hologram = new HologramLayer(holoCanvas);
const audio = new AudioEngine();

let running = false;
let selectedId: string | null = null;
let rafId = 0;
let toastTimer = 0;
let tickerTimer = 0;
let lastAmbientGlitchCount = 0;

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

/* --------------------------------------------------------- AI enrichment */

// When a new object enters tracking, ask the (optional) backend for a
// bespoke fragment. Only labels + story state are sent — never frames.
tracker.onCreate = (obj) => {
  audio.detect();
  void fetchFragment(obj.label, obj.encounter, tracker.labels()).then((result) => {
    if (!result || !tracker.get(obj.id)) return;
    tracker.applyAi(obj.id, result.fragment);
    if (selectedId === obj.id) fillSheet(tracker.get(obj.id)!);
  });
};

// Audio tick when any on-screen fragment finishes typing out.
overlay.onReveal = () => audio.tick();

/* ----------------------------------------------------------- enter flow */

async function enterLatentSpace(): Promise<void> {
  audio.init(); // must happen inside the user gesture
  showScreen('loader');
  try {
    loaderStatus.textContent = 'requesting camera…';
    const modelPromise = loadModel();
    await startCamera(video);

    loaderStatus.textContent = 'loading renderer hooks…';
    await modelPromise;

    loaderStatus.textContent = 'attaching observer…';
    await new Promise((r) => setTimeout(r, 400));

    showScreen('scanner');
    running = true;
    tracker.start();
    renderLoop();
    startTicker();
    updateArchiveBadge();
    maybeOnboard();
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

/* ------------------------------------------------------------ onboarding */

const ONBOARD_KEY = 'lse-onboarded';
const ONBOARD_STEPS = [
  'Look around slowly. When the system recognizes an object, it frames it — and tells you something about how it\u2019s being rendered.',
  'TAP a framed object to read its full entry. HOLD one to inspect it up close and see its render primitive.',
  'When something feels wrong — an object that loads late, a detail that doesn\u2019t add up — LOG IT. Your anomaly log is the story of what you noticed.',
];
let onboardStep = 0;

function maybeOnboard(): void {
  if (localStorage.getItem(ONBOARD_KEY)) return;
  onboardStep = 0;
  onboardText.textContent = ONBOARD_STEPS[0];
  $('onboard-next').textContent = 'Next';
  onboarding.hidden = false;
}

function endOnboarding(): void {
  onboarding.hidden = true;
  localStorage.setItem(ONBOARD_KEY, '1');
}

$('onboard-next').addEventListener('click', () => {
  onboardStep += 1;
  if (onboardStep >= ONBOARD_STEPS.length) {
    endOnboarding();
    return;
  }
  onboardText.textContent = ONBOARD_STEPS[onboardStep];
  if (onboardStep === ONBOARD_STEPS.length - 1) $('onboard-next').textContent = 'Begin';
});

$('onboard-skip').addEventListener('click', endOnboarding);

/* ------------------------------------------------------------- HUD ticker */

function startTicker(): void {
  clearInterval(tickerTimer);
  tickerTimer = window.setInterval(() => {
    hudTicker.textContent = ambientLine();
  }, 6000);
}

/* ---------------------------------------------------------- render loop */

function renderLoop(): void {
  if (!running) return;
  const now = performance.now();
  tracker.update(now);
  const objects = tracker.list();

  if (selectedId && !tracker.get(selectedId)) {
    selectedId = null;
    closeSheet();
  }

  overlay.render(objects, now, selectedId);
  hologram.tick(now);

  // Quiet stutter sound when an ambient render anomaly fires.
  const glitchCount = overlay.glitch.eventCount;
  if (glitchCount > lastAmbientGlitchCount) audio.glitch();
  lastAmbientGlitchCount = glitchCount;

  const mode = aiStatus() === 'on' ? ' · live narrator' : '';
  hudCount.textContent = `${objects.length} entit${objects.length === 1 ? 'y' : 'ies'}${mode}`;
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
        best = obj;
      }
    }
  }
  return best;
}

/** Inspect gesture: glitch burst + hologram + sound + select. */
function inspect(obj: TrackedObject): void {
  const rect = overlay.mapper()(obj.smoothBBox);
  overlay.glitch.inspectBurst(rect);
  hologram.show(categoryOf(obj.label), () => {
    const o = tracker.get(obj.id);
    return o ? overlay.mapper()(o.smoothBBox) : null;
  });
  audio.inspect();
  if (navigator.vibrate) navigator.vibrate(30);
  selectObject(obj.id);
}

holoCanvas.style.pointerEvents = 'none';
overlayCanvas.addEventListener('pointerdown', (e) => {
  const obj = hitTest(e.clientX, e.clientY);
  const holdTimer = window.setTimeout(() => {
    if (!pointerDown) return;
    pointerDown = null;
    if (obj && tracker.get(obj.id)) inspect(obj);
  }, HOLD_MS);
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), holdTimer };
});

overlayCanvas.addEventListener('pointermove', (e) => {
  if (!pointerDown) return;
  if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > TAP_MAX_MOVE) {
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
  sheetTelemetry.textContent = `${entityId(obj.id)} · ${assetPath(obj.label, obj.id)} · ${lodTag(obj.id)} · ${(obj.confidence * 100).toFixed(0)}%`;
  sheetFragment.textContent = obj.fragment;
}

function closeSheet(): void {
  sheet.classList.remove('sheet--open');
}

$('sheet-close').addEventListener('click', () => {
  selectedId = null;
  closeSheet();
});

$('inspect-btn').addEventListener('click', () => {
  const obj = selectedId ? tracker.get(selectedId) : null;
  if (obj) inspect(obj);
});

$('regen-btn').addEventListener('click', () => {
  if (!selectedId) return;
  const id = selectedId;
  const obj = tracker.regenerate(id); // instant local reading
  if (obj) fillSheet(obj);
  if (obj && aiStatus() === 'on') {
    void fetchFragment(obj.label, obj.encounter, tracker.labels()).then((result) => {
      if (!result || selectedId !== id || !tracker.get(id)) return;
      tracker.applyAi(id, result.fragment);
      fillSheet(tracker.get(id)!);
    });
  }
});

$('save-btn').addEventListener('click', () => {
  const obj = selectedId ? tracker.get(selectedId) : null;
  if (!obj) return;
  const result = saveDiscovery(video, obj);
  if (result) {
    updateArchiveBadge();
    audio.log();
    showToast('Anomaly logged');
  } else {
    showToast('Log is full — delete some entries');
  }
});

/* --------------------------------------------------------------- audio ui */

const muteBtn = $('mute-btn');
function reflectMute(): void {
  muteBtn.textContent = audio.muted ? '◇' : '◈';
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
}
muteBtn.addEventListener('click', () => {
  audio.toggleMute();
  reflectMute();
});
reflectMute();

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
    audio.suspend();
  } else if (running) {
    tracker.start();
    renderLoop();
    audio.resume();
  }
});

window.addEventListener('resize', () => {
  if (running) {
    overlay.resize();
    hologram.resize();
  }
});
