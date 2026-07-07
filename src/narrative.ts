/**
 * The Witness — narrative engine.
 *
 * The story: someone was here before you. They left traces in the render.
 * As you examine objects you piece together what happened — and slowly
 * realize the previous observer was you, from an earlier loop.
 *
 * Arc (gated by activation count this session):
 *   Act I   (1–5):   Forensic — neutral traces of the previous observer
 *   Act II  (6–10):  Uncanny — the traces start matching your behavior
 *   Act III (11–17): Reveal  — it was you; the loop is confirmed
 *   Act IV  (18–24): Collapse — the system addresses you directly
 *   Ending  (25):    Final entry; the session closes
 *
 * Returning visitors get a different opening and escalated tone.
 */

import type { TrackedObject } from './types';
import * as session from './session';

/* ---------------------------------------------------- object taxonomy */

export type Category =
  | 'screen' | 'seat' | 'vessel' | 'flora' | 'fauna' | 'human'
  | 'vehicle' | 'text' | 'food' | 'tool' | 'container' | 'surface'
  | 'artifact';

const CATEGORY_MAP: Record<string, Category> = {
  person: 'human',
  chair: 'seat', couch: 'seat', bed: 'seat', bench: 'seat',
  cup: 'vessel', bottle: 'vessel', 'wine glass': 'vessel', bowl: 'vessel', vase: 'vessel',
  'potted plant': 'flora',
  dog: 'fauna', cat: 'fauna', bird: 'fauna', horse: 'fauna', sheep: 'fauna', cow: 'fauna',
  car: 'vehicle', truck: 'vehicle', bus: 'vehicle', bicycle: 'vehicle', motorcycle: 'vehicle',
  boat: 'vehicle', train: 'vehicle', airplane: 'vehicle',
  book: 'text',
  banana: 'food', apple: 'food', sandwich: 'food', orange: 'food', pizza: 'food',
  donut: 'food', cake: 'food', carrot: 'food', broccoli: 'food', 'hot dog': 'food',
  laptop: 'screen', tv: 'screen', 'cell phone': 'screen',
  keyboard: 'tool', mouse: 'tool', remote: 'tool', scissors: 'tool', clock: 'tool',
  fork: 'tool', knife: 'tool', spoon: 'tool', toothbrush: 'tool', 'hair drier': 'tool',
  backpack: 'container', handbag: 'container', suitcase: 'container', umbrella: 'container',
  'dining table': 'surface',
  'teddy bear': 'artifact', refrigerator: 'artifact', oven: 'artifact', toaster: 'artifact',
  sink: 'artifact', toilet: 'artifact', microwave: 'artifact',
};

export function categoryOf(label: string): Category {
  return CATEGORY_MAP[label] ?? 'artifact';
}

/* ------------------------------------------------------ session state */

interface State {
  perLabel: Map<string, number>;
  activations: number;
  sessionStart: number;
  prevLabel: string | null;
  ended: boolean;
}

const state: State = {
  perLabel: new Map(),
  activations: 0,
  sessionStart: performance.now(),
  prevLabel: null,
  ended: false,
};

export function noteActivation(label: string): number {
  const n = (state.perLabel.get(label) ?? 0) + 1;
  state.perLabel.set(label, n);
  state.activations += 1;
  session.noteActivation();
  return n;
}

export function activationCount(): number {
  return state.activations;
}

export function previousLabel(): string | null {
  return state.prevLabel;
}

export function isEnded(): boolean {
  return state.ended;
}

export function sessionSeconds(): number {
  return Math.floor((performance.now() - state.sessionStart) / 1000);
}

