import { DEFAULT_ROSTER, DEFAULT_SETTINGS, type Category, type Exercise, type Session, type Settings } from './types';
import { RETIRED_SEED_IDS, SEED_POOL, SEED_RAW_COUNT, seedAdditionsSince } from './seed';

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
    localStorage.setItem(SEED_MARK_KEY, String(SEED_RAW_COUNT));
    return SEED_POOL;
  }
  // Dropped defaults (the cardio category, retired seed exercises) are purged
  // from pools saved before the change. Pools saved before multi-cue seeds
  // adopt the seed's extra cues; an entry that already has its own cues
  // (user-edited) keeps them.
  const seedById = new Map(SEED_POOL.map((e) => [e.id, e]));
  const pool = (parsed as Exercise[])
    .filter((e) => (e.category as string) !== 'cardio' && !RETIRED_SEED_IDS.has(e.id))
    .map((e) => (!e.cues && seedById.get(e.id)?.cues ? { ...e, cues: seedById.get(e.id)!.cues } : e));
  const stored = localStorage.getItem(SEED_MARK_KEY);
  const mark = stored === null ? inferSeedMark(pool) : Number(stored) || 0;
  if (mark >= SEED_RAW_COUNT) return pool;
  // Persist straight away: the mark may only advance once the merge is durable,
  // or a load-without-save would lose the additions and never offer them again.
  // Skip additions whose name the pool already has — a user-created exercise
  // that later graduates into the seed must not arrive as a duplicate.
  const names = new Set(pool.map((e) => e.name.trim().toLowerCase()));
  const merged = [...pool, ...seedAdditionsSince(mark).filter((e) => !names.has(e.name.trim().toLowerCase()))];
  savePool(merged);
  return merged;
}

export function savePool(pool: Exercise[]): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  localStorage.setItem(SEED_MARK_KEY, String(SEED_RAW_COUNT));
}

/** A mix with `pct` on one category and the rest split across the others. */
function mixOf(category: Category, pct: number): Record<Category, number> {
  const other = Math.floor((100 - pct) / 2);
  const mix = { upper: other, lower: other, core: other, [category]: pct };
  const cats: Category[] = ['upper', 'lower', 'core'];
  const first = cats.find((c) => c !== category)!;
  mix[first] += 100 - cats.reduce((sum, c) => sum + mix[c], 0); // absorb rounding
  return mix;
}

export function loadSettings(): Settings {
  const parsed = loadJson<unknown>(SETTINGS_KEY, {});
  const partial = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<Settings>) : {};
  const s = { ...DEFAULT_SETTINGS, ...partial };
  // Focus migrations. Oldest shape: a category checklist — a single tick was
  // exclusive -> 100% of that category; anything else -> even. Interim shape:
  // { category, lean } -> the focused share it produced, others splitting the
  // remainder. Current shape: percentages per category summing to 100.
  const f: unknown = s.focus;
  if (Array.isArray(f)) {
    const cats = f as string[];
    s.focus =
      cats.length === 1 && ['upper', 'lower', 'core'].includes(cats[0])
        ? mixOf(cats[0] as Category, 100)
        : undefined;
  } else if (f && typeof f === 'object' && 'lean' in f && 'category' in f) {
    const { category, lean } = f as { category: Category; lean: number };
    const pct = Math.round(100 / 3 + (Math.max(0, Math.min(100, lean)) * 2) / 3);
    s.focus = ['upper', 'lower', 'core'].includes(category) ? mixOf(category, pct) : undefined;
  }
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
