/**
 * Latent Space Explorer — main orchestration.
 *
 * Interaction model (v0.3): brackets appear on everything the system sees;
 * TAP one object to activate it — fragment types out, particles start, and
 * the moment is auto-logged to the anomaly log. Tap it again for a new
 * reading. HOLD to inspect (hologram + glitch burst). The log is the story.
 */

import { startCamera, CameraError } from './camera';
import { loadModel, Tracker } from './detection';
import { OverlayRenderer } from './overlays';
import { HologramLayer } from './hologram';
import { AudioEngine } from './audio';
import {
  deleteDiscovery,
  discoveryCount,
  renderArchive,
  saveDiscovery,
  updateDiscoveryFragment,
} from './archive';
import { aiStatus, fetchFragment } from './ai';
import { ambientLine, categoryOf, generateFragment, noteActivation } from './narrative';
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
let activeId: string | null = null;
/** Log entry created for the current activation (updated if the LLM lands). */
let activeLogId: string | null = null;
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

/* ----------------------------------------------------------- activation */

/**
 * The core gesture. Activating an object: generates its reading, logs it,
 * starts its particles, and (if a narrator backend exists) requests a
 * bespoke fragment which then updates both the display and the log entry.
 */
function activate(obj: TrackedObject): void {
  const isReactivation = obj.id === activeId;
  activeId = obj.id;

  if (!isReactivation) obj.encounter = noteActivation(obj.label);
  tracker.setFragment(obj.id, generateFragment(obj, tracker.labels()));
  audio.detect();

  // Auto-log: first activation creates the entry; re-taps refresh it.
  if (!isReactivation || !activeLogId) {
    const entry = saveDiscovery(video, obj);
    if (entry) {
      activeLogId = entry.id;
      updateArchiveBadge();
      audio.log();
      showToast('Logged to anomaly log');
    } else {
      activeLogId = null;
      showToast('Log is full — delete some entries');
    }
  } else {
    updateDiscoveryFragment(activeLogId, obj.fragment);
  }

  // Live narrator (one call per activation; silently absent otherwise).
  const logIdAtRequest = activeLogId;
  void fetchFragment(obj.label, obj.encounter, tracker.labels()).then((result) => {
    if (!result) return;
    if (logIdAtRequest) updateDiscoveryFragment(logIdAtRequest, result.fragment);
    if (activeId === obj.id && tracker.get(obj.id)) {
      tracker.setFragment(obj.id, result.fragment);
    }
  });
}

function deactivate(): void {
  activeId = null;
  activeLogId = null;
}

/** Inspect gesture: glitch burst + hologram + sound. */
function inspect(obj: TrackedObject): void {
  if (obj.id !== activeId) activate(obj);
  const rect = overlay.mapper()(obj.smoothBBox);
  overlay.glitch.inspectBurst(rect);
  hologram.show(categoryOf(obj.label), () => {
    const o = tracker.get(obj.id);
    return o ? overlay.mapper()(o.smoothBBox) : null;
  });
  audio.inspect();
  if (navigator.vibrate) navigator.vibrate(30);
}

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
  'Look around slowly. When the system recognizes an object, a faint frame appears — it\u2019s being rendered for you.',
  'TAP one object. It lights up, tells you something about how it\u2019s being rendered — and the moment is saved to your anomaly log automatically. Tap again for a new reading.',
  'HOLD an object to inspect its render primitive up close. When you\u2019re done exploring, open the ANOMALY LOG — it\u2019s the story of everything you noticed.',
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
  tracker.update();
  const objects = tracker.list();

  if (activeId && !tracker.get(activeId)) deactivate();

  overlay.render(objects, now, activeId);
  hologram.tick(now);

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
  if (obj) activate(obj);
  else deactivate();
});

overlayCanvas.addEventListener('pointercancel', () => {
  if (pointerDown) clearTimeout(pointerDown.holdTimer);
  pointerDown = null;
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
    if (id === activeLogId) activeLogId = null;
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
