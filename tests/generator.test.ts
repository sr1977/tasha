import { describe, expect, it } from 'vitest';
import {
  buildSession,
  generateSession,
  pickStations,
  rebalanceMix,
  fitRounds,
  fitSession,
  sessionSecs,
  sessionDuration,
  replaceInSession,
  banReplacement,
  groupExercises,
  stationsForRound,
  spaceEquipment,
  focusSlots,
  stationSplit,
  OVERHEAD_SECS,
  PREP_SECS,
  packGroups,
  placeInGroups,
  MAX_GROUPS,
} from '../src/generator';
import { DEFAULT_SETTINGS, type Category, type Equipment, type Exercise, type Settings } from '../src/types';

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

// work 5, rest 3, round rest 7; target = overhead + exactly two 2-station
// rounds (2×13s work+rest, one 7s round rest), so 2-station builds fit 2 rounds
const small: Settings = {
  workSecs: 5,
  restSecs: 3,
  roundRestSecs: 7,
  totalMins: (OVERHEAD_SECS + 2 * 13 + 7) / 60,
};

describe('fit to target length', () => {
  it('sessionSecs is the exact wall-clock formula', () => {
    // overhead + 2 rounds of (2×5 work + 1×3 rest) + one 7s round rest
    expect(sessionSecs(small, 2, 2)).toBe(OVERHEAD_SECS + 2 * 13 + 7);
  });

  it('fitRounds keeps rounds a multiple of the two distinct layouts', () => {
    expect(fitRounds(small, 2)).toBe(2);
    // odd counts are out: 4 is the closest even fit at 6 stations
    expect(fitRounds(DEFAULT_SETTINGS, 6)).toBe(4);
    expect(fitRounds(DEFAULT_SETTINGS, 6) % 2).toBe(0);
  });

  it('fitRounds never returns less than 2 rounds', () => {
    expect(fitRounds({ ...small, totalMins: 0.1 as number }, 2)).toBe(2);
  });

  it('fitSession favours stations over rounds among near-target shapes', () => {
    // 5×6 (46:25) fits closest, but 8×4 (47:45) is still within three minutes
    // of the 45:00 target — more stations wins
    expect(fitSession(DEFAULT_SETTINGS)).toEqual({ stations: 8, rounds: 4 });
  });

  it('fitSession still falls back to closest fit when big circuits miss badly', () => {
    // 20:00 target: 8 stations lands 5 minutes out, smaller circuits get closer
    const s = { ...DEFAULT_SETTINGS, totalMins: 20 };
    const { stations, rounds } = fitSession(s);
    expect(Math.abs(sessionSecs(s, stations, rounds) - 20 * 60)).toBeLessThanOrEqual(180);
  });

  it('fitSession keeps at least as many stations as groups', () => {
    const fourGroups = {
      ...DEFAULT_SETTINGS,
      partner: { on: true, groups: [['a'], ['b'], ['c'], ['d']] },
    };
    expect(fitSession(fourGroups).stations).toBeGreaterThanOrEqual(4);
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

  it('lays out prep, warmup + breather, work/rest pairs, roundRest between rounds, cooldown at the end', () => {
    expect(session.map((i) => i.kind)).toEqual([
      'prep', 'warmup', 'warmup', 'warmup', 'warmup', 'warmup', 'rest',
      'work', 'rest', 'work', 'roundRest', 'work', 'rest', 'work',
      'cooldown', 'cooldown', 'cooldown', 'cooldown', 'cooldown',
    ]);
  });

  it('warm-up and cool-down each fit in 2 minutes including their breathers', () => {
    const wu = session.filter((i) => i.kind === 'warmup');
    const cd = session.filter((i) => i.kind === 'cooldown').reduce((t, i) => t + i.duration, 0);
    expect(wu.every((i) => i.duration === 15)).toBe(true);
    expect(wu.reduce((t, i) => t + i.duration, 0)).toBe(75);
    expect(session[6]).toMatchObject({ kind: 'rest', duration: 20 });
    expect(session[6].exercise!.id).toBe('u1');
    expect(wu.reduce((t, i) => t + i.duration, 0) + session[6].duration).toBeLessThanOrEqual(120);
    expect(cd).toBe(100); // 20s "great work" breather + 4×20s stretches
    expect(session.find((i) => i.kind === 'cooldown')!.exercise!.id).toBe('cd-gap');
  });

  it('uses the same stations each round with correct numbering', () => {
    const works = session.filter((i) => i.kind === 'work');
    expect(works.map((i) => i.exercise!.id)).toEqual(['u1', 'l1', 'u1', 'l1']);
    expect(works.map((i) => i.round)).toEqual([1, 1, 2, 2]);
    expect(works.map((i) => i.station)).toEqual([1, 2, 1, 2]);
  });

  it('puts the upcoming exercise on rest and roundRest intervals', () => {
    expect(session[8].exercise!.id).toBe('l1'); // rest before station 2
    expect(session[10].exercise!.id).toBe('u1'); // roundRest -> next round starts at station 1
  });

  it('has a 10s prep and correct total duration', () => {
    expect(session[0].duration).toBe(PREP_SECS);
    // 10 + warmup 75 + breather 20 + (5+3+5) + 7 + (5+3+5) + cooldown 100 = 238
    expect(sessionDuration(session)).toBe(238);
  });
});

describe('generateSession', () => {
  it('produces a full session shaped by the target length', () => {
    const session = generateSession(pool, small);
    const { stations, rounds } = fitSession(small);
    expect(session[0].kind).toBe('prep');
    expect(session.filter((i) => i.kind === 'work')).toHaveLength(stations * rounds);
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
  const session = buildSession([[a, b]], small);
  // kinds: prep, warmup×5, rest(gap)@6, work(a)@7, rest(->b)@8, work(b)@9, roundRest(->a)@10, work(a)@11, rest(->b)@12, work(b)@13, cooldown×4

  it('swaps only intervals after fromIndex', () => {
    const out = replaceInSession(session, 7, 'a', z);
    expect(out[7].exercise!.id).toBe('a'); // current interval untouched
    expect(out[10].exercise!.id).toBe('z'); // roundRest preview swapped
    expect(out[11].exercise!.id).toBe('z'); // later work swapped
  });

  it('leaves other exercises alone', () => {
    const out = replaceInSession(session, 7, 'a', z);
    expect(out[9].exercise!.id).toBe('b');
    expect(out[12].exercise!.id).toBe('b');
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
    const out = replaceInSession(buildSession([[a, b]], small), 7, 'a', z);
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
    const session = generateSession(pool, small);
    expect(stationsForRound(session, 1)).not.toEqual(stationsForRound(session, 2));
  });
});

describe('focus', () => {
  const mixed = [
    ex('u1', 'upper'), ex('u2', 'upper'),
    ex('l1', 'lower'), ex('l2', 'lower'),
    ex('c1', 'core'), ex('c2', 'core'),
  ];

  it('splits evenly with no mix', () => {
    expect(stationSplit(6)).toEqual({ upper: 2, lower: 2, core: 2 });
  });

  it('an even mix matches the even split', () => {
    expect(stationSplit(6, { upper: 34, lower: 33, core: 33 })).toEqual({ upper: 2, lower: 2, core: 2 });
  });

  it('60/20/20 tilts toward core, keeping the others in', () => {
    expect(stationSplit(6, { upper: 20, lower: 20, core: 60 })).toEqual({ upper: 1, lower: 1, core: 4 });
  });

  it('100% is that category only', () => {
    expect(stationSplit(6, { upper: 0, lower: 0, core: 100 })).toEqual({ upper: 0, lower: 0, core: 6 });
  });

  it('a degenerate all-zero mix falls back to even', () => {
    expect(stationSplit(6, { upper: 0, lower: 0, core: 0 })).toEqual({ upper: 2, lower: 2, core: 2 });
  });

  it('always sums to the station count, even at awkward sizes', () => {
    for (const stations of [2, 3, 4, 5, 7]) {
      for (const pct of [0, 30, 50, 70, 100]) {
        const rest = 100 - pct;
        const s = stationSplit(stations, { upper: Math.ceil(rest / 2), lower: pct, core: Math.floor(rest / 2) });
        expect(s.upper + s.lower + s.core).toBe(stations);
      }
    }
  });

  it('focusSlots deals the split as an interleaved category sequence', () => {
    const slots = focusSlots(6, { upper: 0, lower: 0, core: 100 });
    expect(slots).toEqual(['core', 'core', 'core', 'core', 'core', 'core']);
    const even = focusSlots(6);
    expect(even.filter((c) => c === 'upper')).toHaveLength(2);
    expect(even.filter((c) => c === 'core')).toHaveLength(2);
  });

  it('generates work stations only from the focused category at 100%', () => {
    const session = generateSession(mixed, { ...small, focus: { upper: 0, lower: 0, core: 100 } });
    const works = session.filter((i) => i.kind === 'work');
    expect(works.length).toBeGreaterThan(0);
    expect(works.every((i) => i.exercise!.category === 'core')).toBe(true);
  });

  it('keeps every category in the mix at a 60/20/20 split', () => {
    const session = generateSession(mixed, {
      ...small,
      stations: 6,
      focus: { upper: 20, lower: 20, core: 60 },
    });
    const cats = new Set(session.filter((i) => i.kind === 'work').map((i) => i.exercise!.category));
    expect(cats).toEqual(new Set(['upper', 'lower', 'core']));
  });

  it('leaves the warm-up and cool-down full-body', () => {
    const session = generateSession(mixed, { ...small, focus: { upper: 0, lower: 0, core: 100 } });
    const other = session.filter((i) => i.kind === 'warmup' || i.kind === 'cooldown');
    expect(other.some((i) => i.exercise!.category !== 'core')).toBe(true);
  });
});

describe('rebalanceMix', () => {
  it('spreads a change proportionally across untouched dials', () => {
    expect(rebalanceMix({ upper: 34, lower: 33, core: 33 }, 'core', 60, [])).toEqual({
      upper: 20,
      lower: 20,
      core: 60,
    });
  });

  it('never moves a dial the user has already set', () => {
    // core was set to 60 first; setting upper to 30 must drain lower only
    const next = rebalanceMix({ upper: 20, lower: 20, core: 60 }, 'upper', 30, ['core']);
    expect(next).toEqual({ upper: 30, lower: 10, core: 60 });
  });

  it('when every dial is touched, the least recently set gives way', () => {
    const next = rebalanceMix({ upper: 30, lower: 10, core: 60 }, 'lower', 30, ['core', 'upper']);
    expect(next).toEqual({ upper: 30, lower: 30, core: 40 });
  });

  it('drags touched dials in only when untouched ones cannot absorb it', () => {
    // core (touched) holds 80; raising upper to 50 zeroes lower then takes from core
    const next = rebalanceMix({ upper: 10, lower: 10, core: 80 }, 'upper', 50, ['core']);
    expect(next).toEqual({ upper: 50, lower: 0, core: 50 });
  });

  it('always totals exactly 100', () => {
    let mix = { upper: 34, lower: 33, core: 33 };
    const touched: ('upper' | 'lower' | 'core')[] = [];
    for (const [cat, v] of [['core', 57], ['upper', 13], ['lower', 99], ['core', 1]] as const) {
      mix = rebalanceMix(mix, cat, v, touched);
      touched.splice(0, touched.length, ...touched.filter((c) => c !== cat), cat);
      expect(mix.upper + mix.lower + mix.core).toBe(100);
    }
  });
});

describe('spaceEquipment', () => {
  const kit =
    (equipment: Equipment) =>
    (id: string, category: Category): Exercise => ({ id, name: id, category, equipment });
  const db = kit('dumbbells');
  const mb = kit('medicine ball');
  // Worst circular window of `count` consecutive stations, per equipment kind:
  // rounds repeat, so the last station and the first are worked together too.
  const maxConcurrent = (out: Exercise[], count: number, equipment: Equipment) => {
    let worst = 0;
    for (let s = 0; s < out.length; s++) {
      let c = 0;
      for (let g = 0; g < count; g++) if (out[(s + g) % out.length].equipment === equipment) c++;
      worst = Math.max(worst, c);
    }
    return worst;
  };

  it('spaces dumbbells so 2 groups never share the weights (adjacent pair)', () => {
    const picks = [db('d1', 'upper'), db('d2', 'lower'), ex('b1', 'core'), ex('b2', 'core')];
    const out = spaceEquipment(picks, picks, 2);
    expect(out).toHaveLength(4);
    expect(maxConcurrent(out, 2, 'dumbbells')).toBe(1);
  });

  it('swaps surplus dumbbells for pool bodyweight when too many to space', () => {
    // 4 dumbbells over 4 stations, 2 groups => max 2 may stay; 2 get swapped out.
    const picks = [db('d1', 'upper'), db('d2', 'upper'), db('d3', 'lower'), db('d4', 'lower')];
    const pool = [...picks, ex('b1', 'upper'), ex('b2', 'lower')];
    const out = spaceEquipment(picks, pool, 2, () => 0);
    expect(out).toHaveLength(4);
    expect(out.filter((e) => e.equipment === 'dumbbells')).toHaveLength(2);
    expect(maxConcurrent(out, 2, 'dumbbells')).toBe(1);
  });

  it('leaves picks untouched for a single group (no concurrency)', () => {
    const picks = [db('d1', 'upper'), db('d2', 'lower')];
    expect(spaceEquipment(picks, picks, 1)).toEqual(picks);
  });

  it('never runs two medicine-ball stations at once', () => {
    const picks = [mb('m1', 'core'), mb('m2', 'core'), ex('b1', 'upper'), ex('b2', 'lower')];
    const out = spaceEquipment(picks, picks, 2);
    expect(maxConcurrent(out, 2, 'medicine ball')).toBe(1);
  });

  it('constrains each kind separately — dumbbells and the ball may run together', () => {
    // 3 dumbbells + 3 balls over 6 stations, 2 groups: every slot is shared kit,
    // so the only valid layouts alternate the two kinds.
    const picks = [
      db('d1', 'upper'), db('d2', 'lower'), db('d3', 'upper'),
      mb('m1', 'core'), mb('m2', 'core'), mb('m3', 'core'),
    ];
    const out = spaceEquipment(picks, picks, 2);
    expect(out).toHaveLength(6);
    expect(out.filter((e) => e.equipment === 'dumbbells')).toHaveLength(3);
    expect(maxConcurrent(out, 2, 'dumbbells')).toBe(1);
    expect(maxConcurrent(out, 2, 'medicine ball')).toBe(1);
  });

  it('holds the per-kind limit across group counts and station counts', () => {
    const pool = [
      ex('b1', 'upper'), ex('b2', 'lower'), ex('b3', 'core'),
      ex('b4', 'upper'), ex('b5', 'lower'), ex('b6', 'core'),
    ];
    for (let n = 2; n <= 10; n++) {
      for (let count = 2; count <= 4; count++) {
        const picks = Array.from({ length: n }, (_, i) =>
          i % 3 === 0 ? db(`d${i}`, 'upper') : i % 3 === 1 ? mb(`m${i}`, 'core') : ex(`b${i}`, 'lower'),
        );
        const out = spaceEquipment(picks, [...picks, ...pool], count, () => 0);
        expect(out).toHaveLength(n);
        for (const kind of ['dumbbells', 'medicine ball'] as Equipment[]) {
          const used = out.filter((e) => e.equipment === kind).length;
          // Only assert the guarantee where the kind actually fits in n stations.
          if (used <= Math.floor(n / count)) expect(maxConcurrent(out, count, kind)).toBeLessThan(2);
        }
      }
    }
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

describe('packGroups', () => {
  it('splits oversized groups into pairs preserving order', () => {
    expect(packGroups([['a', 'b', 'c']])).toEqual([['a', 'b'], ['c']]);
  });

  it('leaves valid pairs and singles alone — never merges', () => {
    expect(packGroups([['a'], ['b', 'c']])).toEqual([['a'], ['b', 'c']]);
  });

  it('drops empty groups', () => {
    expect(packGroups([[], ['a', 'b'], []])).toEqual([['a', 'b']]);
  });

  it('caps at MAX_GROUPS, overflow members drop to the bench', () => {
    const groups = Array.from({ length: MAX_GROUPS }, (_, i) => [`p${i}`, `q${i}`]);
    expect(packGroups([...groups, ['extra']])).toEqual(groups);
  });
});

describe('placeInGroups', () => {
  it('fills the first group with a free slot', () => {
    expect(placeInGroups([['a'], ['b']], 'x')).toEqual([['a', 'x'], ['b']]);
  });

  it('starts a new group when all pairs are full', () => {
    expect(placeInGroups([['a', 'b']], 'x')).toEqual([['a', 'b'], ['x']]);
  });

  it('returns groups unchanged when at capacity', () => {
    const full = Array.from({ length: MAX_GROUPS }, (_, i) => [`p${i}`, `q${i}`]);
    expect(placeInGroups(full, 'x')).toEqual(full);
  });
});