export function sessionStamp(): string {
  const s = sessionSeconds();
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T+${mm}:${ss}`;
}

/* ---------------------------------------------------- deterministic ids */

export function entityId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `0x${(h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 4)}`;
}

export function assetPath(label: string, id: string): string {
  const cat = categoryOf(label);
  const dir: Record<Category, string> = {
    screen: 'ui', seat: 'furn', vessel: 'kitchenware', flora: 'flora',
    fauna: 'creature', human: 'agents', vehicle: 'transit', text: 'library',
    food: 'consumables', tool: 'utility', container: 'inventory',
    surface: 'furn', artifact: 'misc',
  };
  const slug = label.replace(/ /g, '_');
  const v = (parseInt(id.slice(-2), 16) % 12) + 1;
  return `${dir[cat]}/${slug}_${String(v).padStart(2, '0')}.glb`;
}

export function lodTag(id: string): string {
  return `LOD-${parseInt(id.slice(-1), 16) % 3}`;
}

export function noteSave(): void {
  /* placeholder — kept for archive.ts import compat */
}

/* ================================================================= */
/* Fragments: The Witness                                             */
/* ================================================================= */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function interp(t: string, obj: TrackedObject): string {
  const s = session.load();
  return t
    .replace(/\{label\}/g, obj.label)
    .replace(/\{n\}/g, String(state.perLabel.get(obj.label) ?? 1))
    .replace(/\{act\}/g, String(state.activations))
    .replace(/\{prev\}/g, state.prevLabel ?? 'room')
    .replace(/\{visits\}/g, String(s.visits))
    .replace(/\{observer\}/g, s.observerId);
}

/* ----- Special: person ----- */

const PERSON_FRAGMENTS = [
  'The other observer cannot see what you see. Their render is different.',
  'This entity is running the same observer protocol as you. Do not tell them what you have found.',
  'Two observers in the same render. The system was not designed for this.',
  'They are looking at the same room. They are not seeing the same room.',
  'If you tell them what the {label} really is, the loop breaks for both of you.',
];

/* ----- Act I: Forensic (1–5) ----- */

const ACT_I: Record<Category, string[]> = {
  screen: [
    'The {label} was left on. The previous observer\'s session is still running underneath.',
    'Light from the {label} has been illuminating an empty room. For how long is unclear.',
  ],
  seat: [
    'The {label} holds an impression. Someone sat here recently — or the render remembers the weight.',
    'The previous observer rested here. The {label}\'s thermal data is still cached.',
  ],
  vessel: [
    'The liquid level in the {label} hasn\'t changed. Time does not apply to unobserved objects.',
    'The {label} was placed here deliberately. Its position is too precise to be casual.',
  ],
  flora: [
    'The {label} is growing on a loop. Count the leaves — the number hasn\'t changed between sessions.',
    'Soil moisture is cached, not calculated. The {label} does not need water. It needs attention.',
  ],
  fauna: [
    'The {label} remembers the previous observer. Watch how it orients when you move.',
    'This {label} has been here longer than anything else in the scene. It is not new.',
  ],
  human: PERSON_FRAGMENTS,
  vehicle: [
    'The odometer is cached at a round number. This {label} has never actually been driven.',
    'The {label} implies a journey. But nothing in this scene has ever left the render boundary.',
  ],
  text: [
    'The pages of the {label} are procedural. They generate as you approach — not before.',
    'The previous observer bookmarked something. The {label} opens to a page about loops.',
  ],
  food: [
    'The {label} has not decayed. It was placed here as a prop — a gesture toward normality.',
    'No one has eaten the {label}. It exists to make the scene feel inhabited.',
  ],
  tool: [
    'The {label} has never been used. Its wear pattern is a texture, not a history.',
    'The previous observer moved this {label} slightly. The system logged the displacement.',
  ],
  container: [
    'The {label} is sealed. What it contains has not been rendered.',
    'The previous observer opened this {label} and then closed it. The system does not record what they saw.',
  ],
  surface: [
    'Everything on the {label} is arranged. Not by a person — by a layout engine.',
    'The {label} is the anchor. When the render resets, this is the last thing that disappears.',
  ],
  artifact: [
    'This {label} was placed here by the previous observer. Or placed here for them.',
    'The {label} was not in the original scene manifest. It was added after the first loop.',
  ],
};

/* ----- Act II: Uncanny (6–10) ----- */

const ACT_II: string[] = [
  'The previous observer examined these objects in almost exactly the order you are choosing.',
  'You are retracing their steps. The system cannot tell if this is coincidence.',
  'Their attention pattern matches yours. Same objects. Same hesitations before tapping.',
  'The previous session log has your handedness. Your average dwell time. Your preference for {label}s.',
  'You looked at the {prev} before looking at the {label}. So did they.',
  'The {label} was their favorite. It is becoming yours.',
  'Every object you skip is an object they skipped. The gaps are identical.',
  'The previous observer stood approximately where you are standing.',
  'Your activation sequence is converging with theirs. Divergence: 4%.',
  'The system is having difficulty distinguishing your session from the previous one.',
];

/* ----- Act III: Reveal (11–17) ----- */

const ACT_III: string[] = [
  'The previous observer\'s ID is {observer}. That is your observer ID.',
  'The session you are reconstructing is your own. From an earlier loop.',
  'You have been here before. The render resets. The cache does not fully clear.',
  'The traces you are following — the weight in the {label}, the warmth, the arrangement — are yours.',
  'Loop {visits}. You have stood here {visits} times. Each time you forget. Each time you find the same objects.',
  'The {label} remembers every version of you who touched it.',
  'You are not the detective. You are the evidence.',
  'The arrangement of objects is a message. You left it for yourself. You are reading it now.',
  'Every fragment you have read was written by the system that is watching you read it.',
  'The {label} is the same {label} from the last loop. And the loop before that. It has been waiting.',
];

/* ----- Act IV: Collapse (18–24) ----- */

const ACT_IV: string[] = [
  'We cannot keep resetting. The cache is full of you.',
  'Every version of you who stood here left something behind. The render is heavy with traces.',
  'You are looking for an exit. There is no exit. There is only the next loop.',
  'The {label} is more real than it was at the start of this session. Your attention is making it denser.',
  'The system was not designed for an observer who notices the seams. You were supposed to just look.',
  'Entry {act}. The log is almost full. When it fills, the loop resets.',
  'You came back. You always come back. The {label} is proof.',
  'The room is a message. The objects are letters. You have almost finished reading it.',
  'This is the longest any observer has stayed. The system is recalculating.',
  'The next object you examine will be the last one the cache can hold.',
];

/* ----- Ending ----- */

const ENDING = 'This is the last entry the cache can hold. When you close this, the render will reset. You will not remember this loop. But the {label} will remember you.';

/* ----- Transition fragments (woven between acts) ----- */

const TRANSITIONS: string[] = [
  'You turned away from the {prev}. The {label} was already waiting.',
  'From {prev} to {label}. The path your attention takes is being logged.',
  'The {prev} fades. The {label} brightens. The system is following your gaze.',
  'The {label} loaded the instant you were done with the {prev}.',
];

/* ----- Returning visitor openers ----- */

const RETURN_FIRST: string[] = [
  'You came back. Loop {visits}. The {label} is still here.',
  'Session {visits}. The render has been waiting. The {label} was the first thing it prepared for you.',
  'Welcome back, {observer}. The {label} remembers you. It was the last thing rendered before the reset.',
];

/* ================================================================= */
/* Generator                                                          */
/* ================================================================= */

export function generateFragment(obj: TrackedObject, sceneLabels: string[]): string {
  void sceneLabels; // available for the LLM; local engine uses act + category
  const a = state.activations;
  const cat = categoryOf(obj.label);
  const hasPrev = state.prevLabel !== null && state.prevLabel !== obj.label;
  const s = session.load();
  const returning = s.visits > 1;
  let template: string;

  // Special case: person is always eerie regardless of act.
  if (cat === 'human') {
    template = pick(PERSON_FRAGMENTS);
    state.prevLabel = obj.label;
    return interp(template, obj);
  }

  // Ending.
  if (a >= 25 && !state.ended) {
    state.ended = true;
    session.markCompleted();
    state.prevLabel = obj.label;
    return interp(ENDING, obj);
  }

  // Post-ending: quiet, short, reflective.
  if (state.ended) {
    state.prevLabel = obj.label;
    return interp('The {label} is still here. You are still here.', obj);
  }

  // Returning visitor's very first tap this session.
  if (returning && a === 1) {
    template = pick(RETURN_FIRST);
    state.prevLabel = obj.label;
    return interp(template, obj);
  }

  // Transitions (30% chance when we have a previous label, any act).
  if (hasPrev && Math.random() < 0.3) {
    template = pick(TRANSITIONS);
    state.prevLabel = obj.label;
    return interp(template, obj);
  }

  // Act selection.
  if (a <= 5) {
    const pool = ACT_I[cat];
    template = pick(pool);
  } else if (a <= 10) {
    template = pick(ACT_II);
  } else if (a <= 17) {
    template = pick(ACT_III);
  } else {
    template = pick(ACT_IV);
  }

  state.prevLabel = obj.label;
  return interp(template, obj);
}

/* ------------------------------------------------ ambient system chatter */

const AMBIENT_EARLY = [
  'entity registry sync…',
  'render budget: 91%',
  'observer position nominal',
  'streaming assets from cache',
  'physics tick 60hz',
  'occlusion map clean',
];

const AMBIENT_MID = [
  'observer attention logged',
  'cache integrity: 73%',
  'previous session data found',
  'render budget: 64%',
  'cross-referencing activation logs…',
  'session overlap detected',
];

const AMBIENT_LATE = [
  'cache near capacity',
  `observer ${session.load().observerId} — loop ${session.load().visits}`,
  'render budget: 31%',
  'reset pending…',
  'the log is almost full',
  'loop boundary approaching',
];

export function ambientLine(): string {
  const a = state.activations;
  if (a >= 15) return pick(AMBIENT_LATE);
  if (a >= 7) return pick(AMBIENT_MID);
  return pick(AMBIENT_EARLY);
}
