/**
 * The semantic heart of the instrument: curated latent chains for common
 * COCO-SSD labels, a symbolic fallback generator for everything else, and
 * local poetic-fragment templates.
 */

/** Keys are raw COCO-SSD labels (note "cell phone", "potted plant", "tv"). */
const CURATED: Record<string, string[][]> = {
  person: [
    ['person', 'avatar', 'memory vessel', 'ghost signal', 'constellation'],
    ['person', 'witness', 'myth carrier', 'oracle', 'star body'],
    ['person', 'antenna of longing', 'archive of gestures', 'slow comet', 'returning light'],
  ],
  chair: [
    ['chair', 'throne', 'trial seat', 'ruin', 'monument'],
    ['chair', 'waiting room', 'absence', 'echo', 'fossil'],
    ['chair', 'perch', 'watchtower', 'empty orbit', 'quiet planet'],
  ],
  cup: [
    ['cup', 'vessel', 'well', 'moon crater', 'black hole'],
    ['cup', 'offering', 'ritual object', 'signal bowl', 'portal'],
    ['cup', 'tide pool', 'listening dish', 'small ocean', 'first mirror'],
  ],
  bottle: [
    ['bottle', 'reliquary', 'trapped weather', 'message engine', 'drifting satellite'],
    ['bottle', 'glass lung', 'preserved storm', 'time capsule', 'cold star'],
  ],
  'wine glass': [
    ['wine glass', 'chalice', 'resonant bell', 'thin atmosphere', 'ringing moon'],
    ['wine glass', 'stem of light', 'fragile antenna', 'toast to the void', 'evaporating signal'],
  ],
  bowl: [
    ['bowl', 'basin', 'crater lake', 'radio dish', 'listening valley'],
    ['bowl', 'open palm', 'harvest memory', 'gravity well', 'cradle of dust'],
  ],
  book: [
    ['book', 'archive', 'spell', 'machine memory', 'living code'],
    ['book', 'map', 'labyrinth', 'lost planet', 'oracle'],
    ['book', 'pressed forest', 'folded voice', 'paper server', 'sleeping god'],
  ],
  laptop: [
    ['laptop', 'altar', 'mirror', 'neural gate', 'synthetic dream'],
    ['laptop', 'terminal', 'satellite', 'planetary brain', 'god engine'],
    ['laptop', 'hinged window', 'thought loom', 'electric monastery', 'second sky'],
  ],
  'cell phone': [
    ['phone', 'talisman', 'pocket oracle', 'attention engine', 'black monolith'],
    ['phone', 'mirror shard', 'signal wound', 'distant chorus', 'orbiting eye'],
    ['phone', 'small altar', 'glow ritual', 'nervous star', 'tether to elsewhere'],
  ],
  keyboard: [
    ['keyboard', 'piano of commands', 'rune board', 'incantation grid', 'language reactor'],
    ['keyboard', 'field of switches', 'rain of letters', 'signal loom', 'alphabet storm'],
  ],
  mouse: [
    ['mouse', 'divining stone', 'cursor familiar', 'pointing bone', 'wandering star'],
    ['mouse', 'palm ghost', 'silent messenger', 'gesture fossil', 'drifting probe'],
  ],
  tv: [
    ['screen', 'aquarium of light', 'dream window', 'broadcast altar', 'artificial sunset'],
    ['screen', 'flat oracle', 'wall of ghosts', 'memory furnace', 'domestic aurora'],
  ],
  'potted plant': [
    ['plant', 'antenna', 'green signal', 'forest intelligence', 'alien language'],
    ['plant', 'lung', 'weather machine', 'terraformer', 'breathing planet'],
    ['plant', 'slow explosion', 'patient architecture', 'solar archive', 'first settler'],
  ],
  car: [
    ['car', 'chariot', 'migration shell', 'road comet', 'rusting meteor'],
    ['car', 'metal cocoon', 'distance machine', 'escape vector', 'stranded lander'],
  ],
  truck: [
    ['truck', 'beast of burden', 'cargo whale', 'supply artery', 'wandering warehouse'],
    ['truck', 'iron caravan', 'horizon hauler', 'freight leviathan', 'slow asteroid'],
  ],
  bicycle: [
    ['bicycle', 'twin moons', 'balance ritual', 'human orbit', 'gyroscope of joy'],
    ['bicycle', 'wire skeleton', 'wind instrument', 'circular argument', 'perpetual motion'],
  ],
  dog: [
    ['dog', 'guardian', 'threshold spirit', 'loyal comet', 'star that follows'],
    ['dog', 'joy engine', 'scent cartographer', 'pack memory', 'first friend of fire'],
  ],
  cat: [
    ['cat', 'sphinx', 'liquid shadow', 'night surveyor', 'small eclipse'],
    ['cat', 'house spirit', 'silent oracle', 'gravity tester', 'sovereign of naps'],
  ],
  bird: [
    ['bird', 'messenger', 'sky punctuation', 'feathered signal', 'escaped note'],
    ['bird', 'dinosaur echo', 'weather prophet', 'air script', 'living kite'],
  ],
  backpack: [
    ['backpack', 'portable home', 'shell of intentions', 'nomad archive', 'gravity of belongings'],
    ['backpack', 'carried world', 'burden vessel', 'expedition seed', 'turtle dream'],
  ],
  umbrella: [
    ['umbrella', 'portable sky', 'folding eclipse', 'rain shield', 'personal dome'],
    ['umbrella', 'bat wing', 'storm negotiator', 'temporary roof', 'black flower'],
  ],
  clock: [
    ['clock', 'metronome of fate', 'circular prison', 'time altar', 'patient witness'],
    ['clock', 'mechanical heart', 'orbit diagram', 'countdown shrine', 'face of entropy'],
  ],
  couch: [
    ['couch', 'soft continent', 'gravity trap', 'domestic raft', 'island of evenings'],
    ['couch', 'velvet harbor', 'conversation pit', 'dream dock', 'sleeping whale'],
  ],
  bed: [
    ['bed', 'launch pad of dreams', 'nightly cocoon', 'horizontal temple', 'soft grave and cradle'],
    ['bed', 'raft', 'memory foam of the self', 'dark harbor', 'return vessel'],
  ],
  'dining table': [
    ['table', 'altar of appetite', 'negotiation field', 'family observatory', 'flat horizon'],
    ['table', 'wooden plateau', 'gathering stone', 'feast satellite', 'plane of offerings'],
  ],
  remote: [
    ['remote', 'wand', 'channel key', 'attention rudder', 'scepter of elsewhere'],
    ['remote', 'lost artifact', 'couch compass', 'signal flute', 'domestic teleporter'],
  ],
  scissors: [
    ['scissors', 'twin blades', 'decision instrument', 'thread fate', 'severed constellation'],
    ['scissors', 'metal beak', 'divider of worlds', 'paper storm', 'clean ending'],
  ],
  'teddy bear': [
    ['teddy bear', 'guardian golem', 'soft sentinel', 'childhood satellite', 'keeper of nights'],
    ['teddy bear', 'stuffed witness', 'comfort idol', 'memory anchor', 'small warm god'],
  ],
  vase: [
    ['vase', 'throat of flowers', 'ceramic silence', 'still fountain', 'urn of springs'],
    ['vase', 'hollow sculpture', 'water keeper', 'bloom reactor', 'patient amphora'],
  ],
  banana: [
    ['banana', 'crescent', 'yellow smile', 'soft boomerang', 'tropical moon'],
    ['banana', 'sun battery', 'curved signal', 'peelable comet', 'fruit of laughter'],
  ],
  apple: [
    ['apple', 'planet in miniature', 'temptation core', 'orchard memory', 'red dwarf'],
    ['apple', 'gravity teacher', 'sweet meteor', 'seed vault', 'first myth'],
  ],
};

