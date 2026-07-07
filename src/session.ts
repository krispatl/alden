/**
 * Persistent session state: survives across app opens. Tracks how many
 * times this observer has returned and their lifetime activation count.
 * This is what makes "you came back" possible.
 */

const KEY = 'lse-session';

export interface SessionData {
  /** How many times the app has been opened. */
  visits: number;
  /** Total objects ever activated, across all sessions. */
  lifetimeActivations: number;
  /** Unique observer id (stable across sessions). */
  observerId: string;
  /** Whether the observer has seen the ending. */
  completed: boolean;
}

function defaults(): SessionData {
  return {
    visits: 0,
    lifetimeActivations: 0,
    observerId: `OBS-${Math.floor(Math.random() * 9000 + 1000)}`,
    completed: false,
  };
}

let data: SessionData | null = null;

export function load(): SessionData {
  if (data) return data;
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<SessionData>) } : defaults();
  } catch {
    data = defaults();
  }
  return data!;
}

export function save(): void {
  if (!data) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* quota — non-fatal */ }
}

export function beginVisit(): SessionData {
  const d = load();
  d.visits += 1;
  save();
  return d;
}

export function noteActivation(): number {
  const d = load();
  d.lifetimeActivations += 1;
  save();
  return d.lifetimeActivations;
}

export function markCompleted(): void {
  const d = load();
  d.completed = true;
  save();
}
