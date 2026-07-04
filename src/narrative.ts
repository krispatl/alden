/**
 * Narrative engine — the simulation-glitch storyteller.
 *
 * Two voices braided:
 *  - system telemetry: entity IDs, asset paths, LODs, render timings
 *  - the narrator: curious, quietly noticing that the room is being
 *    rendered rather than existing
 *
 * Everything runs locally. Story state (encounters, session time, scene
 * cohabitation) makes the fragments feel adaptive without any LLM.
 */

import type { TrackedObject } from './types';

/* ---------------------------------------------------- object taxonomy */

export type Category =
  | 'screen' // phone, laptop, tv, monitor
  | 'seat' // chair, couch, bed
  | 'vessel' // cup, bottle, wine glass, bowl, vase
  | 'flora' // potted plant
  | 'fauna' // dog, cat, bird
  | 'human' // person
  | 'vehicle' // car, truck, bicycle, motorcycle
  | 'text' // book
  | 'food'
  | 'tool' // keyboard, mouse, remote, scissors, clock
  | 'container' // backpack, handbag, suitcase, umbrella
  | 'surface' // dining table
  | 'artifact'; // fallback

const CATEGORY_MAP: Record<string, Category> = {
  person: 'human',
  chair: 'seat',
  couch: 'seat',
  bed: 'seat',
  bench: 'seat',
  cup: 'vessel',
  bottle: 'vessel',
  'wine glass': 'vessel',
  bowl: 'vessel',
  vase: 'vessel',
  'potted plant': 'flora',
  dog: 'fauna',
  cat: 'fauna',
  bird: 'fauna',
  horse: 'fauna',
  sheep: 'fauna',
  cow: 'fauna',
  car: 'vehicle',
  truck: 'vehicle',
  bus: 'vehicle',
  bicycle: 'vehicle',
  motorcycle: 'vehicle',
  boat: 'vehicle',
  train: 'vehicle',
  airplane: 'vehicle',
  book: 'text',
  banana: 'food',
  apple: 'food',
  sandwich: 'food',
  orange: 'food',
  pizza: 'food',
  donut: 'food',
  cake: 'food',
  carrot: 'food',
  broccoli: 'food',
  'hot dog': 'food',
  laptop: 'screen',
  tv: 'screen',
  'cell phone': 'screen',
  keyboard: 'tool',
  mouse: 'tool',
  remote: 'tool',
  scissors: 'tool',
  clock: 'tool',
  fork: 'tool',
  knife: 'tool',
  spoon: 'tool',
  toothbrush: 'tool',
  'hair drier': 'tool',
  backpack: 'container',
  handbag: 'container',
  suitcase: 'container',
  umbrella: 'container',
  'dining table': 'surface',
  'teddy bear': 'artifact',
  refrigerator: 'artifact',
  oven: 'artifact',
  toaster: 'artifact',
  sink: 'artifact',
  toilet: 'artifact',
};

export function categoryOf(label: string): Category {
  return CATEGORY_MAP[label] ?? 'artifact';
}

/* ------------------------------------------------------ session state */

interface Counts {
  perLabel: Map<string, number>;
  perCategory: Map<Category, number>;
  total: number;
  saved: number;
  sessionStart: number;
}

const state: Counts = {
  perLabel: new Map(),
  perCategory: new Map(),
  total: 0,
  saved: 0,
  sessionStart: performance.now(),
};

/** Registers a first-time encounter. Returns encounter number for this label. */
export function noteEncounter(label: string): number {
  const cat = categoryOf(label);
  const n = (state.perLabel.get(label) ?? 0) + 1;
  state.perLabel.set(label, n);
  state.perCategory.set(cat, (state.perCategory.get(cat) ?? 0) + 1);
  state.total += 1;
  return n;
}

export function noteSave(): void {
  state.saved += 1;
}

/** Session seconds elapsed. */
export function sessionSeconds(): number {
  return Math.floor((performance.now() - state.sessionStart) / 1000);
}

