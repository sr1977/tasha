# Tasha — Circuit Training Timer

**Date:** 2026-07-02
**Status:** Approved design

## Purpose

A personal-training app that generates a ~45-minute circuit session from a pool
of exercises and runs it with a large countdown timer, audio cues, and
pause/skip controls. Used on a desktop, full-screened in a browser tab during
workouts.

## Decisions (from brainstorming)

- **Platform:** Desktop, run in a browser tab. No packaging/install.
- **Stack:** Vite + React + TypeScript SPA. No backend, no accounts.
- **Persistence:** localStorage for exercise pool and settings.
- **Session structure:** Circuit rounds — N stations per round, work/rest per
  station, longer rest between rounds, rounds repeated to fill the target time.
- **Generation:** Random but category-balanced station selection.
- **Audio:** Web Audio beeps + speech synthesis voice cues. No audio files.
- **Starter pool:** Bodyweight + dumbbell exercises (~24), fully editable.

## Data model

```ts
type Category = 'upper' | 'lower' | 'core' | 'cardio';
type Equipment = 'bodyweight' | 'dumbbells';

interface Exercise {
  id: string;          // crypto.randomUUID()
  name: string;
  category: Category;
  equipment: Equipment;
}

interface Settings {
  workSecs: number;      // default 40
  restSecs: number;      // default 20
  stations: number;      // default 6
  roundRestSecs: number; // default 60
  totalMins: number;     // default 45
}

type IntervalKind = 'prep' | 'work' | 'rest' | 'roundRest';

interface SessionInterval {
  kind: IntervalKind;
  exercise?: Exercise;   // present for 'work' (and shown as "next" during rest)
  duration: number;      // seconds
  round: number;         // 1-based
  station: number;       // 1-based, 0 for prep/roundRest
}

type Session = SessionInterval[];
```

Storage keys: `tasha.pool`, `tasha.settings`. Missing/corrupt values fall back
to seeded defaults.

## Screens

1. **Setup** — edit settings, generate/regenerate a session, preview the
   station list (with per-station reshuffle), shows computed actual duration
   (e.g. "44:30"), Start button.
2. **Pool** — list, add, edit, delete exercises; filter by category/equipment.
3. **Workout** — the timer (detail below).

## Generator

- `roundLength = stations × (workSecs + restSecs) + roundRestSecs`
- `rounds = max(1, floor(totalMins × 60 / roundLength))`
- Station selection: round-robin across categories (upper → lower → core →
  cardio → …), picking randomly within each category; skip categories with no
  remaining exercises. If the pool has fewer exercises than stations, reuse is
  allowed (warn in UI).
- Session layout: one 10s `prep` interval, then for each round: N ×
  (`work` + `rest`), with `roundRest` between rounds (not after the last one;
  the final `rest` of the last station in each round is also dropped).
- Same stations every round (classic circuit).
- Regenerate reshuffles all stations; single-station swap replaces one pick
  with another exercise from the same category where possible.

## Timer engine

- Timestamp-based: store the interval's end as a `performance.now()` target and
  tick ~4×/sec computing remaining time. Never accumulate ticks — no drift
  over 45 minutes.
- **Pause:** freezes remaining ms; resume sets a new end target.
- **Skip forward/back:** jump whole intervals (back restarts the current
  interval if >2s elapsed, else goes to the previous one — media-player
  convention).
- **Keyboard:** space = pause/resume, ArrowRight = skip forward,
  ArrowLeft = skip back.
- **Wake lock:** request Screen Wake Lock on workout start, release on
  finish/leave; ignore if unsupported.
- Implemented as a pure reducer (state + action → state) with a thin ticking
  hook, so the logic is unit-testable without timers.

## Audio

- **Beeps:** Web Audio oscillator. Short beep at T-3, T-2, T-1 of every
  interval; distinct higher/longer tone at each transition.
- **Voice:** `speechSynthesis.speak()` at interval start — "Next up:
  <exercise>" when a rest begins, "<exercise>, go!" when work begins,
  "Round <n>" at round rest, "Session complete" at the end.
- Speech unavailable or errors → beeps only, silently.
- AudioContext is created/resumed on the Start click (autoplay policy).

## Workout UI

- Viewport-filling countdown digits (mm:ss or just seconds under a minute).
- Background/accent color-coded by interval kind (work vs rest vs round rest).
- Current exercise name large; "Next: <exercise>" preview during rests.
- Session progress bar + "Round 2/4 · Station 3/6" indicator.
- Pause / previous / next buttons (large, clickable mid-workout).
- Finish state: summary (total time, rounds completed) + back to Setup.

## Error handling

- Empty pool → Setup blocks generation with a message linking to Pool screen.
- Pool smaller than station count → generate anyway with reuse, show warning.
- Corrupt localStorage → reset that key to defaults.
- Speech/wake-lock/audio unsupported → degrade silently, timer still works.

## Testing

- **Vitest** on:
  - Generator: correct round count, interval layout, category balance,
    small-pool reuse, duration math.
  - Timer reducer: tick/pause/resume/skip transitions, boundary crossings,
    completion.
- UI verified manually by running the app; no browser-automation suite.

## Out of scope (YAGNI)

- Accounts, sync, mobile packaging, workout history/logging, exercise images
  or videos, custom audio files, per-station custom timings, multiple saved
  session templates.
