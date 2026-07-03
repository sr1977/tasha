# Preferences, Cues, Voice, Cool-down, Partner Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five additions to Tasha: exercise favourites/bans steering the generator (with mid-workout ban+swap), per-exercise form cues (shown + spoken), voice control on the workout screen, an optional Spotify cool-down playlist on completion, and offset-stations partner mode.

**Architecture:** All decision logic stays in pure modules (`generator.ts`, `timer.ts`, new `voice.ts` parser) with unit tests; components stay thin. Voice recognition pauses while the app's own speech synthesis talks (self-hearing guard) via a listener hook in `audio.ts`. Partner mode is purely a display/announcement layer over the unchanged session structure.

**Tech Stack:** Existing Vite + React + TS + Vitest. Web Speech API (SpeechRecognition) — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-prefs-cues-voice-cooldown-partner-design.md`

## Global Constraints

- No new npm dependencies.
- `Exercise` gains optional `pref?: 'fav' | 'ban'` and `cue?: string`; `Settings` gains optional `partner?: { on: boolean; names: [string, string] }`. Old localStorage data must keep parsing (fields optional).
- Banned exercises never picked; if ALL are banned, ignore bans (generation must not fail). Favourites ≈2× pick odds (double entry in category shuffle).
- Voice commands: "next track" (checked first), "pause", "resume"/"go" (word-boundary), "skip", "back". Recognition muted while speech synthesis is speaking. Two recognition errors → voice off for the workout. Toggle persisted at localStorage `tasha.voice` ('0'/'1', default on).
- Cool-down playlist id at `tasha.spotify.cooldown` (absent = off). On done: play cool-down at DIP_VOLUME; otherwise pause (current behaviour).
- Partner offset: at station i of N, partner 1 does `stations[i-1]`, partner 2 does `stations[i % N]`. Announcements in partner mode omit cues.
- Silent/console.warn-only failure for voice + Spotify paths; timer never affected.
- Tests in `tests/`. Commits: plain conventional style, **NEVER any AI attribution**. Branch: `feature/prefs-voice-partner`.

---

### Task 1: Data model + pure logic (generator, timer, seed cues)

**Files:**
- Modify: `src/types.ts`, `src/seed.ts`, `src/generator.ts`, `src/timer.ts`
- Test: `tests/generator.test.ts` (append), `tests/timer.test.ts` (append)

**Interfaces:**
- Produces (types.ts): `Pref = 'fav' | 'ban'`; `Exercise.pref?: Pref`; `Exercise.cue?: string`; `PartnerConfig { on: boolean; names: [string, string] }`; `Settings.partner?: PartnerConfig`.
- Produces (generator.ts): ban-filtered fav-weighted `pickStations` (same signature); `replaceInSession(session, fromIndex, bannedId, replacement): Session`; `banReplacement(pool, stations, banned, rand?): Exercise | null`; `partnerExercises(stations, station): [Exercise, Exercise]`.
- Produces (timer.ts): new action `{ type: 'replace'; session: Session }` — swaps the session, preserving index/remaining/status.

- [ ] **Step 1: Extend `src/types.ts`**

Add after the `Equipment` type:

```ts
export type Pref = 'fav' | 'ban';
```

Extend `Exercise` with two optional fields:

```ts
export interface Exercise {
  id: string;
  name: string;
  category: Category;
  equipment: Equipment;
  pref?: Pref;
  cue?: string;
}
```

Add before `Settings` and extend it:

```ts
export interface PartnerConfig {
  on: boolean;
  names: [string, string];
}
```

```ts
export interface Settings {
  workSecs: number;
  restSecs: number;
  stations: number;
  roundRestSecs: number;
  totalMins: number;
  partner?: PartnerConfig;
}
```

(`DEFAULT_SETTINGS` unchanged — partner absent = solo.)

- [ ] **Step 2: Add cues to `src/seed.ts`**

Replace the file:

```ts
import type { Category, Equipment, Exercise } from './types';

