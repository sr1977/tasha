# Tasha Circuit Training Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A desktop browser app that generates a ~45-minute circuit training session from an editable exercise pool and runs it with a large countdown timer, audio cues, and pause/skip controls.

**Architecture:** Vite + React + TypeScript SPA, no backend. Pure modules (`generator.ts`, `timer.ts`) hold all logic and are unit-tested with Vitest; three React components (`Setup`, `Pool`, `Workout`) are thin views. Persistence via localStorage.

**Tech Stack:** Vite, React 18+, TypeScript, Vitest. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-tasha-circuit-timer-design.md`

## Global Constraints

- No runtime dependencies beyond React; dev dependencies beyond the Vite template limited to `vitest`.
- Tests live in `tests/` (user rule: never colocate `*.test.ts` next to source).
- localStorage keys: `tasha.pool`, `tasha.settings`. Corrupt/missing values fall back to defaults.
- Default settings: work 40s, rest 20s, 6 stations, round rest 60s, target 45 min. Prep interval 10s.
- Commit messages: plain conventional style. **NEVER add Co-authored-by or any AI attribution** (user rule).
- Work on branch `feature/circuit-timer`.
- All logic (generation, timer state) must be pure and unit-tested; UI is verified manually in the browser.

---

### Task 1: Project scaffold

**Files:**
- Create: entire Vite react-ts template at repo root, `vite.config.ts` (modified), `package.json` (modified)
- Delete: template boilerplate `src/App.css`, `src/assets/`, `public/vite.svg`

**Interfaces:**
- Produces: a running dev server (`npm run dev`), a working test runner (`npm test`), `src/main.tsx` rendering `src/App.tsx`, global stylesheet `src/index.css`.

- [ ] **Step 1: Create branch and scaffold**

```bash
cd /Users/steverisdon/workspace/tasha
git checkout -b feature/circuit-timer
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest
```

Note: `npm create vite` may warn the directory is non-empty (docs/, .git) — choose "Ignore files and continue" if prompted.

- [ ] **Step 2: Configure Vitest and test script**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node' },
});
```

In `package.json` scripts, add:

```json
"test": "vitest run"
```

- [ ] **Step 3: Strip boilerplate**

Delete `src/App.css`, `src/assets/`, `public/vite.svg`. Replace `src/App.tsx` with:

```tsx
export default function App() {
  return <h1>Tasha</h1>;
}
```

In `src/main.tsx`, remove any import of `App.css` if present (keep `index.css`). Empty out `src/index.css` (Task 5 fills it). In `index.html`, set `<title>Tasha</title>` and remove the vite.svg icon link.

- [ ] **Step 4: Verify build and test runner**

```bash
npm run build
npx vitest run --passWithNoTests
```

Expected: build succeeds; vitest exits 0 with "No test files found".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS app with Vitest"
```

---

### Task 2: Types, seed pool, storage

**Files:**
- Create: `src/types.ts`, `src/seed.ts`, `src/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Category`, `Equipment`, `Exercise`, `Settings`, `DEFAULT_SETTINGS`, `IntervalKind`, `SessionInterval`, `Session` (exact shapes below).
  - `seed.ts`: `SEED_POOL: Exercise[]` (24 exercises).
  - `storage.ts`: `loadPool(): Exercise[]`, `savePool(pool: Exercise[]): void`, `loadSettings(): Settings`, `saveSettings(s: Settings): void`.

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type Category = 'upper' | 'lower' | 'core' | 'cardio';
export type Equipment = 'bodyweight' | 'dumbbells';

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  equipment: Equipment;
}

export interface Settings {
  workSecs: number;
  restSecs: number;
  stations: number;
  roundRestSecs: number;
  totalMins: number;
}

export const DEFAULT_SETTINGS: Settings = {
  workSecs: 40,
  restSecs: 20,
  stations: 6,
  roundRestSecs: 60,
  totalMins: 45,
};

export type IntervalKind = 'prep' | 'work' | 'rest' | 'roundRest';

export interface SessionInterval {
  kind: IntervalKind;
  /** The exercise to do (work) or the upcoming exercise (rest/roundRest). */
  exercise?: Exercise;
  duration: number; // seconds
  round: number; // 1-based
  station: number; // 1-based; 0 for prep/roundRest
}

export type Session = SessionInterval[];
```

