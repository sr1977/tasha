import { describe, expect, it } from 'vitest';
import {
  buildSession,
  generateSession,
  pickStations,
  roundCount,
  sessionDuration,
  replaceInSession,
  banReplacement,
  groupExercises,
  stationsForRound,
  spaceDumbbells,
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

  it('balances across categories (6 picks from 3 categories = 2 each)', () => {
    const picks = pickStations(pool, 6);
    const counts = new Map<Category, number>();
    for (const p of picks) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2]);
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
  const session = buildSession([stations], small);

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

const exp = (id: string, category: Category, pref?: Exercise['pref']): Exercise => ({
  id,
  name: id,
  category,
  equipment: 'bodyweight',
  pref,
});

describe('preferences', () => {
  it('never picks banned exercises', () => {
    const p = [exp('u1', 'upper'), exp('u2', 'upper', 'ban'), exp('l1', 'lower')];
    for (let i = 0; i < 20; i++) {
      expect(pickStations(p, 3).some((e) => e.id === 'u2')).toBe(false);
    }
  });

  it('ignores bans when everything is banned', () => {
    const p = [exp('u1', 'upper', 'ban'), exp('l1', 'lower', 'ban')];
    expect(pickStations(p, 2)).toHaveLength(2);
  });

  it('weights favourites about 2x', () => {
    const p = [exp('u1', 'upper', 'fav'), exp('u2', 'upper'), exp('u3', 'upper')];
    let favFirst = 0;
    for (let i = 0; i < 400; i++) {
      if (pickStations(p, 1)[0].id === 'u1') favFirst++;
    }
    // fav has 2 of 4 shuffle entries => ~50% (mean 200); unweighted would be ~33% (mean 133).
    // 165 sits >3 sigma from both distributions: reliably passes when weighting
    // works, reliably fails when it doesn't.
    expect(favFirst).toBeGreaterThan(165);
  });
});

describe('replaceInSession', () => {
  const a = exp('a', 'upper');
  const b = exp('b', 'lower');
  const z = exp('z', 'upper');
  const session = buildSession([[a, b]], { workSecs: 5, restSecs: 3, stations: 2, roundRestSecs: 7, totalMins: 1 });
  // kinds: prep, work(a), rest(->b), work(b), roundRest(->a), work(a), rest(->b), work(b)

  it('swaps only intervals after fromIndex', () => {
    const out = replaceInSession(session, 1, 'a', z);
    expect(out[1].exercise!.id).toBe('a'); // current interval untouched
    expect(out[4].exercise!.id).toBe('z'); // roundRest preview swapped
    expect(out[5].exercise!.id).toBe('z'); // later work swapped
  });

  it('leaves other exercises alone', () => {
    const out = replaceInSession(session, 1, 'a', z);
    expect(out[3].exercise!.id).toBe('b');
    expect(out[6].exercise!.id).toBe('b');
  });
});

describe('banReplacement', () => {
  const stations = [exp('u1', 'upper'), exp('l1', 'lower')];
  it('prefers same category, excluding stations and banned', () => {
    const pool = [...stations, exp('u2', 'upper'), exp('u3', 'upper', 'ban'), exp('c1', 'core')];
    expect(banReplacement(pool, stations, stations[0], () => 0)!.id).toBe('u2');
  });
  it('falls back to any unused non-banned exercise', () => {
    const pool = [...stations, exp('c1', 'core')];
    expect(banReplacement(pool, stations, stations[0], () => 0)!.id).toBe('c1');
  });
  it('returns null when no candidate exists', () => {
    expect(banReplacement([...stations], stations, stations[0])).toBeNull();
  });
  it('never returns a banned exercise even as same-category fallback', () => {
    const stations = [exp('u1', 'upper')];
    const pool = [...stations, exp('u2', 'upper', 'ban'), exp('c1', 'core', 'ban')];
    expect(banReplacement(pool, stations, stations[0])).toBeNull();
  });
});

describe('stationsForRound', () => {
  const a = exp('a', 'upper');
  const b = exp('b', 'lower');
  const z = exp('z', 'upper');

  it('returns a round’s stations in order', () => {
    expect(stationsForRound(buildSession([[a, b]], small), 1).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('reflects mid-session replacements per round', () => {
    const out = replaceInSession(buildSession([[a, b]], small), 1, 'a', z);
    expect(stationsForRound(out, 1).map((e) => e.id)).toEqual(['a', 'b']); // current round untouched
    expect(stationsForRound(out, 2).map((e) => e.id)).toEqual(['z', 'b']); // later round swapped
  });
});

describe('distinct rounds', () => {
  const setA = [exp('a', 'upper'), exp('b', 'lower')];
  const setB = [exp('c', 'core'), exp('d', 'upper')];

  it('cycles the sets across rounds', () => {
    const works = buildSession([setA, setB], small).filter((i) => i.kind === 'work');
    expect(works.map((i) => i.exercise!.id)).toEqual(['a', 'b', 'c', 'd']); // round 1 = A, round 2 = B
  });

  it('roundRest previews the next round’s first station', () => {
    const rr = buildSession([setA, setB], small).find((i) => i.kind === 'roundRest')!;
    expect(rr.exercise!.id).toBe('c');
  });

  it('generateSession makes consecutive rounds differ', () => {
    const session = generateSession(pool, { ...small, distinctRounds: 2 });
    expect(stationsForRound(session, 1)).not.toEqual(stationsForRound(session, 2));
  });
});

describe('spaceDumbbells', () => {
  const db = (id: string, category: Category): Exercise => ({
    id,
    name: id,
    category,
    equipment: 'dumbbells',
  });
  // circular window of `count` consecutive stations must hold <= 1 dumbbell
  const maxConcurrentDb = (out: Exercise[], count: number) => {
    let worst = 0;
    for (let s = 0; s < out.length; s++) {
      let c = 0;
      for (let g = 0; g < count; g++) if (out[(s + g) % out.length].equipment === 'dumbbells') c++;
      worst = Math.max(worst, c);
    }
    return worst;
  };

  it('spaces dumbbells so 2 groups never share the weights (adjacent pair)', () => {
    const picks = [db('d1', 'upper'), db('d2', 'lower'), ex('b1', 'core'), ex('b2', 'core')];
    const out = spaceDumbbells(picks, picks, 2);
    expect(out).toHaveLength(4);
    expect(maxConcurrentDb(out, 2)).toBe(1);
  });

  it('swaps surplus dumbbells for pool bodyweight when too many to space', () => {
    // 4 dumbbells over 4 stations, 2 groups => max 2 may stay; 2 get swapped out.
    const picks = [db('d1', 'upper'), db('d2', 'upper'), db('d3', 'lower'), db('d4', 'lower')];
    const pool = [...picks, ex('b1', 'upper'), ex('b2', 'lower')];
    const out = spaceDumbbells(picks, pool, 2, () => 0);
    expect(out).toHaveLength(4);
    expect(out.filter((e) => e.equipment === 'dumbbells')).toHaveLength(2);
    expect(maxConcurrentDb(out, 2)).toBe(1);
  });

  it('leaves picks untouched for a single group (no concurrency)', () => {
    const picks = [db('d1', 'upper'), db('d2', 'lower')];
    expect(spaceDumbbells(picks, picks, 1)).toEqual(picks);
  });
});

describe('groupExercises', () => {
  const stations = [exp('s1', 'upper'), exp('s2', 'lower'), exp('s3', 'core'), exp('s4', 'upper')];

  it('count 2 matches the old partner behaviour incl. wrap', () => {
    expect(groupExercises(stations, 1, 2).map((e) => e.id)).toEqual(['s1', 's2']);
    expect(groupExercises(stations, 4, 2).map((e) => e.id)).toEqual(['s4', 's1']);
  });

  it('count 4 on 4 stations covers all stations in rotated order', () => {
    expect(groupExercises(stations, 1, 4).map((e) => e.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(groupExercises(stations, 3, 4).map((e) => e.id)).toEqual(['s3', 's4', 's1', 's2']);
  });

  it('count 3 on 3 stations wraps correctly', () => {
    const three = stations.slice(0, 3);
    expect(groupExercises(three, 2, 3).map((e) => e.id)).toEqual(['s2', 's3', 's1']);
  });

  it('count 1 is the station’s own exercise', () => {
    expect(groupExercises(stations, 3, 1).map((e) => e.id)).toEqual(['s3']);
  });
});
