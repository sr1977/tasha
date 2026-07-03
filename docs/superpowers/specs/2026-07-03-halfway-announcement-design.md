# Tasha — Halfway Announcement

**Date:** 2026-07-03
**Status:** Approved design

## Behaviour

- When a **work** interval crosses its midpoint (`secsLeft` crossing
  `ceil(duration / 2)` on a tick within the same interval), speak **"Halfway!"**
  and duck the music (existing `duck()` — 15% for 2.5s). The speech-mute guard
  for voice recognition applies automatically via `speak()`.
- Work intervals only. Skipped when `duration < 10` (collides with 3-2-1 beeps).
- Fires at most once per interval index, only while `running`.
- Skipping into the second half of an interval does not fire it (crossing is
  detected between consecutive displayed seconds of the same interval).
- Accepted edge: restarting the current interval (⏮ >2s in) does not repeat
  the halfway call for that interval.

## Implementation

`src/components/Workout.tsx`, inside the existing audio-cue effect's
same-interval branch: capture the previous displayed second before overwriting
the ref; fire when `prev > half && secsLeft <= half` with a `halfwayRef`
(last-announced index) guard. No new modules.

## Testing

Headless E2E: stub `speechSynthesis.speak` to record utterance texts, run a
≥10s work interval in real time past its midpoint, assert "Halfway!" was
spoken exactly once; assert no halfway utterance for a short (<10s) interval.
Audible result user-verified.
