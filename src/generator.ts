import type { Category, Exercise, FocusMix, Session, Settings } from './types';

export const PREP_SECS = 10;

// Fixed warm-up block: 5 moves × 15s + a 20s breather before round 1 — capped
// at 2 minutes all-in.
export const WARMUP_SECS = 15;
export const WARMUP_GAP_SECS = 20;
export const WARMUP_MOVES: Exercise[] = [
  { id: 'wu-jog', name: 'Jogging on the spot', category: 'lower', equipment: 'bodyweight' },
  { id: 'wu-heel', name: 'Heel kicks', category: 'lower', equipment: 'bodyweight' },
  { id: 'wu-star', name: 'Star jumps', category: 'lower', equipment: 'bodyweight' },
  { id: 'wu-toe', name: 'Toe touches', category: 'core', equipment: 'bodyweight', cue: 'opposite arm to opposite toe' },
  { id: 'wu-arms', name: 'Arm rotations', category: 'upper', equipment: 'bodyweight', cue: 'backwards, then forwards' },
];

// Fixed cool-down block: a 20s "great work" breather, then 4 stretches × 20s —
// capped at 2 minutes all-in.
export const COOLDOWN_SECS = 20;
export const COOLDOWN_GAP_SECS = 20;
export const COOLDOWN_GAP: Exercise = {
  id: 'cd-gap',
  name: 'Great work!',
  category: 'core',
  equipment: 'bodyweight',
  cue: 'catch your breath — cool-down coming up',
};
export const COOLDOWN_MOVES: Exercise[] = [
  { id: 'cd-ham', name: 'Hamstring stretch', category: 'lower', equipment: 'bodyweight', cue: 'each leg' },
  { id: 'cd-calf', name: 'Calf stretch', category: 'lower', equipment: 'bodyweight', cue: 'each leg' },
  { id: 'cd-behind', name: 'Arm behind your back', category: 'upper', equipment: 'bodyweight', cue: 'each arm' },
  { id: 'cd-across', name: 'Arm across your chest', category: 'upper', equipment: 'bodyweight', cue: 'each arm' },
];

export const CATEGORY_ORDER: Category[] = ['upper', 'lower', 'core'];

// Fixed bookend time — prep, warm-up, breather, cool-down — the same for
// every session. Round budgeting spends what's left of the target after this,
// so the target length covers the whole session, not just the work rounds.
export const OVERHEAD_SECS =
  PREP_SECS +
  WARMUP_MOVES.length * WARMUP_SECS +
  WARMUP_GAP_SECS +
  COOLDOWN_GAP_SECS +
  COOLDOWN_MOVES.length * COOLDOWN_SECS;

/** Exact wall-clock length of a session with this shape. */
export function sessionSecs(s: Settings, stations: number, rounds: number): number {
  return (
    OVERHEAD_SECS +
    rounds * (stations * s.workSecs + (stations - 1) * s.restSecs) +
    (rounds - 1) * s.roundRestSecs
  );
}

/** Distinct round layouts per session; rounds cycle through them evenly. */
export const DISTINCT_ROUNDS = 2;

/** Round count landing closest to the target for a given station count.
 * Always a multiple of DISTINCT_ROUNDS so every layout runs the same number
 * of times, and never fewer than 2 — a circuit repeats. */
export function fitRounds(s: Settings, stations: number): number {
  const target = s.totalMins * 60;
  const k = DISTINCT_ROUNDS;
  const start = k * Math.ceil(2 / k); // first multiple of k that is >= 2
  let best = start;
  for (let r = start + k; r <= 50; r += k) {
    if (Math.abs(sessionSecs(s, stations, r) - target) < Math.abs(sessionSecs(s, stations, best) - target)) best = r;
    else break; // duration grows with r — once the gap widens it never shrinks
  }
  return best;
}

/**
 * The stations × rounds shape for the target length. Stations always beat
 * rounds: the most stations whose fit lands within three minutes of the
 * target wins; only when nothing lands that close does closest duration
 * decide. Stations range 3–8, never fewer than the group count.
 */
