/**
 * Latent Space Explorer — The Witness
 *
 * Interaction: faint brackets on everything → tap to activate (auto-logged)
 * → hold to inspect (hologram). The anomaly log is the story.
 *
 * Camera feed shifts subtly per act. Sound arc evolves. Session persists.
 */

import { startCamera, CameraError } from './camera';
import { loadModel, Tracker } from './detection';
import { OverlayRenderer } from './overlays';
import { HologramLayer } from './hologram';
import { AudioEngine } from './audio';
import {
  deleteDiscovery, discoveryCount, exportLogText, renderArchive,
  saveDiscovery, updateDiscoveryFragment,
} from './archive';
import { aiStatus, fetchFragment } from './ai';
import {
  activationCount, ambientLine, categoryOf, generateFragment,
  isEnded, noteActivation,
} from './narrative';
import * as session from './session';
import type { TrackedObject } from './types';

/* ------------------------------------------------------------------ DOM */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
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
const hudObserver = $('hud-observer');
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
let activeLogId: string | null = null;
let rafId = 0;
let toastTimer = 0;
let tickerTimer = 0;
let lastGlitchCount = 0;
let endingTriggered = false;

function showScreen(name: keyof typeof screens): void {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('screen--visible', key === name);
  }
}

function showToast(msg: string): void {
  toast.textContent = msg;
  toast.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2200);
}

function updateBadge(): void {
  archiveCountBadge.textContent = String(discoveryCount());
}

/* ------------------------------------------------------ camera feed arc */

function updateCameraArc(): void {
  const a = activationCount();
  if (a < 6) {
    video.style.filter = 'saturate(0.88) contrast(1.02)';
  } else if (a < 11) {
    video.style.filter = 'saturate(0.78) contrast(1.04) brightness(0.97)';
  } else if (a < 18) {
    video.style.filter = 'saturate(0.65) contrast(1.06) brightness(0.94) hue-rotate(-4deg)';
  } else {
    video.style.filter = 'saturate(0.5) contrast(1.1) brightness(0.88) hue-rotate(-8deg)';
  }
  // Vignette intensifies.
  const grain = document.querySelector('.scanner__grain') as HTMLElement;
  if (grain) {
    const vig = Math.min(0.85, 0.4 + a * 0.02);
    grain.style.background = `
      repeating-linear-gradient(0deg, rgba(122,244,210,0.02) 0 1px, transparent 1px 4px),
      radial-gradient(ellipse at center, transparent 45%, rgba(5,7,12,${vig}) 100%)
    `;
  }
}

/* ----------------------------------------------------------- activation */

function activate(obj: TrackedObject): void {
  const isReactivation = obj.id === activeId;
  activeId = obj.id;

  if (!isReactivation) obj.encounter = noteActivation(obj.label);
  tracker.setFragment(obj.id, generateFragment(obj, tracker.labels()));
  audio.detect();
  updateCameraArc();
  audio.updateArc(activationCount());

  // Check for ending.
  if (isEnded() && !endingTriggered) {
    endingTriggered = true;
    audio.fadeOut();
    setTimeout(() => {
      hudTicker.textContent = 'session complete';
      showToast('The cache is full.');
    }, 3000);
  }

  // Auto-log.
  if (!isReactivation || !activeLogId) {
    const entry = saveDiscovery(video, obj);
    if (entry) {
      activeLogId = entry.id;
      updateBadge();
      audio.log();
    } else {
      activeLogId = null;
    }
  } else {
    updateDiscoveryFragment(activeLogId, obj.fragment);
  }

  // LLM narrator (one call per activation).
  const logId = activeLogId;
  void fetchFragment(obj.label, obj.encounter, tracker.labels()).then((res) => {
    if (!res) return;
    if (logId) updateDiscoveryFragment(logId, res.fragment);
    if (activeId === obj.id && tracker.get(obj.id)) {
      tracker.setFragment(obj.id, res.fragment);
    }
  });
}

function deactivate(): void {
  activeId = null;
  activeLogId = null;
}

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
  audio.init();
  const s = session.beginVisit();
  showScreen('loader');
  try {
    loaderStatus.textContent = 'requesting camera…';
    const modelP = loadModel((pct) => {
      loaderStatus.textContent = `loading detection model… ${pct}%`;
    });
    await startCamera(video);
    await modelP;
    loaderStatus.textContent = 'synchronizing render cache…';
    await new Promise((r) => setTimeout(r, 500));

    showScreen('scanner');
    hudObserver.textContent = s.observerId;
    running = true;
    tracker.start();
    renderLoop();
    startTicker();
    updateBadge();
    updateCameraArc();
    maybeOnboard();
  } catch (err) {
    running = false;
    tracker.stop();
    errorMessage.textContent = err instanceof CameraError
      ? err.message
      : 'Detection model failed to load. Check your connection.';
    showScreen('error');
  }
}

/* ------------------------------------------------------------ onboarding */

