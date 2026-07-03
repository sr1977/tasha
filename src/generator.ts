import type { Category, Exercise, Session, Settings } from './types';

export const PREP_SECS = 10;

const CATEGORY_ORDER: Category[] = ['upper', 'lower', 'core', 'cardio'];

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

export function buildSession(stations: Exercise[], s: Settings): Session {
  const rounds = roundCount(s);
  const session: Session = [{ kind: 'prep', duration: PREP_SECS, round: 1, station: 0 }];
  for (let r = 1; r <= rounds; r++) {
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
        exercise: stations[0],
        duration: s.roundRestSecs,
        round: r,
        station: 0,
      });
    }
  }
  return session;
}

export function generateSession(
  pool: Exercise[],
  s: Settings,
  rand: () => number = Math.random,
): Session {
  return buildSession(pickStations(pool, s.stations, rand), s);
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

export function partnerExercises(stations: Exercise[], station: number): [Exercise, Exercise] {
  return [stations[station - 1], stations[station % stations.length]];
}

// Latest exercise seen per station — later rounds reflect mid-session
// replacements (bans), so last write wins.
export function stationTemplate(session: Session): Exercise[] {
  const stations: Exercise[] = [];
  for (const iv of session) {
    if (iv.kind === 'work' && iv.exercise) stations[iv.station - 1] = iv.exercise;
  }
  return stations;
}