export function fitSession(s: Settings): { stations: number; rounds: number } {
  const target = s.totalMins * 60;
  const minStations = Math.max(3, s.partner?.on ? s.partner.groups.length : 1);
  let best = { stations: minStations, rounds: fitRounds(s, minStations) };
  for (let st = minStations + 1; st <= 8; st++) {
    const cand = { stations: st, rounds: fitRounds(s, st) };
    const diff = Math.abs(sessionSecs(s, st, cand.rounds) - target);
    const bestDiff = Math.abs(sessionSecs(s, best.stations, best.rounds) - target);
    if (diff <= 180 || diff < bestDiff) best = cand;
  }
  return best;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * How many stations each category gets. No mix (or a degenerate all-zero one)
 * = even thirds; otherwise each category's share is its percentage of the mix
 * total. Largest-remainder rounding to whole stations.
 */
export function stationSplit(stations: number, focus?: FocusMix): Record<Category, number> {
  const weight = (c: Category) => Math.max(0, focus?.[c] ?? 0);
  const total = CATEGORY_ORDER.reduce((sum, c) => sum + weight(c), 0);
  const exact = CATEGORY_ORDER.map((c) => ({
    c,
    x: stations * (total > 0 ? weight(c) / total : 1 / CATEGORY_ORDER.length),
  }));
  const counts = Object.fromEntries(exact.map(({ c, x }) => [c, Math.floor(x)])) as Record<Category, number>;
  let left = stations - exact.reduce((sum, { x }) => sum + Math.floor(x), 0);
  const byRemainder = [...exact].sort((a, b) => (b.x % 1) - (a.x % 1));
  for (let i = 0; left > 0; i++, left--) counts[byRemainder[i % byRemainder.length].c]++;
  return counts;
}

/**
 * Set one category of the mix to `v`, keeping the total at exactly 100.
 * Dials the user has already set (`touched`, oldest first) are respected:
 * untouched categories rebalance proportionally into whatever the touched
 * ones don't claim, and touched ones only give way when that's impossible —
 * least recently set first.
 */
export function rebalanceMix(mix: FocusMix, cat: Category, v: number, touched: Category[]): FocusMix {
  const others = CATEGORY_ORDER.filter((c) => c !== cat);
  const untouched = others.filter((c) => !touched.includes(c));
  const next = { ...mix, [cat]: v };
  const rest = 100 - v;

  const claimed = others.reduce((sum, c) => (touched.includes(c) ? sum + mix[c] : sum), 0);
  const room = Math.max(0, rest - claimed);
  const oldSum = untouched.reduce((sum, c) => sum + mix[c], 0);
  let used = 0;
  untouched.forEach((c, i) => {
    next[c] =
      i === untouched.length - 1
        ? room - used
        : oldSum > 0
          ? Math.round((room * mix[c]) / oldSum)
          : Math.round(room / untouched.length);
    used += next[c];
  });

  // Whatever still doesn't balance lands on the touched dials, oldest first.
  let imbalance = rest - others.reduce((sum, c) => sum + next[c], 0);
  for (const c of touched.filter((c) => others.includes(c))) {
    if (imbalance === 0) break;
    const nv = Math.max(0, Math.min(100, next[c] + imbalance));
    imbalance -= nv - next[c];
    next[c] = nv;
  }
  return next;
}

/** The per-station category sequence for one round, interleaved. */
export function focusSlots(stations: number, focus?: FocusMix): Category[] {
  const remaining = stationSplit(stations, focus);
  const slots: Category[] = [];
  while (slots.length < stations) {
    for (const c of CATEGORY_ORDER) {
      if (slots.length < stations && remaining[c] > 0) {
        slots.push(c);
        remaining[c]--;
      }
    }
  }
  return slots;
}

export function pickStations(
  pool: Exercise[],
  count: number,
  rand: () => number = Math.random,
  /** Category per pick; unset picks cycle categories evenly. */
  slots?: Category[],
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
    // A slot whose category has no exercises falls back to the even cycle.
    const want = slots?.[picks.length];
    const cat = want && byCat.has(want) ? want : cats[ci % cats.length];
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
  const rounds = fitRounds(s, sets[0].length);
  const session: Session = [{ kind: 'prep', duration: PREP_SECS, round: 1, station: 0 }];
  for (const m of WARMUP_MOVES) {
    session.push({ kind: 'warmup', exercise: m, duration: WARMUP_SECS, round: 1, station: 0 });
  }
  // Breather between warm-up and the first station (a normal rest interval, so
  // it announces/previews the first exercise like any other rest).
  session.push({ kind: 'rest', exercise: sets[0][0], duration: WARMUP_GAP_SECS, round: 1, station: 0 });
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
  session.push({ kind: 'cooldown', exercise: COOLDOWN_GAP, duration: COOLDOWN_GAP_SECS, round: rounds, station: 0 });
  for (const m of COOLDOWN_MOVES) {
    session.push({ kind: 'cooldown', exercise: m, duration: COOLDOWN_SECS, round: rounds, station: 0 });
  }
  return session;
}

// Groups rotate on offset stations sharing one set of kit, so any window of
// `count` consecutive stations (the ones worked at the same moment) may hold at
// most one exercise per shared-equipment kind. Kinds are independent — the
// dumbbells and the medicine ball can run side by side, just not with
// themselves. Reorder the picks to space each kind `count` apart, swapping the
// surplus for pool bodyweight when a kind has more than floor(n/count) picks.
export function spaceEquipment(
  picks: Exercise[],
  pool: Exercise[],
  count: number,
  rand: () => number = Math.random,
): Exercise[] {
  const n = picks.length;
  const shared = (e: Exercise) => e.equipment !== 'bodyweight';
  if (count <= 1 || n === 0) return picks;

  const maxPerKind = Math.floor(n / count);
  const body = picks.filter((e) => !shared(e));
  const byKind = [...new Set(picks.filter(shared).map((e) => e.equipment))].map((k) =>
    picks.filter((e) => e.equipment === k),
  );

  // Only built if something actually has to be swapped out — it consumes `rand`.
  let spare: Exercise[] | null = null;
  for (const kind of byKind) {
    while (kind.length > maxPerKind) {
      spare ??= shuffle(
        pool.filter((e) => !shared(e) && e.pref !== 'ban' && !picks.some((p) => p.id === e.id)),
        rand,
      );
      if (spare.length === 0) break;
      const dropped = kind.pop()!;
      const i = spare.findIndex((e) => e.category === dropped.category);
      body.push(spare.splice(i >= 0 ? i : 0, 1)[0]);
    }
    // ponytail: if the pool lacks enough bodyweight moves we keep the leftovers
    // and just space them as evenly as n allows below.
  }

  // Biggest kind first — it has the least room to fit around the others.
  byKind.sort((a, b) => b.length - a.length);
  const slots: (Exercise | null)[] = new Array(n).fill(null);
  for (const kind of byKind) {
    let last = -count; // leaves slot 0 available to the first pick
    for (const e of kind) {
      let i = slots.findIndex((s, idx) => s === null && idx >= last + count);
      if (i < 0) i = slots.indexOf(null); // too tight to space: best effort
      slots[i] = e;
      last = i;
    }
  }
  let bi = 0;
  for (let i = 0; i < n; i++) if (slots[i] === null) slots[i] = body[bi++];
  return slots as Exercise[];
}

// Build `numSets` distinct station sets by picking them all in one balanced
// pass, then slicing — consecutive slices draw different exercises per category,
// so the rounds vary. Each set is equipment-spaced independently.
export function pickRoundSets(
  pool: Exercise[],
  stationsPerRound: number,
  numSets: number,
  count: number,
  rand: () => number = Math.random,
  focus?: FocusMix,
): Exercise[][] {
  // Same category quota every round: repeat one round's slot list per set.
  const slots = Array.from({ length: numSets }, () => focusSlots(stationsPerRound, focus)).flat();
  const all = pickStations(pool, stationsPerRound * numSets, rand, slots);
  return Array.from({ length: numSets }, (_, k) =>
    spaceEquipment(all.slice(k * stationsPerRound, (k + 1) * stationsPerRound), pool, count, rand),
  );
}

export function generateSession(
  pool: Exercise[],
  s: Settings,
  rand: () => number = Math.random,
): Session {
  const count = s.partner?.on ? s.partner.groups.length : 1;
  // Station count and rounds both come from the target length now.
  const { stations, rounds } = fitSession(s);
  const numSets = Math.min(DISTINCT_ROUNDS, rounds);
  // Focus shapes the work stations only — warm-up and cool-down stay full-body.
  return buildSession(pickRoundSets(pool, stations, numSets, count, rand, s.focus), s);
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

// Groups hold at most two people and there are at most four groups; membership
// reshuffles automatically as people join and leave.
export const MAX_GROUP_SIZE = 2;
export const MAX_GROUPS = 4;

/** Normalise groups: split oversized ones into pairs (order-preserving, never
 * merging existing groups), drop empties, cap at MAX_GROUPS (overflow members
 * fall to the bench). */
export function packGroups(groups: string[][]): string[][] {
  return groups
    .flatMap((g) => Array.from({ length: Math.ceil(g.length / MAX_GROUP_SIZE) }, (_, i) => g.slice(i * MAX_GROUP_SIZE, (i + 1) * MAX_GROUP_SIZE)))
    .filter((g) => g.length > 0)
    .slice(0, MAX_GROUPS);
}

/** Add a person to the first group with a free slot, or a new group; unchanged
 * when every group is full and MAX_GROUPS is reached. */
export function placeInGroups(groups: string[][], person: string): string[][] {
  const slot = groups.findIndex((g) => g.length < MAX_GROUP_SIZE);
  if (slot >= 0) return groups.map((g, i) => (i === slot ? [...g, person] : g));
  return groups.length < MAX_GROUPS ? [...groups, [person]] : groups;
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