const raw: [string, Category, Equipment, string][] = [
  ['Push-ups', 'upper', 'bodyweight', 'keep your body in a straight line'],
  ['Pike push-ups', 'upper', 'bodyweight', 'hips high, head toward the floor'],
  ['Tricep dips', 'upper', 'bodyweight', 'elbows point straight back'],
  ['Inchworms', 'upper', 'bodyweight', 'walk the hands out slowly, legs straight'],
  ['Shoulder press', 'upper', 'dumbbells', "don't arch your lower back"],
  ['Bent-over rows', 'upper', 'dumbbells', 'squeeze the shoulder blades'],
  ['Chest press', 'upper', 'dumbbells', 'wrists stacked over elbows'],
  ['Bicep curls', 'upper', 'dumbbells', 'elbows pinned to your sides'],
  ['Squats', 'lower', 'bodyweight', 'drive through the heels'],
  ['Lunges', 'lower', 'bodyweight', 'front knee over the ankle'],
  ['Glute bridges', 'lower', 'bodyweight', 'squeeze at the top'],
  ['Wall sit', 'lower', 'bodyweight', 'thighs parallel to the floor'],
  ['Goblet squats', 'lower', 'dumbbells', 'chest up, elbows inside the knees'],
  ['Dumbbell deadlifts', 'lower', 'dumbbells', 'flat back, hinge at the hips'],
  ['Weighted step-ups', 'lower', 'dumbbells', 'push through the top foot'],
  ['Plank', 'core', 'bodyweight', "don't let the hips sag"],
  ['Sit-ups', 'core', 'bodyweight', 'chin off your chest'],
  ['Russian twists', 'core', 'bodyweight', 'rotate from the torso'],
  ['Leg raises', 'core', 'bodyweight', 'press your lower back into the floor'],
  ['Bicycle crunches', 'core', 'bodyweight', 'slow and controlled'],
  ['Burpees', 'cardio', 'bodyweight', 'land soft, jump tall'],
  ['Mountain climbers', 'cardio', 'bodyweight', 'hips level, drive the knees'],
  ['High knees', 'cardio', 'bodyweight', 'knees to hip height'],
  ['Jumping jacks', 'cardio', 'bodyweight', 'stay light on your feet'],
];

export const SEED_POOL: Exercise[] = raw.map(([name, category, equipment, cue], i) => ({
  id: `seed-${i}`,
  name,
  category,
  equipment,
  cue,
}));
```

- [ ] **Step 3: Write the failing tests**

Append to `tests/generator.test.ts` (note: the existing `ex` helper stays; add a variant):

```ts
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
  const session = buildSession([a, b], { workSecs: 5, restSecs: 3, stations: 2, roundRestSecs: 7, totalMins: 1 });
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
});