- [ ] **Step 2: Write `src/seed.ts`**

```ts
import type { Category, Equipment, Exercise } from './types';

const raw: [string, Category, Equipment][] = [
  ['Push-ups', 'upper', 'bodyweight'],
  ['Pike push-ups', 'upper', 'bodyweight'],
  ['Tricep dips', 'upper', 'bodyweight'],
  ['Inchworms', 'upper', 'bodyweight'],
  ['Shoulder press', 'upper', 'dumbbells'],
  ['Bent-over rows', 'upper', 'dumbbells'],
  ['Chest press', 'upper', 'dumbbells'],
  ['Bicep curls', 'upper', 'dumbbells'],
  ['Squats', 'lower', 'bodyweight'],
  ['Lunges', 'lower', 'bodyweight'],
  ['Glute bridges', 'lower', 'bodyweight'],
  ['Wall sit', 'lower', 'bodyweight'],
  ['Goblet squats', 'lower', 'dumbbells'],
  ['Dumbbell deadlifts', 'lower', 'dumbbells'],
  ['Weighted step-ups', 'lower', 'dumbbells'],
  ['Plank', 'core', 'bodyweight'],
  ['Sit-ups', 'core', 'bodyweight'],
  ['Russian twists', 'core', 'bodyweight'],
  ['Leg raises', 'core', 'bodyweight'],
  ['Bicycle crunches', 'core', 'bodyweight'],
  ['Burpees', 'cardio', 'bodyweight'],
  ['Mountain climbers', 'cardio', 'bodyweight'],
  ['High knees', 'cardio', 'bodyweight'],
  ['Jumping jacks', 'cardio', 'bodyweight'],
];

export const SEED_POOL: Exercise[] = raw.map(([name, category, equipment], i) => ({
  id: `seed-${i}`,
  name,
  category,
  equipment,
}));
```

- [ ] **Step 3: Write the failing test `tests/storage.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

import { loadPool, loadSettings, savePool, saveSettings } from '../src/storage';
import { SEED_POOL } from '../src/seed';
import { DEFAULT_SETTINGS } from '../src/types';

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
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL — cannot resolve `../src/storage`.

- [ ] **Step 5: Write `src/storage.ts`**

```ts
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
  return load(POOL_KEY, SEED_POOL);
}

export function savePool(pool: Exercise[]): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/seed.ts src/storage.ts tests/storage.test.ts
git commit -m "feat: add data types, seed exercise pool, localStorage persistence"
```

---

### Task 3: Session generator

**Files:**
- Create: `src/generator.ts`
- Test: `tests/generator.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `Session`, `Settings`, `Category` from `src/types.ts`.
- Produces (all exported from `src/generator.ts`):
  - `PREP_SECS = 10`
  - `roundCount(s: Settings): number`
  - `pickStations(pool: Exercise[], count: number, rand?: () => number): Exercise[]` — throws `Error('empty pool')` on empty pool
  - `buildSession(stations: Exercise[], s: Settings): Session`
  - `generateSession(pool: Exercise[], s: Settings, rand?: () => number): Session`
  - `sessionDuration(session: Session): number` — total seconds

- [ ] **Step 1: Write the failing test `tests/generator.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/generator.test.ts`
Expected: FAIL — cannot resolve `../src/generator`.

- [ ] **Step 3: Write `src/generator.ts`**

```ts
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
  const byCat = new Map<Category, Exercise[]>();
  for (const cat of CATEGORY_ORDER) {
    const items = shuffle(pool.filter((e) => e.category === cat), rand);
    if (items.length > 0) byCat.set(cat, items);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/generator.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/generator.ts tests/generator.test.ts
git commit -m "feat: add category-balanced circuit session generator"
```

---

### Task 4: Timer reducer

**Files:**
- Create: `src/timer.ts`
- Test: `tests/timer.test.ts`