const ONBOARD_KEY = 'lse-onboarded';
const ONBOARD_STEPS = [
  'Someone was here before you. They left traces in the render. The system logged everything they touched — but the log is corrupted.',
  'Look around slowly. When the system recognizes an object, a faint frame appears. TAP one to examine it — each tap adds to your anomaly log.',
  'HOLD an object for a closer inspection. When you\'re ready, open the ANOMALY LOG. Read it top to bottom. That\'s the story.',
];
let onboardStep = 0;

function maybeOnboard(): void {
  const s = session.load();
  if (s.visits > 1) return; // returning visitors skip — they remember
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
  if (onboardStep >= ONBOARD_STEPS.length) { endOnboarding(); return; }
  onboardText.textContent = ONBOARD_STEPS[onboardStep];
  if (onboardStep === ONBOARD_STEPS.length - 1) $('onboard-next').textContent = 'Begin';
});
$('onboard-skip').addEventListener('click', endOnboarding);

/* ------------------------------------------------------------- HUD ticker */

function startTicker(): void {
  clearInterval(tickerTimer);
  tickerTimer = window.setInterval(() => {
    if (!endingTriggered) hudTicker.textContent = ambientLine();
  }, 5500);
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

  const gc = overlay.glitch.eventCount;
  if (gc > lastGlitchCount) audio.glitch();
  lastGlitchCount = gc;

  const mode = aiStatus() === 'on' ? ' · live narrator' : '';
  if (!endingTriggered) {
    hudCount.textContent = `${objects.length} entit${objects.length === 1 ? 'y' : 'ies'}${mode}`;
  }
  rafId = requestAnimationFrame(renderLoop);
}

/* ----------------------------------------------------- tap & hold input */

const TAP_MS = 350;
const HOLD_MS = 550;
const MOVE_PX = 12;
let pd: { x: number; y: number; t: number; ht: number } | null = null;

function hitTest(x: number, y: number): TrackedObject | null {
  const map = overlay.mapper();
  let best: TrackedObject | null = null;
  let bestA = Infinity;
  for (const obj of tracker.list()) {
    const [bx, by, bw, bh] = map(obj.smoothBBox);
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
      const a = bw * bh;
      if (a < bestA) { bestA = a; best = obj; }
    }
  }
  return best;
}

holoCanvas.style.pointerEvents = 'none';
overlayCanvas.addEventListener('pointerdown', (e) => {
  const obj = hitTest(e.clientX, e.clientY);
  const ht = window.setTimeout(() => {
    if (!pd) return; pd = null;
    if (obj && tracker.get(obj.id)) inspect(obj);
  }, HOLD_MS);
  pd = { x: e.clientX, y: e.clientY, t: performance.now(), ht };
});
overlayCanvas.addEventListener('pointermove', (e) => {
  if (!pd) return;
  if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > MOVE_PX) {
    clearTimeout(pd.ht); pd = null;
  }
});
overlayCanvas.addEventListener('pointerup', (e) => {
  if (!pd) return;
  clearTimeout(pd.ht);
  const elapsed = performance.now() - pd.t; pd = null;
  if (elapsed > TAP_MS) return;
  const obj = hitTest(e.clientX, e.clientY);
  overlay.ripple(e.clientX, e.clientY);
  if (obj) activate(obj); else deactivate();
});
overlayCanvas.addEventListener('pointercancel', () => { if (pd) clearTimeout(pd.ht); pd = null; });

/* --------------------------------------------------------------- audio ui */

const muteBtn = $('mute-btn');
function reflectMute(): void {
  muteBtn.textContent = audio.muted ? '◇' : '◈';
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
}
muteBtn.addEventListener('click', () => { audio.toggleMute(); reflectMute(); });
reflectMute();

/* -------------------------------------------------------------- archive */

function refreshArchive(): void {
  renderArchive(archiveGrid, archiveEmpty, (id) => {
    deleteDiscovery(id);
    if (id === activeLogId) activeLogId = null;
    refreshArchive(); updateBadge();
  });
}
$('archive-btn').addEventListener('click', () => { refreshArchive(); screens.archive.classList.add('screen--visible'); });
$('archive-close').addEventListener('click', () => { screens.archive.classList.remove('screen--visible'); });

$('archive-export').addEventListener('click', async () => {
  const s = session.load();
  const text = exportLogText(s.observerId, s.visits);
  if (navigator.share) {
    try { await navigator.share({ title: 'Recovered Session Log', text }); return; }
    catch { /* user cancelled — fall through to clipboard */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Log copied to clipboard');
  } catch {
    showToast('Could not export log');
  }
});

/* ----------------------------------------------------------- lifecycle */

$('enter-btn').addEventListener('click', () => void enterLatentSpace());
$('retry-btn').addEventListener('click', () => void enterLatentSpace());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { tracker.stop(); cancelAnimationFrame(rafId); audio.suspend(); }
  else if (running) { tracker.start(); renderLoop(); audio.resume(); }
});
window.addEventListener('resize', () => { if (running) { overlay.resize(); hologram.resize(); } });