describe('partnerExercises', () => {
  const stations = [exp('s1', 'upper'), exp('s2', 'lower'), exp('s3', 'core')];
  it('offsets partner 2 by one station', () => {
    expect(partnerExercises(stations, 1).map((e) => e.id)).toEqual(['s1', 's2']);
    expect(partnerExercises(stations, 2).map((e) => e.id)).toEqual(['s2', 's3']);
  });
  it('wraps partner 2 to station 1 on the last station', () => {
    expect(partnerExercises(stations, 3).map((e) => e.id)).toEqual(['s3', 's1']);
  });
});
```

Update the test file's imports to include `replaceInSession`, `banReplacement`, `partnerExercises` from `../src/generator` and `Exercise` from `../src/types`.

Append to `tests/timer.test.ts`:

```ts
it('replace swaps the session but keeps position and status', () => {
  const mid: TimerState = { session, index: 1, remainingMs: 2500, status: 'paused' };
  const swapped: Session = [...session];
  const s = timerReducer(mid, { type: 'replace', session: swapped });
  expect(s.session).toBe(swapped);
  expect(s.index).toBe(1);
  expect(s.remainingMs).toBe(2500);
  expect(s.status).toBe('paused');
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/generator.test.ts tests/timer.test.ts`
Expected: FAIL — `replaceInSession` etc. not exported; timer `replace` action not in the union.

- [ ] **Step 5: Implement**

In `src/generator.ts`, replace the category-grouping block inside `pickStations` (the `const byCat = ...` loop) with:

```ts
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
```

Append to `src/generator.ts`:

```ts
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
```

In `src/timer.ts`, add to the `TimerAction` union:

```ts
  | { type: 'replace'; session: Session }
```

and a case in the reducer switch:

```ts
    case 'replace':
      return { ...state, session: action.session };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — all existing + new tests (existing tests unaffected: seed gains cues, generator behaviour for pref-less pools identical).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/seed.ts src/generator.ts src/timer.ts tests/generator.test.ts tests/timer.test.ts
git commit -m "feat: add exercise preferences, form cues, session replacement, partner offsets"
```

---

### Task 2: Voice module

**Files:**
- Create: `src/voice.ts`
- Modify: `src/audio.ts` (speaking listener hook)
- Test: `tests/voice.test.ts`

**Interfaces:**
- Produces (voice.ts): `VoiceCommand = 'pause' | 'resume' | 'skip' | 'back' | 'nextTrack'`; `parseCommand(transcript: string): VoiceCommand | null`; `createVoiceControl(onCommand: (cmd: VoiceCommand) => void): { stop(): void } | null` (null when SpeechRecognition unsupported).
- Produces (audio.ts): `onSpeaking(cb: (speaking: boolean) => void): void`, `offSpeaking(cb): void` — single listener notified when speech synthesis starts/ends.

- [ ] **Step 1: Write the failing test `tests/voice.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/voice';

describe('parseCommand', () => {
  it('matches each command', () => {
    expect(parseCommand('pause')).toBe('pause');
    expect(parseCommand('please pause now')).toBe('pause');
    expect(parseCommand('resume')).toBe('resume');
    expect(parseCommand('go')).toBe('resume');
    expect(parseCommand('skip')).toBe('skip');
    expect(parseCommand('go back')).toBe('resume'); // "go" wins by order — acceptable
    expect(parseCommand('back')).toBe('back');
    expect(parseCommand('Next Track')).toBe('nextTrack');
  });

  it('checks "next track" before "skip"-family words', () => {
    expect(parseCommand('skip to the next track')).toBe('nextTrack');
  });

  it('requires "go" as a whole word', () => {
    expect(parseCommand('good effort')).toBeNull();
    expect(parseCommand('going going gone')).toBeNull();
  });

  it('returns null for junk and empty input', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('what a lovely day')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/voice.test.ts`
Expected: FAIL — cannot resolve `../src/voice`.

- [ ] **Step 3: Add the speaking hook to `src/audio.ts`**

Add at module level and wire into `speak`:

```ts
let speechListener: ((speaking: boolean) => void) | null = null;

export function onSpeaking(cb: (speaking: boolean) => void): void {
  speechListener = cb;
}

export function offSpeaking(cb: (speaking: boolean) => void): void {
  if (speechListener === cb) speechListener = null;
}
```

Replace `speak`:

```ts
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => speechListener?.(true);
    u.onend = () => speechListener?.(false);
    u.onerror = () => speechListener?.(false);
    window.speechSynthesis.speak(u);
  } catch {
    // voice unavailable -> beeps only
  }
}
```

- [ ] **Step 4: Write `src/voice.ts`**

```ts
import { offSpeaking, onSpeaking } from './audio';

export type VoiceCommand = 'pause' | 'resume' | 'skip' | 'back' | 'nextTrack';

export function parseCommand(transcript: string): VoiceCommand | null {
  const t = transcript.toLowerCase();
  if (t.includes('next track')) return 'nextTrack';
  if (t.includes('pause')) return 'pause';
  if (t.includes('resume') || /\bgo\b/.test(t)) return 'resume';
  if (t.includes('skip')) return 'skip';
  if (t.includes('back')) return 'back';
  return null;
}

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function voiceSupported(): boolean {
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

export function createVoiceControl(
  onCommand: (cmd: VoiceCommand) => void,
): { stop(): void } | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;

  let stopped = false;
  let muted = false; // while our own announcements are speaking
  let errors = 0;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = 'en-GB';

  const tryStart = () => {
    try {
      rec.start();
    } catch {
      // already started -> fine
    }
  };

  rec.onresult = (e) => {
    if (muted || stopped) return;
    const last = e.results[e.results.length - 1]?.[0]?.transcript ?? '';
    const cmd = parseCommand(last);
    if (cmd) onCommand(cmd);
  };
  // Chrome ends continuous sessions periodically -> restart until stopped.
  rec.onend = () => {
    if (!stopped && !muted) tryStart();
  };
  rec.onerror = (e) => {
    console.warn('[tasha] voice recognition error:', e.error);
    // ponytail: two strikes (e.g. mic denied) -> voice stays off this workout
    if (++errors >= 2) stopped = true;
  };

  const speakingListener = (speaking: boolean) => {
    muted = speaking;
    if (speaking) {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    } else if (!stopped) {
      tryStart();
    }
  };
  onSpeaking(speakingListener);
  tryStart();

  return {
    stop() {
      stopped = true;
      offSpeaking(speakingListener);
      try {
        rec.abort();
      } catch {
        // ignore
      }
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (all suites; voice.ts's window references are inside functions, safe under the node test environment).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/voice.ts src/audio.ts tests/voice.test.ts
git commit -m "feat: add voice command module with self-hearing guard"
```

---

### Task 3: Pool UI — preference cycle + cue input

**Files:**
- Modify: `src/components/Pool.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `Exercise.pref` / `Exercise.cue` from Task 1; existing `update(id, patch)` helper in Pool.tsx.

- [ ] **Step 1: Add controls to the pool row**

In `src/components/Pool.tsx`, add a helper above the return (after `shown`):

```tsx
  const cyclePref = (e: Exercise) =>
    update(e.id, { pref: e.pref === undefined ? 'fav' : e.pref === 'fav' ? 'ban' : undefined });
```

In the `shown.map` row, after the equipment `<select>` and before the delete button, add:

```tsx
            <button
              className={`pref ${e.pref ?? 'none'}`}
              onClick={() => cyclePref(e)}
              title={
                e.pref === 'fav'
                  ? 'Favourite (picked more often) — click for ban'
                  : e.pref === 'ban'
                    ? 'Banned (never picked) — click to clear'
                    : 'Neutral — click to favourite'
              }
            >
              {e.pref === 'fav' ? '★' : e.pref === 'ban' ? '🚫' : '–'}
            </button>
            <input
              className="cue-input"
              value={e.cue ?? ''}
              onChange={(ev) => update(e.id, { cue: ev.target.value || undefined })}
              placeholder="Form cue"
            />
```

- [ ] **Step 2: Append CSS to `src/index.css`**

```css
/* ---- preferences & cues ---- */
.pool-list .pref { min-width: 2.4rem; }
.pool-list .pref.fav { color: #f0b429; }
.pool-list .pref.ban { filter: none; }
.pool-list .cue-input { flex: 1; font-size: 0.85rem; color: #aaa; }
```

- [ ] **Step 3: Verify**

`npm run build && npx vitest run` — clean/green. `npm run dev`: pool rows show – / ★ / 🚫 cycling and an editable cue field pre-filled from the seed; both survive reload.

Note: existing stored pools (localStorage) predate cues — seeded cues only appear on a fresh pool. That's acceptable; users add cues via the input. Mention this in the report.

- [ ] **Step 4: Commit**

```bash
git add src/components/Pool.tsx src/index.css
git commit -m "feat: add preference cycle and form cue editing to pool screen"
```

---

### Task 4: Workout — cue display/announcement + mid-workout ban

**Files:**
- Modify: `src/App.tsx`, `src/components/Workout.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `replaceInSession`, `banReplacement` from generator; timer `replace` action (Task 1).
- Produces: `Workout` props become `{ session, pool, onBan, onExit }` where `onBan(e: Exercise): void` persists the ban WITHOUT invalidating the running session.

- [ ] **Step 1: App — ban handler that doesn't kill the session**

In `src/App.tsx`, add below `setSettings`:

```tsx
  const banExercise = (banned: Exercise) => {
    const next = pool.map((e) => (e.id === banned.id ? { ...e, pref: 'ban' as const } : e));
    setPoolState(next);
    savePool(next); // deliberately NOT setPool: the running session must survive
  };
```

Change the workout branch:

```tsx
  if (screen === 'workout' && session) {
    return (
      <Workout session={session} pool={pool} onBan={banExercise} onExit={() => setScreen('setup')} />
    );
  }
```

- [ ] **Step 2: Workout — props, cue display, cue-in-rest announcement, ban button**

In `src/components/Workout.tsx`:

Imports: add `banReplacement`, `replaceInSession` to the generator import; add `Exercise` to the types import.

Change the component signature:

```tsx
export function Workout({
  session,
  pool,
  onBan,
  onExit,
}: {
  session: Session;
  pool: Exercise[];
  onBan: (e: Exercise) => void;
  onExit: () => void;
}) {
```

Update `announce` to include the cue on rests (module-level function, same file):

```tsx
function announce(state: TimerState): void {
  const iv = state.session[state.index];
  if (iv.kind === 'work') speak(`${iv.exercise!.name}. Go!`);
  else if (iv.kind === 'rest') {
    const cue = iv.exercise!.cue ? ` — ${iv.exercise!.cue}` : '';
    speak(`Rest. Next up: ${iv.exercise!.name}${cue}`);
  } else if (iv.kind === 'roundRest') speak(`Round ${iv.round + 1} coming up`);
}
```

Add the ban handler inside the component (after the refs, before the effects):

```tsx
  const ban = () => {
    const iv = state.session[state.index];
    if (iv.kind !== 'work' || !iv.exercise) return;
    const stations = state.session
      .filter((x) => x.kind === 'work' && x.round === 1)
      .map((x) => x.exercise!);
    const replacement = banReplacement(pool, stations, iv.exercise);
    onBan(iv.exercise);
    if (replacement) {
      dispatch({
        type: 'replace',
        session: replaceInSession(state.session, state.index, iv.exercise.id, replacement),
      });
    }
  };
```

In the running JSX: under the `.label` div add the cue line, and add the ban button to `.controls`:

```tsx
      <div className="label">
        {iv.kind === 'work' ? iv.exercise!.name : iv.kind === 'prep' ? 'Get ready' : 'Rest'}
      </div>
      {iv.kind === 'work' && iv.exercise?.cue && <div className="cue">{iv.exercise.cue}</div>}
```

```tsx
        <button onClick={() => dispatch({ type: 'next' })} title="Skip (→)">⏭</button>
        {iv.kind === 'work' && (
          <button onClick={ban} title="Never again — ban this exercise and swap it out">👎</button>
        )}
```

- [ ] **Step 3: CSS**

Append to `src/index.css`:

```css
.workout .cue { font-size: 1.3rem; color: rgba(255, 255, 255, 0.75); font-style: italic; }
```

- [ ] **Step 4: Verify**

`npm run build && npx vitest run` — clean/green. `npm run dev` (fresh pool via localStorage clear if needed): cue shows under the exercise during work; rest announcement speaks the cue; 👎 during work swaps the exercise out of later intervals and the pool row shows 🚫 afterwards, while the session keeps running.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Workout.tsx src/index.css
git commit -m "feat: show and speak form cues, add mid-workout exercise ban"
```

---

### Task 5: Voice control wiring in Workout

**Files:**
- Modify: `src/components/Workout.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `createVoiceControl`, `voiceSupported`, `VoiceCommand` from `src/voice.ts` (Task 2); existing `dispatch` + `playerRef`.

- [ ] **Step 1: Wire voice into `src/components/Workout.tsx`**

Imports: `import { createVoiceControl, voiceSupported } from '../voice';`

State (next to `track`):

```tsx
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('tasha.voice') !== '0');
```

Effect (after the keyboard effect):

```tsx
  // Voice control: mic listens only while the workout screen is mounted.
  useEffect(() => {
    if (!voiceOn) return;
    const vc = createVoiceControl((cmd) => {
      if (cmd === 'pause') dispatch({ type: 'pause' });
      else if (cmd === 'resume') dispatch({ type: 'resume' });
      else if (cmd === 'skip') dispatch({ type: 'next' });
      else if (cmd === 'back') dispatch({ type: 'prev' });
      else playerRef.current?.skipTrack();
    });
    if (!vc) return;
    return () => vc.stop();
  }, [voiceOn]);
```

Toggle button in the running JSX, next to the Exit button:

```tsx
      {voiceSupported() && (
        <button
          className={`mic${voiceOn ? '' : ' off'}`}
          onClick={() => {
            const v = !voiceOn;
            setVoiceOn(v);
            localStorage.setItem('tasha.voice', v ? '1' : '0');
          }}
          title={voiceOn ? 'Voice control on — say pause / go / skip / back / next track' : 'Voice control off'}
        >
          🎤
        </button>
      )}
```

- [ ] **Step 2: CSS**

Append to `src/index.css`:

```css
.workout .mic { position: absolute; top: 1rem; left: 1rem; background: rgba(0, 0, 0, 0.3); }
.workout .mic.off { opacity: 0.4; text-decoration: line-through; }
```

- [ ] **Step 3: Verify**

`npm run build && npx vitest run` — clean/green. Browser: mic button appears (Chrome), toggling persists across workouts; with mic allowed, saying "pause"/"go"/"skip"/"back" drives the timer, and announcements do NOT trigger commands (self-hearing guard). Report if the mic permission prompt blocks headless verification — real-mic behaviour is user-verified.

- [ ] **Step 4: Commit**

```bash
git add src/components/Workout.tsx src/index.css
git commit -m "feat: wire voice commands into the workout screen"
```

---

### Task 6: Cool-down playlist

**Files:**
- Modify: `src/spotify.ts`, `src/components/Music.tsx`, `src/components/Workout.tsx`

**Interfaces:**
- Produces (spotify.ts): `loadCooldownId(): string | null`, `saveCooldownId(id: string): void` ('' clears), `cooldownPlaylist(): SpotifyPlaylist | null` (no first-playlist fallback — absent means off).

- [ ] **Step 1: spotify.ts — cooldown persistence**

Add near the other playlist persistence functions:

```ts
const COOLDOWN_KEY = 'tasha.spotify.cooldown';

export function loadCooldownId(): string | null {
  return localStorage.getItem(COOLDOWN_KEY);
}

export function saveCooldownId(id: string): void {
  if (id) localStorage.setItem(COOLDOWN_KEY, id);
  else localStorage.removeItem(COOLDOWN_KEY);
}

export function cooldownPlaylist(): SpotifyPlaylist | null {
  const id = loadCooldownId();
  if (!id) return null;
  return loadPlaylists().find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 2: Music.tsx — cool-down dropdown**

Import additions: `cooldownPlaylist` not needed; add `loadCooldownId`, `saveCooldownId`.

State: `const [cooldownId, setCooldownId] = useState<string | null>(loadCooldownId);`

In `remove()`, clear a deleted cool-down selection (add after the activeId handling):

```tsx
    if (id === cooldownId) {
      setCooldownId(null);
      saveCooldownId('');
    }
```

After the existing "Play during workout" label block, add:

```tsx
      {playlists.length > 0 && (
        <label>
          Cool-down when finished (optional)
          <select
            value={cooldownId ?? ''}
            onChange={(e) => {
              setCooldownId(e.target.value || null);
              saveCooldownId(e.target.value);
            }}
          >
            <option value="">None</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
```

- [ ] **Step 3: Workout.tsx — play cool-down on done**

Import `cooldownPlaylist` and `DIP_VOLUME` is already imported. Replace the status-sync effect:

```tsx
  // Music follows the timer: running -> resume, paused -> pause,
  // done -> cool-down playlist if configured, else pause.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (state.status === 'running') {
      p.resume();
    } else if (state.status === 'done') {
      const cd = cooldownPlaylist();
      if (cd) {
        p.setBaseVolume(DIP_VOLUME);
        void p.play(cd.uri).catch(() => {});
      } else {
        p.pause();
      }
    } else {
      p.pause();
    }
  }, [state.status]);
```

(Unmount/Exit still pauses via the mount effect's cleanup — the cool-down stops when you leave the done screen.)

- [ ] **Step 4: Verify**

`npm run build && npx vitest run` — clean/green. Browser (fake-auth check): cool-down dropdown renders, persists, clears when its playlist is deleted. Real playback of the cool-down switch is user-verified.

- [ ] **Step 5: Commit**

```bash
git add src/spotify.ts src/components/Music.tsx src/components/Workout.tsx
git commit -m "feat: optional Spotify cool-down playlist at session end"
```

---

### Task 7: Partner mode

**Files:**
- Modify: `src/components/Setup.tsx`, `src/components/Workout.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `PartnerConfig` + `Settings.partner` (Task 1); `partnerExercises` from generator.
- Produces: `Workout` gains prop `partner?: PartnerConfig` (passed by App? No — Workout receives `session, pool, onBan, onExit`; partner comes via a new prop from App: update App's workout branch to `partner={settings.partner}`).

- [ ] **Step 1: Setup.tsx — toggle + names**

After the `.settings-grid` div, add:

```tsx
      <label className="partner-toggle">
        <input
          type="checkbox"
          checked={settings.partner?.on ?? false}
          onChange={(e) =>
            setSettings({
              ...settings,
              partner: { on: e.target.checked, names: settings.partner?.names ?? ['A', 'B'] },
            })
          }
        />
        Partner mode — two people, offset stations
      </label>
      {settings.partner?.on && (
        <div className="partner-names">
          {([0, 1] as const).map((i) => (
            <input
              key={i}
              value={settings.partner!.names[i]}
              onChange={(e) => {
                const names: [string, string] = [...settings.partner!.names];
                names[i] = e.target.value;
                setSettings({ ...settings, partner: { on: true, names } });
              }}
              placeholder={`Partner ${i + 1}`}
            />
          ))}
        </div>
      )}
```

- [ ] **Step 2: App.tsx — pass partner**

```tsx
      <Workout
        session={session}
        pool={pool}
        onBan={banExercise}
        partner={settings.partner}
        onExit={() => setScreen('setup')}
      />
```

- [ ] **Step 3: Workout.tsx — partner display + announcements**

Add `PartnerConfig` to the types import and `partnerExercises` to the generator import. Extend props:

```tsx
export function Workout({
  session,
  pool,
  onBan,
  partner,
  onExit,
}: {
  session: Session;
  pool: Exercise[];
  onBan: (e: Exercise) => void;
  partner?: PartnerConfig;
  onExit: () => void;
}) {
```

Replace `announce` (module-level) with a partner-aware version and update its call site to `announce(state, partner)`:

```tsx
function announce(state: TimerState, partner?: PartnerConfig): void {
  const iv = state.session[state.index];
  if (partner?.on && iv.kind !== 'prep') {
    const stations = state.session
      .filter((x) => x.kind === 'work' && x.round === 1)
      .map((x) => x.exercise!);
    const [n1, n2] = partner.names;
    if (iv.kind === 'work') {
      const [a, b] = partnerExercises(stations, iv.station);
      speak(`${n1}: ${a.name}. ${n2}: ${b.name}. Go!`);
    } else {
      const nextStation = iv.kind === 'rest' ? iv.station + 1 : 1;
      const [a, b] = partnerExercises(stations, nextStation);
      speak(`Next — ${n1}: ${a.name}. ${n2}: ${b.name}`);
    }
    return;
  }
  if (iv.kind === 'work') speak(`${iv.exercise!.name}. Go!`);
  else if (iv.kind === 'rest') {
    const cue = iv.exercise!.cue ? ` — ${iv.exercise!.cue}` : '';
    speak(`Rest. Next up: ${iv.exercise!.name}${cue}`);
  } else if (iv.kind === 'roundRest') speak(`Round ${iv.round + 1} coming up`);
}
```

In the running JSX, compute once before the return (next to `stationsPerRound`):

```tsx
  const partnerOn = partner?.on ?? false;
  const stations = partnerOn
    ? state.session.filter((x) => x.kind === 'work' && x.round === 1).map((x) => x.exercise!)
    : [];
```

Replace the label + cue block:

```tsx
      {partnerOn && iv.kind === 'work' ? (
        <div className="label partner">
          {partnerExercises(stations, iv.station).map((e, i) => (
            <div key={i}>
              {partner!.names[i]}: {e.name}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="label">
            {iv.kind === 'work' ? iv.exercise!.name : iv.kind === 'prep' ? 'Get ready' : 'Rest'}
          </div>
          {!partnerOn && iv.kind === 'work' && iv.exercise?.cue && (
            <div className="cue">{iv.exercise.cue}</div>
          )}
        </>
      )}
```

Replace the "Next:" preview to be partner-aware:

```tsx
      {iv.kind !== 'work' &&
        (partnerOn ? (
          iv.kind !== 'prep' && (
            <div className="next">
              Next —{' '}
              {partnerExercises(stations, iv.kind === 'rest' ? iv.station + 1 : 1)
                .map((e, i) => `${partner!.names[i]}: ${e.name}`)
                .join(' · ')}
            </div>
          )
        ) : (
          iv.exercise && <div className="next">Next: {iv.exercise.name}</div>
        ))}
```

- [ ] **Step 4: CSS**

Append to `src/index.css`:

```css
/* ---- partner mode ---- */
.partner-toggle { display: flex; gap: 0.5rem; align-items: center; margin: 0.75rem 0; color: #aaa; }
.partner-names { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
.workout .label.partner { font-size: clamp(1.6rem, 5vw, 3.2rem); display: flex; flex-direction: column; gap: 0.3rem; }
```

- [ ] **Step 5: Verify**

`npm run build && npx vitest run` — clean/green. Browser: toggle + names in Setup; in a partner workout both assignments show during work, offset by one station with wrap on the last, both next-assignments during rest; prep shows "Get ready".

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/Setup.tsx src/components/Workout.tsx src/index.css
git commit -m "feat: offset-stations partner mode with dual display and announcements"
```

---

### Task 8: Final verification (controller)

**Files:** none — verification only.

- [ ] **Step 1:** `npm test && npm run build` — all green.
- [ ] **Step 2:** Controller extends the headless E2E suites: pref cycle + cue edit persistence in the pool; 👎 mid-workout swap (later intervals change, pool shows 🚫, session keeps running); cool-down dropdown persistence; partner-mode dual display with offset + wrap; regression of the existing 34-check + 17-check suites. Voice (real mic) and cool-down playback are user-verified.
- [ ] **Step 3:** Clean tree, ready for finishing-a-development-branch.