**Interfaces:**
- Consumes: `Session` from `src/types.ts`.
- Produces (all exported from `src/timer.ts`):
  - `interface TimerState { session: Session; index: number; remainingMs: number; status: 'running' | 'paused' | 'done' }`
  - `type TimerAction = { type: 'tick'; elapsedMs: number } | { type: 'pause' } | { type: 'resume' } | { type: 'next' } | { type: 'prev' }`
  - `initTimer(session: Session): TimerState`
  - `timerReducer(state: TimerState, action: TimerAction): TimerState`

- [ ] **Step 1: Write the failing test `tests/timer.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { initTimer, timerReducer, type TimerState } from '../src/timer';
import type { Session } from '../src/types';

const session: Session = [
  { kind: 'prep', duration: 2, round: 1, station: 0 },
  { kind: 'work', duration: 5, round: 1, station: 1 },
  { kind: 'rest', duration: 3, round: 1, station: 1 },
];

const tick = (s: TimerState, ms: number) => timerReducer(s, { type: 'tick', elapsedMs: ms });

describe('timer', () => {
  it('initialises at the first interval, running', () => {
    expect(initTimer(session)).toEqual({ session, index: 0, remainingMs: 2000, status: 'running' });
  });

  it('tick reduces remaining time', () => {
    expect(tick(initTimer(session), 500).remainingMs).toBe(1500);
  });

  it('tick crossing a boundary advances and carries overflow', () => {
    const s = tick(initTimer(session), 2500);
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(4500);
  });

  it('tick past the final interval finishes the session', () => {
    const atLast: TimerState = { session, index: 2, remainingMs: 1000, status: 'running' };
    const s = tick(atLast, 1500);
    expect(s.status).toBe('done');
    expect(s.remainingMs).toBe(0);
  });

  it('pause freezes ticks; resume unfreezes', () => {
    const paused = timerReducer(initTimer(session), { type: 'pause' });
    expect(paused.status).toBe('paused');
    expect(tick(paused, 1000)).toEqual(paused);
    const resumed = timerReducer(paused, { type: 'resume' });
    expect(resumed.status).toBe('running');
    expect(tick(resumed, 1000).remainingMs).toBe(1000);
  });

  it('next jumps to the following interval at full duration', () => {
    const s = timerReducer(initTimer(session), { type: 'next' });
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(5000);
  });

  it('next on the last interval finishes the session', () => {
    const atLast: TimerState = { session, index: 2, remainingMs: 1000, status: 'running' };
    expect(timerReducer(atLast, { type: 'next' }).status).toBe('done');
  });

  it('prev restarts the current interval when >2s elapsed', () => {
    const mid: TimerState = { session, index: 1, remainingMs: 2500, status: 'running' }; // 2.5s elapsed
    const s = timerReducer(mid, { type: 'prev' });
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(5000);
  });

  it('prev goes to the previous interval when <2s elapsed', () => {
    const early: TimerState = { session, index: 1, remainingMs: 4500, status: 'running' }; // 0.5s elapsed
    const s = timerReducer(early, { type: 'prev' });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(2000);
  });

  it('prev at the first interval restarts it', () => {
    const s = timerReducer(tick(initTimer(session), 1500), { type: 'prev' });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(2000);
  });

  it('done state ignores further actions', () => {
    const done: TimerState = { session, index: 2, remainingMs: 0, status: 'done' };
    expect(timerReducer(done, { type: 'next' })).toEqual(done);
    expect(timerReducer(done, { type: 'prev' })).toEqual(done);
    expect(tick(done, 1000)).toEqual(done);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/timer.test.ts`
Expected: FAIL — cannot resolve `../src/timer`.

- [ ] **Step 3: Write `src/timer.ts`**

