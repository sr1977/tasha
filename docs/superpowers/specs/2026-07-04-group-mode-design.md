# Tasha — Group Mode (1–4 Groups)

**Date:** 2026-07-04
**Status:** Approved design
**Supersedes:** the 2-person partner mode semantics in the 2026-07-03 five-feature spec (§5); everything not mentioned here is unchanged.

## Purpose

Extend partner mode to 1–4 named groups rotating together on offset stations.

## Data

- `PartnerConfig` becomes `{ on: boolean; names: string[] }` with 1–4 entries.
  Previously stored `[string, string]` values parse unchanged. Enabling the
  toggle with no stored names defaults to `['A', 'B']`.
- Setup UI: the existing partner toggle, plus (when on) a "Groups" select
  (1 | 2 | 3 | 4) and one name input per group. Growing the count appends default
  names ('C', 'D'); shrinking truncates. Changing any of it invalidates the
  session (existing setSettings behaviour).
- Warning (existing style, non-blocking) when `stations < groups`: groups will
  share stations.

## Logic

- `groupExercises(stations, station, count): Exercise[]` replaces
  `partnerExercises` (which was the `count = 2` case): group `g` (0-based)
  does `stations[(station - 1 + g) % stations.length]`. Pure, unit-tested:
  ordering, wrap on last stations, count 2 equivalence with old behaviour,
  count 4 on 4 stations covers all stations.
- `stationTemplate` (ban propagation) unchanged and still feeds the display.

## Display

- Workout label stacks one `Name: Exercise` line per group (same size per
  line; CSS steps the line size down when 3+ lines via `:has()` so four lines
  fit). Rest/roundRest previews stack the same lines for the NEXT station.
- Meta/clock/controls unchanged. Ban button still acts on group 1's exercise.

## Announcements

- `count <= 2`: named roll call — count 2 emits the exact pre-group-mode
  strings ("Steve: squats. Tasha: burpees. Go!" / "Next — Steve: …. Tasha: ….");
  count 1 is a single-name call ("Red: squats. Go!" / "Next — Red: …").
- `count >= 3`: short commands — work: "Rotate — go!"; rest: "Rest";
  roundRest: "Round <n+1> coming up" (existing). Prep unchanged (silent).
- Halfway, countdown beeps + mute, ducking, voice control: unchanged.

## Testing

Vitest: `groupExercises` (all counts, offsets, wrap, 2-group equivalence).
Headless E2E: 4-group workout shows four correctly offset lines with wrap;
2-group behaviour byte-identical to today; count selector + names persist.

## Out of scope (YAGNI)

More than 4 groups, per-group exercise pools, per-group timing, group scores.
