import { DEFAULT_ROSTER, DEFAULT_SETTINGS, type Exercise, type Settings } from './types';
import { SEED_POOL } from './seed';

const POOL_KEY = 'tasha.pool';
const SETTINGS_KEY = 'tasha.settings';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadPool(): Exercise[] {
  const parsed = loadJson<unknown>(POOL_KEY, SEED_POOL);
  if (!Array.isArray(parsed)) return SEED_POOL;
  // Cardio was dropped — filter it out of pools saved before the change.
  return (parsed as Exercise[]).filter((e) => (e.category as string) !== 'cardio');
}

export function savePool(pool: Exercise[]): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
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