```ts
import type { Session } from './types';

export interface TimerState {
  session: Session;
  index: number;
  remainingMs: number;
  status: 'running' | 'paused' | 'done';
}

export type TimerAction =
  | { type: 'tick'; elapsedMs: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'prev' };

export function initTimer(session: Session): TimerState {
  return { session, index: 0, remainingMs: session[0].duration * 1000, status: 'running' };
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  const { session, index } = state;
  const durMs = (i: number) => session[i].duration * 1000;

  switch (action.type) {
    case 'pause':
      return state.status === 'running' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'running' } : state;
    case 'next': {
      if (state.status === 'done') return state;
      if (index + 1 >= session.length) return { ...state, remainingMs: 0, status: 'done' };
      return { ...state, index: index + 1, remainingMs: durMs(index + 1) };
    }
    case 'prev': {
      if (state.status === 'done') return state;
      const elapsed = durMs(index) - state.remainingMs;
      if (elapsed > 2000 || index === 0) return { ...state, remainingMs: durMs(index) };
      return { ...state, index: index - 1, remainingMs: durMs(index - 1) };
    }
    case 'tick': {
      if (state.status !== 'running') return state;
      let remaining = state.remainingMs - action.elapsedMs;
      let i = index;
      while (remaining <= 0) {
        if (i + 1 >= session.length) return { ...state, index: i, remainingMs: 0, status: 'done' };
        i++;
        remaining += durMs(i);
      }
      return { ...state, index: i, remainingMs: remaining };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/timer.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/timer.ts tests/timer.test.ts
git commit -m "feat: add drift-free timer reducer with pause and skip"
```

---

### Task 5: Audio module and global styles

**Files:**
- Create: `src/audio.ts`
- Modify: `src/index.css` (full replacement)

**Interfaces:**
- Produces (from `src/audio.ts`): `initAudio(): void` (create/resume AudioContext — must be called from a user gesture), `beep(): void` (short 880Hz countdown beep), `transitionTone(): void` (longer 1320Hz tone), `speak(text: string): void` (speech synthesis, silently no-ops if unavailable).
- Produces (from `src/index.css`): class names used by later tasks — `.app`, `.warn`, `.settings-grid`, `.stations`, `.start`, `.add-row`, `.filters`, `.pool-list`, `.workout` (with kind modifiers `.prep`, `.work`, `.rest`, `.roundRest`, `.paused`, `.done`), `.meta`, `.label`, `.clock`, `.next`, `.controls`, `.exit`.

No unit tests — this file is a thin wrapper over browser APIs (Web Audio, speechSynthesis); it is exercised manually in Task 8's verification.

- [ ] **Step 1: Write `src/audio.ts`**

```ts
let ctx: AudioContext | null = null;

export function initAudio(): void {
  try {
    ctx = ctx ?? new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, ms: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
  osc.start();
  osc.stop(ctx.currentTime + ms / 1000);
}

export function beep(): void {
  tone(880, 150);
}

export function transitionTone(): void {
  tone(1320, 400);
}

export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // voice unavailable -> beeps only
  }
}
```

- [ ] **Step 2: Replace `src/index.css`**

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #14161a;
  color: #e8e8e8;
}

button {
  font: inherit;
  cursor: pointer;
  background: #2a2e35;
  color: inherit;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 0.4rem 0.9rem;
}
button:disabled { opacity: 0.5; cursor: default; }
input, select {
  font: inherit;
  background: #1d2025;
  color: inherit;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
}

