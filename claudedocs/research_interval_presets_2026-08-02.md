# Research: Preset Workout Intervals for Tasha

**Date:** 2026-08-02 · **Depth:** standard · **Question:** are there established
interval schemes we could offer as one-tap defaults?

## Executive Summary

Yes — there is a small, stable canon of interval protocols that virtually every
interval-timer product ships as presets: Tabata (20/10), 40/20, 45/15, 30/30,
and boxing rounds (3 min/1 min). All map cleanly onto Tasha's settings model
(`workSecs / restSecs / stations / roundRestSecs / totalMins`) except EMOM and
AMRAP, which need a different timing model and should be excluded. Confidence:
high — these ratios are consistent across sources and long-established in
training practice.

## Findings

### 1. Tabata — 20s work / 10s rest × 8
The only preset with direct lab provenance: Izumi Tabata's 1996 study (Japanese
Olympic speed-skating team) used 20s at ~170% VO2max / 10s rest × 8 bouts =
4 minutes. The 2:1 work:rest ratio is the defining feature. Caveat for honesty
in labelling: true Tabata is one movement repeated 8 times at maximal effort;
a multi-station circuit at 20/10 is "Tabata-style" timing, not the protocol.

### 2. The conditioning staples — 40/20, 45/15, 30/30
Every surveyed timer app ships these:
- **40/20** (2:1) — the general-conditioning default; Tasha's current default already.
- **45/15** (3:1) — longer work bias, marketed for strength-endurance circuits.
- **30/30** (1:1) — equal recovery; consistently described as the beginner-friendly / repeatable-effort option.

### 3. Boxing rounds — 180s work / 60s rest
The combat-sports standard (3 min/1 min). Maps to Tasha as long work stations;
fits the drill-hall brand well.

### 4. Not mappable: EMOM / AMRAP
EMOM ("every minute on the minute": work until the reps are done, rest the
remainder) and AMRAP (fixed block, count rounds) depend on self-paced
completion, which Tasha's fixed work/rest engine can't represent. Exclude.

## Recommendation — preset set for Tasha

| Preset | work | rest | stations | round rest | notes |
|---|---|---|---|---|---|
| **Classic** (default) | 40 | 20 | 6 | 60 | current DEFAULT_SETTINGS |
| **Tabata-style** | 20 | 10 | 8 | 60 | one 8-station round = a 4-min Tabata block |
| **Power** | 45 | 15 | 6 | 60 | strength-endurance bias |
| **Steady** | 30 | 30 | 6 | 60 | beginner / recovery-day |
| **Fight camp** | 180 | 60 | 4 | 90 | boxing rounds; fewer, longer stations |

Presets set the five timing fields only; target length, focus, nasty dial,
partner mode, and roster stay as the user has them. UI: a quiet row of preset
chips above the settings grid (setup screens are procedural per the design
principles) — selecting one stamps the values into the existing inputs, which
remain editable; a preset is a starting point, not a mode.

## Sources

- [SET FOR SET — How To Do Tabata Workouts Properly](https://www.setforset.com/blogs/news/tabata-workouts)
- [BarBend — What Is Tabata Training?](https://barbend.com/tabata-training/)
- [ScienceDirect — Defining the number of bouts and oxygen uptake during the "Tabata protocol"](https://www.sciencedirect.com/science/article/abs/pii/S0031938418301069)
- [intervaltimer.com — Workout Timer: HIIT, Tabata, EMOM, AMRAP & Rounds](https://www.intervaltimer.com/workout-timer)
- [exercisetimer.net — HIIT Interval Timer presets](https://exercisetimer.net/intervaltimers)
- [workout-timer.org — Boxing, HIIT & Tabata presets](https://workout-timer.org/)
- [ilovetimers.com — HIIT Timer ratios](https://www.ilovetimers.com/hiit-timer)
