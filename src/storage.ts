import { DEFAULT_ROSTER, DEFAULT_SETTINGS, type Exercise, type Session, type Settings } from './types';
import { SEED_POOL } from './seed';

const POOL_KEY = 'tasha.pool';
const SETTINGS_KEY = 'tasha.settings';
const SESSION_KEY = 'tasha.session';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * How many SEED_POOL entries this saved pool has already been offered. New seed
 * exercises are appended to the end of the list, so anything past the mark is an
 * addition the pool has never seen — and anything before it was seen and maybe
 * deliberately deleted, so it stays gone.
 */
const SEED_MARK_KEY = 'tasha.seedMerged';

// Pools saved before the mark existed: infer it from the highest seed-N they
// hold. Deleting the newest seed exercise then upgrading brings that one back —
// the alternative is never delivering new exercises at all.
function inferSeedMark(pool: Exercise[]): number {
  return pool.reduce((max, e) => {
    const m = /^seed-(\d+)$/.exec(e.id);
    return m ? Math.max(max, Number(m[1]) + 1) : max;
  }, 0);
}

export function loadPool(): Exercise[] {
  const parsed = loadJson<unknown>(POOL_KEY, null);
  if (!Array.isArray(parsed)) {
    localStorage.setItem(SEED_MARK_KEY, String(SEED_POOL.length));
    return SEED_POOL;
  }
  // Cardio was dropped — filter it out of pools saved before the change.
  // Pools saved before multi-cue seeds adopt the seed's extra cues; an entry
  // that already has its own cues (user-edited) keeps them.
  const seedById = new Map(SEED_POOL.map((e) => [e.id, e]));
  const pool = (parsed as Exercise[])
    .filter((e) => (e.category as string) !== 'cardio')
    .map((e) => (!e.cues && seedById.get(e.id)?.cues ? { ...e, cues: seedById.get(e.id)!.cues } : e));
  const stored = localStorage.getItem(SEED_MARK_KEY);
  const mark = stored === null ? inferSeedMark(pool) : Number(stored) || 0;
  if (mark >= SEED_POOL.length) return pool;
  // Persist straight away: the mark may only advance once the merge is durable,
  // or a load-without-save would lose the additions and never offer them again.
  const merged = [...pool, ...SEED_POOL.slice(mark)];
  savePool(merged);
  return merged;
}

export function savePool(pool: Exercise[]): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  localStorage.setItem(SEED_MARK_KEY, String(SEED_POOL.length));
}

export function loadSettings(): Settings {
  const parsed = loadJson<unknown>(SETTINGS_KEY, {});
  const partial = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<Settings>) : {};
  const s = { ...DEFAULT_SETTINGS, ...partial };
  if (!Array.isArray(s.roster) || !s.roster.every((n) => typeof n === 'string')) {
    s.roster = DEFAULT_ROSTER;
  }
  const groups = s.partner?.groups;
  const validGroups =
    Array.isArray(groups) &&
    groups.length >= 1 &&
    groups.length <= 4 &&
    groups.every((g) => Array.isArray(g) && g.every((p) => typeof p === 'string'));
  if (s.partner && !validGroups) {
    // Reset assignments (e.g. migrating old label-only configs); keep on/off.
    s.partner = { on: Boolean(s.partner.on), groups: DEFAULT_SETTINGS.partner!.groups };
  }
  return s;
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** The generated (locked-in) session, so a reload doesn't lose it. */
export function loadSession(): Session | null {
  const parsed = loadJson<unknown>(SESSION_KEY, null);
  return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Session) : null;
}

export function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