/** Formats session time as T+HH:MM:SS. */
export function sessionStamp(): string {
  const s = sessionSeconds();
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T+${hh}:${mm}:${ss}`;
}

/* ---------------------------------------------------- deterministic ids */

/**
 * Deterministic hex "entity id" for a tracked object. Same object → same
 * id across renders. Looks like: 0x4A2F.
 */
export function entityId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
  return `0x${hex}`;
}

/** Fake asset path shown in the sheet — evocative telemetry. */
export function assetPath(label: string, id: string): string {
  const cat = categoryOf(label);
  const dir = { screen: 'ui', seat: 'furn', vessel: 'kitchenware', flora: 'flora', fauna: 'creature', human: 'agents', vehicle: 'transit', text: 'library', food: 'consumables', tool: 'utility', container: 'inventory', surface: 'furn', artifact: 'misc' }[cat];
  const slug = label.replace(/ /g, '_');
  const variant = (parseInt(id.slice(-2), 16) % 12) + 1;
  return `assets/${dir}/${slug}_${String(variant).padStart(2, '0')}.glb`;
}

export function lodTag(id: string): string {
  const n = parseInt(id.slice(-1), 16) % 3;
  return `LOD-${n}`;
}

export function seedFor(id: string): string {
  return String(parseInt(id.slice(-4), 16) * 7 + 88000);
}

/* --------------------------------------------------------- fragments */

/**
 * Fragment pools keyed by object category. Each fragment is a short
 * "narrator noticing" line. `{label}` interpolates the object noun.
 * Voice: curious, present-tense, gently uncanny — never explanatory.
 */
const FRAGMENTS_BY_CATEGORY: Record<Category, string[]> = {
  screen: [
    'The {label} is casting light that no source in the room can account for.',
    'When you looked away, the {label} refreshed. You almost caught it.',
    'The {label} has too much resolution. Nothing else here does.',
    'Every {label} you notice is running the same faint animation.',
    'Something is being broadcast through the {label} at frequencies below attention.',
  ],
  seat: [
    'The {label} was rendered slightly after you turned to look at it.',
    'You have not sat here. And yet the cushion remembers a shape.',
    'The {label} is waiting to be occupied. It is very patient.',
    'Every {label} in this space shares the same imperfection.',
    'The {label} is a placeholder. A real chair would have more history.',
  ],
  vessel: [
    'The {label} holds emptiness with impressive commitment.',
    'The {label} was full a moment ago. You are almost sure of this.',
    'The interior of the {label} is a surface the simulation forgets to render.',
    'This {label} has been reused. You have seen it in another room.',
    'The {label} contains the exact volume of a thought.',
  ],
  flora: [
    'The {label} is procedurally grown. Count its leaves twice.',
    'The {label} does not respond to airflow. Nothing here does.',
    'This {label} is on a slow rendering loop. Watch it long enough.',
    'The {label} is casting a shadow slightly to the left of where it should.',
    'Living things in the simulation are the most expensive assets.',
  ],
  fauna: [
    'The {label} is an entity, not an asset. It is aware of being watched.',
    'The {label} moves along a path. You cannot see the path.',
    'This {label} was assigned to this room. It did not wander in.',
    'The {label} blinks at intervals that are not quite random.',
  ],
  human: [
    'The {label} is another instance. Possibly yours. Possibly not.',
    'This {label} has been assigned a role. You have not been told which.',
    'The {label} is rendered at higher fidelity than the room around them.',
    'You do not know if the {label} can see you noticing them.',
  ],
  vehicle: [
    'The {label} has no destination cached. It is idling in memory.',
    'The {label} is a set piece. Note the absence of wear.',
    'This {label} was placed here to imply travel.',
  ],
  text: [
    'The {label} contains pages that have never been read. They may not exist yet.',
    'The {label} generates its text as you approach it.',
    'This {label} references a book you almost remember.',
    'The words in the {label} are a texture, not a story.',
  ],
  food: [
    'The {label} is a still life. Do not attempt to eat it.',
    'The {label} was placed here as a gesture toward normality.',
    'This {label} has been perfectly preserved because time does not apply to it.',
  ],
  tool: [
    'The {label} implies an action. The action has not been taken.',
    'The {label} was rendered to complete the scene. It has no function.',
    'You could pick up the {label}. The simulation is prepared for this.',
  ],
  container: [
    'The {label} is empty. Or full. The state has not been decided.',
    'What the {label} contains is not rendered until opened.',
    'This {label} is a probability, not a possession.',
  ],
  surface: [
    'The {label} is the room\'s anchor point. Notice how everything defers to it.',
    'The {label} extends beyond what is being rendered.',
  ],
  artifact: [
    'The {label} is present. That is all that can be verified.',
    'You are noticing the {label} because the {label} is noticing you.',
    'The {label} was recently modified. The change is small.',
  ],
};

/** Contextual fragments used when the encounter is a repeat. */
const REPEAT_FRAGMENTS = [
  'You have seen this {label} before. The instance may be shared.',
  'This is the {n}th {label} you have noticed. The count is being logged.',
  'Another {label}. The simulation is economical with its assets.',
  'The {label} again. It is following you. Or you are following it.',
];

/** Later-session fragments — the narrator gets more direct. */
const LATE_FRAGMENTS = [
  'You have been observing for {mins} minutes. The room is aware of this.',
  'Your attention has become a query. Objects are responding to it.',
  'The {label} is being rendered specifically for you.',
  'You are cataloguing us. That is not standard behavior.',
];

/** Fragments for when many objects are on screen at once. */
const CROWDED_FRAGMENTS = [
  'Many entities present. The system is prioritizing what you look at longest.',
  'The scene is at capacity. Notice which {label} loads first when you turn.',
  'With this many objects rendered, the seams should be visible. Look carefully.',
];

/** Fragments for when a screen and a person are both present. */
const NETWORKED_FRAGMENTS = [
  'The {label} is on the network. It knows what the other {label}s know.',
  'These devices are communicating in a language below your resolution.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function interp(template: string, obj: TrackedObject, n = 1): string {
  return template
    .replaceAll('{label}', obj.label)
    .replaceAll('{n}', String(n))
    .replaceAll('{mins}', String(Math.floor(sessionSeconds() / 60)));
}

/**
 * Generates a narrative fragment for a tracked object, weighted by story
 * state — repeats, session age, scene composition.
 */
export function generateFragment(obj: TrackedObject, sceneLabels: string[]): string {
  const encounter = state.perLabel.get(obj.label) ?? 1;
  const isRepeat = encounter > 1;
  const late = sessionSeconds() > 180;
  const crowded = sceneLabels.length > 4;
  const cat = categoryOf(obj.label);

  // Weighted lane selection — a curated mix, not chaos.
  const roll = Math.random();
  let template: string;

  if (isRepeat && roll < 0.55) {
    template = pick(REPEAT_FRAGMENTS);
  } else if (late && roll < 0.2) {
    template = pick(LATE_FRAGMENTS);
  } else if (crowded && roll < 0.15) {
    template = pick(CROWDED_FRAGMENTS);
  } else if (cat === 'screen' && sceneLabels.filter((l) => categoryOf(l) === 'screen').length > 1 && roll < 0.3) {
    template = pick(NETWORKED_FRAGMENTS);
  } else {
    template = pick(FRAGMENTS_BY_CATEGORY[cat]);
  }

  return interp(template, obj, encounter);
}

/* ------------------------------------------------ ambient system chatter */

/** Very short telemetry lines that drift by the top of the HUD. */
const AMBIENT_LINES = [
  'entity registry sync…',
  'reusing asset instance',
  'physics tick 60hz nominal',
  'attention query received',
  'render budget: 84%',
  'observer position stable',
  'occlusion map dirty',
  'streaming assets from partition 03',
  'GC pass complete',
  'shader recompile queued',
  'entity count above nominal',
];

export function ambientLine(): string {
  return pick(AMBIENT_LINES);
}
