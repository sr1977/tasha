import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

import { loadPool, loadSettings, savePool, saveSettings } from '../src/storage';
import { SEED_POOL } from '../src/seed';
import { DEFAULT_ROSTER, DEFAULT_SETTINGS } from '../src/types';

describe('storage', () => {
  beforeEach(() => store.clear());

  it('returns seed pool when nothing stored', () => {
    expect(loadPool()).toEqual(SEED_POOL);
  });

  it('returns seed pool when stored JSON is corrupt', () => {
    store.set('tasha.pool', '{not json');
    expect(loadPool()).toEqual(SEED_POOL);
  });

  it('round-trips a saved pool', () => {
    const pool = [{ id: 'x', name: 'Test', category: 'core', equipment: 'bodyweight' } as const];
    savePool([...pool]);
    expect(loadPool()).toEqual(pool);
  });

  it('delivers seed exercises added since the pool was saved', () => {
    // A pool saved before the last two seed entries existed.
    const old = SEED_POOL.slice(0, SEED_POOL.length - 2);
    store.set('tasha.pool', JSON.stringify(old));
    expect(loadPool()).toEqual(SEED_POOL);
  });

  it('offers each new seed exercise once — deleting it keeps it deleted', () => {
    const old = SEED_POOL.slice(0, SEED_POOL.length - 2);
    store.set('tasha.pool', JSON.stringify(old));
    const merged = loadPool(); // the additions arrive and are persisted
    expect(merged).toHaveLength(SEED_POOL.length);
    savePool(merged.filter((e) => e.id !== SEED_POOL[SEED_POOL.length - 1].id));
    expect(loadPool()).toHaveLength(SEED_POOL.length - 1);
  });

  it('backfills seed cues onto pools saved before multi-cue seeds', () => {
    const { cues: _dropped, ...bare } = SEED_POOL[0];
    store.set('tasha.pool', JSON.stringify([bare, ...SEED_POOL.slice(1)]));
    expect(loadPool()[0].cues).toEqual(SEED_POOL[0].cues);
  });

  it('keeps user-edited cues over the seed backfill', () => {
    const edited = { ...SEED_POOL[0], cues: ['my own cue'] };
    store.set('tasha.pool', JSON.stringify([edited, ...SEED_POOL.slice(1)]));
    expect(loadPool()[0].cues).toEqual(['my own cue']);
  });

  it('leaves a pool alone once it has seen every seed exercise', () => {
    const custom = [{ id: 'x', name: 'Test', category: 'core', equipment: 'bodyweight' } as const];
    savePool([...custom]);
    expect(loadPool()).toEqual(custom);
    expect(loadPool()).toEqual(custom); // idempotent across loads
  });

  it('purges retired seed exercises from saved pools', () => {
    const retired = { id: 'seed-1', name: 'Pike push-ups', category: 'upper', equipment: 'bodyweight' };
    store.set('tasha.pool', JSON.stringify([...SEED_POOL, retired]));
    store.set('tasha.seedMerged', '999'); // no additions pending
    expect(loadPool().some((e) => e.id === 'seed-1')).toBe(false);
  });

  it('merges partial stored settings over defaults', () => {
    store.set('tasha.settings', JSON.stringify({ workSecs: 30 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, workSecs: 30 });
  });

  it('round-trips saved settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, restSecs: 25 });
    expect(loadSettings().restSecs).toBe(25);
  });

  it('migrates old label-only partner configs to default groups, keeping on/off', () => {
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, names: ['A', 'B'] } }));
    expect(loadSettings().partner).toEqual(DEFAULT_SETTINGS.partner);
    store.set('tasha.settings', JSON.stringify({ partner: { on: false, names: ['A', 'B'] } }));
    expect(loadSettings().partner).toEqual({ on: false, groups: DEFAULT_SETTINGS.partner!.groups });
  });

  it('re-packs stored groups of 3+ into pairs on load', () => {
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, groups: [['a', 'b', 'c'], ['d']] } }));
    expect(loadSettings().partner!.groups).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('rejects out-of-range or malformed group arrays', () => {
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, groups: [] } }));
    expect(loadSettings().partner!.groups).toEqual(DEFAULT_SETTINGS.partner!.groups);
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, groups: [['x'], 3] } }));
    expect(loadSettings().partner!.groups).toEqual(DEFAULT_SETTINGS.partner!.groups);
  });

  it('migrates the old focus checklist: single tick -> 100% of it, else no focus', () => {
    store.set('tasha.settings', JSON.stringify({ focus: ['core'] }));
    expect(loadSettings().focus).toEqual({ upper: 0, lower: 0, core: 100 });
    store.set('tasha.settings', JSON.stringify({ focus: ['upper', 'lower'] }));
    expect(loadSettings().focus).toBeUndefined();
    store.set('tasha.settings', JSON.stringify({ focus: [] }));
    expect(loadSettings().focus).toBeUndefined();
  });

  it('migrates the interim focus+lean shape to a percentage mix summing 100', () => {
    store.set('tasha.settings', JSON.stringify({ focus: { category: 'core', lean: 100 } }));
    expect(loadSettings().focus).toEqual({ upper: 0, lower: 0, core: 100 });
    store.set('tasha.settings', JSON.stringify({ focus: { category: 'core', lean: 50 } }));
    const mix = loadSettings().focus!;
    expect(mix.core).toBe(67);
    expect(mix.upper + mix.lower + mix.core).toBe(100);
  });

  it('defaults the roster when missing or malformed', () => {
    store.set('tasha.settings', JSON.stringify({ roster: 'nope' }));
    expect(loadSettings().roster).toEqual(DEFAULT_ROSTER);
  });

  it('keeps a valid stored roster and groups', () => {
    const partner = { on: true, groups: [['Steve'], ['Amanda']] };
    store.set('tasha.settings', JSON.stringify({ roster: ['Steve', 'Amanda'], partner }));
    const s = loadSettings();
    expect(s.roster).toEqual(['Steve', 'Amanda']);
    expect(s.partner).toEqual(partner);
  });

  it('falls back to seed pool when stored value is JSON null', () => {
    store.set('tasha.pool', 'null');
    expect(loadPool()).toEqual(SEED_POOL);
  });

  it('falls back to seed pool when stored value is not an array', () => {
    store.set('tasha.pool', '{"a":1}');
    expect(loadPool()).toEqual(SEED_POOL);
  });

  it('falls back to defaults when stored settings are not an object', () => {
    store.set('tasha.settings', '"hello"');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
