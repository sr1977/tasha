import { DEFAULT_SETTINGS, type Exercise, type Settings } from './types';
import { SEED_POOL } from './seed';

const POOL_KEY = 'tasha.pool';
const SETTINGS_KEY = 'tasha.settings';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadPool(): Exercise[] {
  const parsed = load<unknown>(POOL_KEY, SEED_POOL);
  return Array.isArray(parsed) ? (parsed as Exercise[]) : SEED_POOL;
}

export function savePool(pool: Exercise[]): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
}

export function loadSettings(): Settings {
  const parsed = load<unknown>(SETTINGS_KEY, {});
  const partial = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<Settings>) : {};
  return { ...DEFAULT_SETTINGS, ...partial };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
