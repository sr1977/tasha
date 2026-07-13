import type { Category, Exercise, Session, Settings } from './types';

export const PREP_SECS = 10;

const CATEGORY_ORDER: Category[] = ['upper', 'lower', 'core'];

export function roundCount(s: Settings): number {
  const roundLength = s.stations * (s.workSecs + s.restSecs) + s.roundRestSecs;
  return Math.max(1, Math.floor((s.totalMins * 60) / roundLength));
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickStations(
  pool: Exercise[],
  count: number,
  rand: () => number = Math.random,
): Exercise[] {
  if (pool.length === 0) throw new Error('empty pool');
  const allowed = pool.filter((e) => e.pref !== 'ban');
  // ponytail: everything banned -> ignore bans rather than fail generation
  const usable = allowed.length > 0 ? allowed : pool;
  const byCat = new Map<Category, Exercise[]>();
  for (const cat of CATEGORY_ORDER) {
    const items = usable.filter((e) => e.category === cat);
    // favourites get a double entry => ~2x pick odds
    const weighted = items.flatMap((e) => (e.pref === 'fav' ? [e, e] : [e]));
    const shuffled = shuffle(weighted, rand);
    if (shuffled.length > 0) byCat.set(cat, shuffled);
  }
  const cats = [...byCat.keys()];
  const nextIdx = new Map<Category, number>(cats.map((c) => [c, 0]));
  const picks: Exercise[] = [];
  let ci = 0;
  while (picks.length < count) {
    const cat = cats[ci % cats.length];
    const items = byCat.get(cat)!;
    const i = nextIdx.get(cat)!;
    picks.push(items[i % items.length]); // wraps => reuse when pool is small
    nextIdx.set(cat, i + 1);
    ci++;
  }
  return picks;
}

// Round r uses sets[(r-1) % sets.length], so multiple distinct sets cycle
// across rounds (pass a single-element array for identical rounds).
export function buildSession(sets: Exercise[][], s: Settings): Session {
  const rounds = roundCount(s);
  const session: Session = [{ kind: 'prep', duration: PREP_SECS, round: 1, station: 0 }];
  for (let r = 1; r <= rounds; r++) {
    const stations = sets[(r - 1) % sets.length];
    stations.forEach((exercise, i) => {
      session.push({ kind: 'work', exercise, duration: s.workSecs, round: r, station: i + 1 });
      if (i < stations.length - 1) {
        session.push({
          kind: 'rest',
          exercise: stations[i + 1],
          duration: s.restSecs,
          round: r,
          station: i + 1,
        });
      }
    });
    if (r < rounds) {
      session.push({
        kind: 'roundRest',
        exercise: sets[r % sets.length][0], // preview the next round's first station
        duration: s.roundRestSecs,
        round: r,
        station: 0,
      });
    }
  }
  return session;
}

// Groups rotate on offset stations sharing one set of dumbbells, so any window
// of `count` consecutive stations (the ones worked at the same moment) may hold
// at most one dumbbell exercise. Reorder the picks to space dumbbells `count`
// apart, swapping surplus dumbbells for pool bodyweight when there are too many
// to space at all (> floor(n/count)).
export function spaceDumbbells(
  picks: Exercise[],
  pool: Exercise[],
  count: number,
  rand: () => number = Math.random,
): Exercise[] {
  const n = picks.length;
  const isDb = (e: Exercise) => e.equipment === 'dumbbells';
  if (count <= 1 || n === 0) return picks;

  const maxD = Math.floor(n / count);
  const dumbbells = picks.filter(isDb);
  const body = picks.filter((e) => !isDb(e));

  if (dumbbells.length > maxD) {
    const used = new Set(picks.map((e) => e.id));
    const spare = shuffle(
      pool.filter((e) => !isDb(e) && e.pref !== 'ban' && !used.has(e.id)),
      rand,
    );
    while (dumbbells.length > maxD && spare.length > 0) {
      const dropped = dumbbells.pop()!;
      const i = spare.findIndex((e) => e.category === dropped.category);
      body.push(spare.splice(i >= 0 ? i : 0, 1)[0]);
    }
    // ponytail: if the pool lacks enough bodyweight moves we keep the leftover
    // dumbbells and just space them as evenly as n allows below.
  }

  const d = dumbbells.length;
  const slots: (Exercise | null)[] = new Array(n).fill(null);
  const gap = d > 0 ? n / d : 0; // >= count once d <= maxD
  for (let i = 0; i < d; i++) slots[Math.floor(i * gap)] = dumbbells[i];
  let bi = 0;
  for (let i = 0; i < n; i++) if (slots[i] === null) slots[i] = body[bi++];
  return slots as Exercise[];
}

// Build `numSets` distinct station sets by picking them all in one balanced
// pass, then slicing — consecutive slices draw different exercises per category,
// so the rounds vary. Each set is dumbbell-spaced independently.
export function pickRoundSets(
  pool: Exercise[],
  stationsPerRound: number,
  numSets: number,
  count: number,
  rand: () => number = Math.random,
): Exercise[][] {
  const all = pickStations(pool, stationsPerRound * numSets, rand);
  return Array.from({ length: numSets }, (_, k) =>
    spaceDumbbells(all.slice(k * stationsPerRound, (k + 1) * stationsPerRound), pool, count, rand),
  );
}

export function generateSession(
  pool: Exercise[],
  s: Settings,
  rand: () => number = Math.random,
): Session {
  const count = s.partner?.on ? s.partner.groups.length : 1;
  const numSets = Math.max(1, Math.min(s.distinctRounds ?? 1, roundCount(s)));
  return buildSession(pickRoundSets(pool, s.stations, numSets, count, rand), s);
}

export function sessionDuration(session: Session): number {
  return session.reduce((total, i) => total + i.duration, 0);
}

export function replaceInSession(
  session: Session,
  fromIndex: number,
  bannedId: string,
  replacement: Exercise,
): Session {
  return session.map((iv, i) =>
    i > fromIndex && iv.exercise?.id === bannedId ? { ...iv, exercise: replacement } : iv,
  );
}

export function banReplacement(
  pool: Exercise[],
  stations: Exercise[],
  banned: Exercise,
  rand: () => number = Math.random,
): Exercise | null {
  const stationIds = new Set(stations.map((s) => s.id));
  const ok = (e: Exercise) => e.pref !== 'ban' && e.id !== banned.id && !stationIds.has(e.id);
  const sameCat = pool.filter((e) => ok(e) && e.category === banned.category);
  const candidates = sameCat.length > 0 ? sameCat : pool.filter(ok);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rand() * candidates.length)];
}

// Display/announce name for a group: its members, or a numbered fallback when
// no one is assigned yet.
export function groupLabel(group: string[] | undefined, index: number): string {
  return group && group.length > 0 ? group.join(', ') : `Group ${index + 1}`;
}

export function groupExercises(stations: Exercise[], station: number, count: number): Exercise[] {
  return Array.from({ length: count }, (_, g) => stations[(station - 1 + g) % stations.length]);
}

// The station→exercise layout of one round (rounds can now differ). Reads that
// round's own work intervals, so mid-session replacements (bans/swaps) show.
export function stationsForRound(session: Session, round: number): Exercise[] {
  const stations: Exercise[] = [];
  for (const iv of session) {
    if (iv.kind === 'work' && iv.round === round && iv.exercise) stations[iv.station - 1] = iv.exercise;
  }
  return stations;
}