/* ---- app shell ---- */
.app { max-width: 640px; margin: 0 auto; padding: 1.5rem; }
.app nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.warn { color: #f0b429; }

/* ---- setup ---- */
.settings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
.settings-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; color: #aaa; }
.settings-grid input { width: 6rem; }
.stations { padding-left: 1.5rem; }
.stations li { margin: 0.35rem 0; }
.stations small { color: #888; }
.start {
  display: block;
  margin-top: 1rem;
  font-size: 1.3rem;
  padding: 0.8rem 2rem;
  background: #2f7d4f;
  border-color: #2f7d4f;
}

/* ---- pool ---- */
.add-row, .filters { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
.filters { color: #aaa; font-size: 0.9rem; }
.pool-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.pool-list li { display: flex; gap: 0.5rem; align-items: center; }
.pool-list input { flex: 1; }

/* ---- workout ---- */
.workout {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
  transition: background 0.3s;
}
.workout.prep { background: #7a5c12; }
.workout.work { background: #1e5c38; }
.workout.rest { background: #1d4568; }
.workout.roundRest { background: #4a3670; }
.workout.paused { filter: grayscale(0.7) brightness(0.7); }
.workout.done { background: #14161a; }
.workout .meta { font-size: 1.4rem; color: rgba(255, 255, 255, 0.75); }
.workout .label { font-size: clamp(2rem, 7vw, 4.5rem); font-weight: 700; line-height: 1.1; }
.workout .clock {
  font-size: clamp(6rem, 28vw, 18rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.workout .next { font-size: 1.6rem; color: rgba(255, 255, 255, 0.85); }
.workout .controls { display: flex; gap: 1rem; }
.workout .controls button { font-size: 2rem; padding: 0.6rem 1.6rem; background: rgba(0, 0, 0, 0.3); }
.workout .exit { position: absolute; top: 1rem; right: 1rem; background: rgba(0, 0, 0, 0.3); }
progress { width: min(80vw, 600px); height: 8px; }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/audio.ts src/index.css
git commit -m "feat: add beep/speech audio module and global styles"
```

---

### Task 6: App shell and Pool screen

**Files:**
- Create: `src/components/Pool.tsx`
- Modify: `src/App.tsx` (full replacement)

**Interfaces:**
- Consumes: `loadPool`, `savePool`, `loadSettings`, `saveSettings` from `src/storage.ts`; types from `src/types.ts`; `initAudio` from `src/audio.ts`.
- Produces:
  - `Pool` component: `({ pool, setPool }: { pool: Exercise[]; setPool: (p: Exercise[]) => void })`.
  - `App` renders `Setup` and `Workout` (created in Tasks 7–8). **Until those exist, App uses inline placeholders — this task's App.tsx below compiles standalone; Tasks 7 and 8 replace the placeholders with real imports.**

- [ ] **Step 1: Write `src/components/Pool.tsx`**

```tsx
import { useState } from 'react';
import type { Category, Equipment, Exercise } from '../types';

const CATEGORIES: Category[] = ['upper', 'lower', 'core', 'cardio'];
const EQUIPMENT: Equipment[] = ['bodyweight', 'dumbbells'];

export function Pool({ pool, setPool }: { pool: Exercise[]; setPool: (p: Exercise[]) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('upper');
  const [equipment, setEquipment] = useState<Equipment>('bodyweight');
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all');
  const [eqFilter, setEqFilter] = useState<Equipment | 'all'>('all');

  const update = (id: string, patch: Partial<Exercise>) =>
    setPool(pool.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const add = () => {
    if (!name.trim()) return;
    setPool([...pool, { id: crypto.randomUUID(), name: name.trim(), category, equipment }]);
    setName('');
  };

  const shown = pool.filter(
    (e) =>
      (catFilter === 'all' || e.category === catFilter) &&
      (eqFilter === 'all' || e.equipment === eqFilter),
  );

  return (
    <section>
      <h2>Exercise pool ({pool.length})</h2>
      <div className="add-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New exercise name"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENT.map((q) => <option key={q}>{q}</option>)}
        </select>
        <button onClick={add}>Add</button>
      </div>
      <div className="filters">
        Filter:
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as Category | 'all')}>
          <option value="all">all categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={eqFilter} onChange={(e) => setEqFilter(e.target.value as Equipment | 'all')}>
          <option value="all">all equipment</option>
          {EQUIPMENT.map((q) => <option key={q}>{q}</option>)}
        </select>
      </div>
      <ul className="pool-list">
        {shown.map((e) => (
          <li key={e.id}>
            <input value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })} />
            <select
              value={e.category}
              onChange={(ev) => update(e.id, { category: ev.target.value as Category })}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select
              value={e.equipment}
              onChange={(ev) => update(e.id, { equipment: ev.target.value as Equipment })}
            >
              {EQUIPMENT.map((q) => <option key={q}>{q}</option>)}
            </select>
            <button onClick={() => setPool(pool.filter((x) => x.id !== e.id))} title="Delete">✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useState } from 'react';
import type { Exercise, Session, Settings } from './types';
import { loadPool, loadSettings, savePool, saveSettings } from './storage';
import { initAudio } from './audio';
import { Pool } from './components/Pool';

// Placeholders — replaced by real components in Tasks 7 and 8.
const Setup = (_props: Record<string, unknown>) => <p>Setup coming in Task 7</p>;
const Workout = (_props: Record<string, unknown>) => <p>Workout coming in Task 8</p>;

type Screen = 'setup' | 'pool' | 'workout';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [pool, setPoolState] = useState<Exercise[]>(loadPool);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Session | null>(null);

  const setPool = (p: Exercise[]) => {
    setPoolState(p);
    savePool(p);
  };
  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
    setSession(null); // settings changed -> stale session invalidated
  };

  if (screen === 'workout' && session) {
    return <Workout session={session} onExit={() => setScreen('setup')} />;
  }

  return (
    <div className="app">
      <nav>
        <button onClick={() => setScreen('setup')} disabled={screen === 'setup'}>Session</button>
        <button onClick={() => setScreen('pool')} disabled={screen === 'pool'}>Exercises</button>
      </nav>
      {screen === 'setup' ? (
        <Setup
          pool={pool}
          settings={settings}
          setSettings={setSettings}
          session={session}
          setSession={setSession}
          onStart={() => {
            initAudio();
            setScreen('workout');
          }}
          goToPool={() => setScreen('pool')}
        />
      ) : (
        <Pool pool={pool} setPool={setPool} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev` and open the printed URL.
Expected: nav with Session/Exercises buttons. Exercises screen lists 24 seeded exercises; adding, renaming, re-categorising, filtering, and deleting all work; a reload preserves changes (localStorage).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Pool.tsx
git commit -m "feat: add app shell and exercise pool screen"
```

---

### Task 7: Setup screen

**Files:**
- Create: `src/components/Setup.tsx`
- Modify: `src/App.tsx` (swap Setup placeholder for the real import)

**Interfaces:**
- Consumes: `generateSession`, `buildSession`, `roundCount`, `sessionDuration` from `src/generator.ts`; types from `src/types.ts`.
- Produces: `Setup` component with props `{ pool: Exercise[]; settings: Settings; setSettings: (s: Settings) => void; session: Session | null; setSession: (s: Session | null) => void; onStart: () => void; goToPool: () => void }`. Also exports `fmt(secs: number): string` ("m:ss") used by Task 8.

- [ ] **Step 1: Write `src/components/Setup.tsx`**

```tsx
import type { Exercise, Session, Settings } from '../types';
import { buildSession, generateSession, roundCount, sessionDuration } from '../generator';

export const fmt = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.round(secs) % 60).padStart(2, '0')}`;

interface Props {
  pool: Exercise[];
  settings: Settings;
  setSettings: (s: Settings) => void;
  session: Session | null;
  setSession: (s: Session | null) => void;
  onStart: () => void;
  goToPool: () => void;
}

export function Setup({ pool, settings, setSettings, session, setSession, onStart, goToPool }: Props) {
  const stations =
    session?.filter((iv) => iv.kind === 'work' && iv.round === 1).map((iv) => iv.exercise!) ?? null;

  const swap = (i: number) => {
    if (!stations) return;
    const current = stations[i];
    const usedIds = new Set(stations.map((s) => s.id));
    const sameCat = pool.filter((e) => e.category === current.category && !usedIds.has(e.id));
    const candidates = sameCat.length > 0 ? sameCat : pool.filter((e) => !usedIds.has(e.id));
    if (candidates.length === 0) return;
    const next = [...stations];
    next[i] = candidates[Math.floor(Math.random() * candidates.length)];
    setSession(buildSession(next, settings));
  };

  const num = (key: keyof Settings, label: string, min: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={settings[key]}
        onChange={(e) => setSettings({ ...settings, [key]: Math.max(min, Number(e.target.value) || min) })}
      />
    </label>
  );

  return (
    <section>
      <h2>Session</h2>
      <div className="settings-grid">
        {num('workSecs', 'Work (seconds)', 5)}
        {num('restSecs', 'Rest (seconds)', 0)}
        {num('stations', 'Stations', 1)}
        {num('roundRestSecs', 'Round rest (seconds)', 0)}
        {num('totalMins', 'Target length (minutes)', 5)}
      </div>
      {pool.length === 0 ? (
        <p className="warn">
          Your exercise pool is empty. <button onClick={goToPool}>Add exercises</button>
        </p>
      ) : (
        <>
          {pool.length < settings.stations && (
            <p className="warn">
              Only {pool.length} exercises for {settings.stations} stations — some will repeat.
            </p>
          )}
          <button onClick={() => setSession(generateSession(pool, settings))}>
            {session ? 'Regenerate' : 'Generate session'}
          </button>
        </>
      )}
      {session && stations && (
        <>
          <p>
            {roundCount(settings)} rounds · actual duration {fmt(sessionDuration(session))}
          </p>
          <ol className="stations">
            {stations.map((s, i) => (
              <li key={`${s.id}-${i}`}>
                {s.name} <small>({s.category})</small>{' '}
                <button onClick={() => swap(i)} title="Swap this station">↻</button>
              </li>
            ))}
          </ol>
          <button className="start" onClick={onStart}>Start workout ▶</button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into `src/App.tsx`**

Delete the `const Setup = ...` placeholder line and add:

```tsx
import { Setup } from './components/Setup';
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`.
Expected: settings grid shows defaults (40/20/6/60/45). Generate produces 6 stations spread across categories, shows "6 rounds · actual duration 39:10". Regenerate reshuffles; per-station ↻ swaps just that station (same category when possible). Changing any setting clears the generated session. Setting stations to 30 shows the repeat warning and still generates.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Setup.tsx
git commit -m "feat: add session setup screen with generation and station swap"
```

---

### Task 8: Workout screen

**Files:**
- Create: `src/components/Workout.tsx`
- Modify: `src/App.tsx` (swap Workout placeholder for the real import)

**Interfaces:**
- Consumes: `initTimer`, `timerReducer`, `TimerState` from `src/timer.ts`; `beep`, `transitionTone`, `speak` from `src/audio.ts`; `sessionDuration` from `src/generator.ts`; `fmt` from `src/components/Setup.tsx`; `Session` from `src/types.ts`.
- Produces: `Workout` component with props `{ session: Session; onExit: () => void }`.

- [ ] **Step 1: Write `src/components/Workout.tsx`**

```tsx
import { useEffect, useReducer, useRef } from 'react';
import type { Session } from '../types';
import { initTimer, timerReducer, type TimerState } from '../timer';
import { beep, speak, transitionTone } from '../audio';
import { sessionDuration } from '../generator';
import { fmt } from './Setup';

function announce(state: TimerState): void {
  const iv = state.session[state.index];
  if (iv.kind === 'work') speak(`${iv.exercise!.name}. Go!`);
  else if (iv.kind === 'rest') speak(`Rest. Next up: ${iv.exercise!.name}`);
  else if (iv.kind === 'roundRest') speak(`Round ${iv.round + 1} coming up`);
}

export function Workout({ session, onExit }: { session: Session; onExit: () => void }) {
  const [state, dispatch] = useReducer(timerReducer, session, initTimer);

  // Drift-free ticking: measure real elapsed time between ticks.
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', elapsedMs: now - last });
      last = now;
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Keep the screen awake during the workout.
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  // Keyboard: space = pause/resume, arrows = skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: state.status === 'paused' ? 'resume' : 'pause' });
      } else if (e.code === 'ArrowRight') dispatch({ type: 'next' });
      else if (e.code === 'ArrowLeft') dispatch({ type: 'prev' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status]);

  // Audio cues: transition tone + announcement on interval change,
  // countdown beeps at 3/2/1, completion announcement.
  const secsLeft = Math.ceil(state.remainingMs / 1000);
  const prevIndex = useRef(state.index);
  const prevSecs = useRef(secsLeft);
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (state.status === 'done') {
      if (prevStatus.current !== 'done') {
        transitionTone();
        speak('Session complete. Well done!');
        prevStatus.current = 'done';
      }
      return;
    }
    prevStatus.current = state.status;
    if (state.index !== prevIndex.current) {
      prevIndex.current = state.index;
      prevSecs.current = secsLeft;
      transitionTone();
      announce(state);
      return;
    }
    if (secsLeft !== prevSecs.current) {
      prevSecs.current = secsLeft;
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) beep();
    }
  });

  if (state.status === 'done') {
    return (
      <div className="workout done">
        <div className="label">Session complete 🎉</div>
        <p className="meta">
          {session[session.length - 1].round} rounds · {fmt(sessionDuration(session))}
        </p>
        <button onClick={onExit}>Back to setup</button>
      </div>
    );
  }

  const iv = state.session[state.index];
  const stationsPerRound = Math.max(...session.map((i) => i.station));
  const total = sessionDuration(session);
  const elapsed =
    session.slice(0, state.index).reduce((t, i) => t + i.duration, 0) +
    (iv.duration - state.remainingMs / 1000);

  return (
    <div className={`workout ${iv.kind}${state.status === 'paused' ? ' paused' : ''}`}>
      <button className="exit" onClick={onExit}>Exit</button>
      <div className="meta">
        Round {iv.round}
        {iv.kind === 'work' && ` · Station ${iv.station}/${stationsPerRound}`}
        {state.status === 'paused' && ' · PAUSED'}
      </div>
      <div className="label">
        {iv.kind === 'work' ? iv.exercise!.name : iv.kind === 'prep' ? 'Get ready' : 'Rest'}
      </div>
      <div className="clock">{secsLeft >= 60 ? fmt(secsLeft) : secsLeft}</div>
      {iv.kind !== 'work' && iv.exercise && <div className="next">Next: {iv.exercise.name}</div>}
      <div className="controls">
        <button onClick={() => dispatch({ type: 'prev' })} title="Back (←)">⏮</button>
        <button
          onClick={() => dispatch({ type: state.status === 'paused' ? 'resume' : 'pause' })}
          title="Pause/resume (space)"
        >
          {state.status === 'paused' ? '▶' : '⏸'}
        </button>
        <button onClick={() => dispatch({ type: 'next' })} title="Skip (→)">⏭</button>
      </div>
      <progress value={elapsed} max={total} />
    </div>
  );
}
```

- [ ] **Step 2: Wire into `src/App.tsx`**

Delete the `const Workout = ...` placeholder line and add:

```tsx
import { Workout } from './components/Workout';
```

- [ ] **Step 3: Run the full test suite and build**

```bash
npm test
npm run build
```

Expected: all tests pass; build succeeds with no TS errors.

- [ ] **Step 4: Manual verification (full session flow)**

Run `npm run dev`, then set Work=5s, Rest=3s, Stations=2, Round rest=5s, Target=5min for a quick run-through. Generate, Start, and verify:

1. 10s amber "Get ready" prep, then green work interval with exercise name spoken ("… Go!").
2. Beeps at 3-2-1 of every interval; higher tone on each transition.
3. Blue rest shows "Next: <exercise>" and speaks it; purple round rest announces the next round.
4. Huge countdown digits; background color per interval kind.
5. Pause (button and space) freezes and greys the screen; resume continues from where it left off.
6. ⏭/→ skips forward; ⏮/← restarts the current interval when >2s in, otherwise jumps back one.
7. Progress bar advances; round/station indicator correct.
8. Completion screen appears with "Session complete" spoken; Back to setup works.
9. Exit button works mid-session.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Workout.tsx
git commit -m "feat: add workout screen with countdown, audio cues, and controls"
```

---

### Task 9: Full 45-minute defaults sanity check and wrap-up

**Files:**
- None created; verification only.

- [ ] **Step 1: Verify with real defaults**

Reset settings to defaults (40/20/6/60/45) in the UI, generate, confirm "6 rounds · actual duration 39:10", start, let it run ~2 intervals, skip through a full round with →, confirm round rest appears between rounds.

- [ ] **Step 2: Run everything one last time**

```bash
npm test && npm run build
```

Expected: all green.

- [ ] **Step 3: Commit any stragglers and stop**

```bash
git status
```

Expected: clean tree. Implementation complete — use superpowers:finishing-a-development-branch to decide merge/next steps.