/**
 * Symbolic templates for labels without a curated entry.
 * `{}` is replaced with the detected label.
 */
const FALLBACK_TEMPLATES: string[][] = [
  ['{}', 'artifact', 'signal', 'threshold', 'unknown star'],
  ['{}', 'relic', 'transmission', 'gate', 'nameless constellation'],
  ['{}', 'specimen', 'frequency', 'passage', 'far beacon'],
  ['{}', 'found object', 'coded message', 'crossing point', 'silent nova'],
];

/** Deterministic tiny hash so a label always maps to stable fallbacks. */
function hashLabel(label: string): number {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Returns every chain variant for a label (curated, or two stable fallbacks). */
export function getChains(label: string): string[][] {
  const curated = CURATED[label];
  if (curated) return curated;

  const h = hashLabel(label);
  const a = FALLBACK_TEMPLATES[h % FALLBACK_TEMPLATES.length];
  const b = FALLBACK_TEMPLATES[(h + 1) % FALLBACK_TEMPLATES.length];
  return [a, b].map((tpl) => tpl.map((w) => (w === '{}' ? label : w)));
}

/* ------------------------------------------------------------------ */
/* Poetic fragments                                                    */
/* ------------------------------------------------------------------ */

const POEM_TEMPLATES: string[] = [
  'The {label} remembers every {witness} as a temporary {cosmic}.',
  'Inside the {label}, a {cosmic} is still deciding what to become.',
  'Every {label} is a {threshold} wearing the disguise of the ordinary.',
  'The {label} broadcasts on a frequency only {witness}s can hear.',
  'Long after the room forgets you, the {label} will hold your {trace}.',
  'A {label} is how the {cosmic} practices being small.',
  'The {label} has been waiting here since before it had a name.',
  'Touch the {label} and somewhere a {cosmic} adjusts its orbit.',
  'This {label} is the last surviving map to a {threshold} that never closed.',
  'In latent space, the {label} and the {cosmic} were never separate.',
];

const WITNESSES = ['ghost', 'traveler', 'body', 'stranger', 'signal', 'dreamer'];
const COSMICS = ['constellation', 'black hole', 'slow comet', 'distant chorus', 'newborn star', 'quiet galaxy'];
const THRESHOLDS = ['portal', 'doorway', 'threshold', 'gate between rooms', 'crossing point'];
const TRACES = ['warmth', 'outline', 'echo', 'shadow', 'last gesture'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generates a short local poetic fragment for a detected label. */
export function generatePoem(label: string): string {
  const short = label.split(' ').pop() ?? label;
  return pick(POEM_TEMPLATES)
    .replaceAll('{label}', short)
    .replaceAll('{witness}', pick(WITNESSES))
    .replaceAll('{cosmic}', pick(COSMICS))
    .replaceAll('{threshold}', pick(THRESHOLDS))
    .replaceAll('{trace}', pick(TRACES));
}

/** Picks a random starting chain index for a label's variants. */
export function randomChainIndex(chains: string[][]): number {
  return Math.floor(Math.random() * chains.length);
}
