import { describe, expect, it } from 'vitest';
import {
  buildSession,
  generateSession,
  pickStations,
  roundCount,
  sessionDuration,
  PREP_SECS,
} from '../src/generator';
import { DEFAULT_SETTINGS, type Category, type Exercise, type Settings } from '../src/types';

const ex = (id: string, category: Category): Exercise => ({
  id,
  name: id,
  category,
  equipment: 'bodyweight',
});

const pool: Exercise[] = [
  ex('u1', 'upper'), ex('u2', 'upper'),
  ex('l1', 'lower'), ex('l2', 'lower'),
  ex('c1', 'core'), ex('c2', 'core'),
  ex('k1', 'cardio'), ex('k2', 'cardio'),
];

// 2 stations, work 5, rest 3, round rest 7 => roundLength 23; 1 min target => 2 rounds
const small: Settings = { workSecs: 5, restSecs: 3, stations: 2, roundRestSecs: 7, totalMins: 1 };

describe('roundCount', () => {
  it('computes rounds from the spec formula', () => {
    // 6*(40+20)+60 = 420; floor(2700/420) = 6
    expect(roundCount(DEFAULT_SETTINGS)).toBe(6);
    expect(roundCount(small)).toBe(2);
  });

  it('always returns at least 1 round', () => {
    expect(roundCount({ ...small, totalMins: 0.1 as number })).toBe(1);
  });
});

describe('pickStations', () => {
  it('throws on an empty pool', () => {
    expect(() => pickStations([], 4)).toThrow('empty pool');
  });

  it('returns the requested number of stations', () => {
    expect(pickStations(pool, 6)).toHaveLength(6);
  });

  it('balances across categories (8 picks from 4 categories = 2 each)', () => {
    const picks = pickStations(pool, 8);
    const counts = new Map<Category, number>();
    for (const p of picks) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2, 2]);
  });

  it('skips categories with no exercises', () => {
    const upperOnly = [ex('u1', 'upper'), ex('u2', 'upper')];
    const picks = pickStations(upperOnly, 2);
    expect(picks.every((p) => p.category === 'upper')).toBe(true);
  });

  it('reuses exercises when pool is smaller than station count', () => {
    const tiny = [ex('u1', 'upper'), ex('l1', 'lower')];
    expect(pickStations(tiny, 4)).toHaveLength(4);
  });
});

describe('buildSession', () => {
  const stations = [ex('u1', 'upper'), ex('l1', 'lower')];
  const session = buildSession(stations, small);

  it('lays out prep, work/rest pairs, roundRest between rounds, no trailing rests', () => {
    expect(session.map((i) => i.kind)).toEqual([
      'prep', 'work', 'rest', 'work', 'roundRest', 'work', 'rest', 'work',
    ]);
  });

  it('uses the same stations each round with correct numbering', () => {
    const works = session.filter((i) => i.kind === 'work');
    expect(works.map((i) => i.exercise!.id)).toEqual(['u1', 'l1', 'u1', 'l1']);
    expect(works.map((i) => i.round)).toEqual([1, 1, 2, 2]);
    expect(works.map((i) => i.station)).toEqual([1, 2, 1, 2]);
  });

  it('puts the upcoming exercise on rest and roundRest intervals', () => {
    expect(session[2].exercise!.id).toBe('l1'); // rest before station 2
    expect(session[4].exercise!.id).toBe('u1'); // roundRest -> next round starts at station 1
  });

  it('has a 10s prep and correct total duration', () => {
    expect(session[0].duration).toBe(PREP_SECS);
    // 10 + (5+3+5) + 7 + (5+3+5) = 43
    expect(sessionDuration(session)).toBe(43);
  });
});

describe('generateSession', () => {
  it('produces a full session from a pool', () => {
    const session = generateSession(pool, small);
    expect(session[0].kind).toBe('prep');
    expect(session.filter((i) => i.kind === 'work')).toHaveLength(4);
  });
});
