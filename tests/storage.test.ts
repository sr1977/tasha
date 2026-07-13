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

  it('merges partial stored settings over defaults', () => {
    store.set('tasha.settings', JSON.stringify({ workSecs: 30 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, workSecs: 30 });
  });

  it('round-trips saved settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, stations: 8 });
    expect(loadSettings().stations).toBe(8);
  });

  it('migrates old label-only partner configs to default groups, keeping on/off', () => {
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, names: ['A', 'B'] } }));
    expect(loadSettings().partner).toEqual(DEFAULT_SETTINGS.partner);
    store.set('tasha.settings', JSON.stringify({ partner: { on: false, names: ['A', 'B'] } }));
    expect(loadSettings().partner).toEqual({ on: false, groups: DEFAULT_SETTINGS.partner!.groups });
  });

  it('rejects out-of-range or malformed group arrays', () => {
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, groups: [] } }));
    expect(loadSettings().partner!.groups).toEqual(DEFAULT_SETTINGS.partner!.groups);
    store.set('tasha.settings', JSON.stringify({ partner: { on: true, groups: [['x'], 3] } }));
    expect(loadSettings().partner!.groups).toEqual(DEFAULT_SETTINGS.partner!.groups);
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
