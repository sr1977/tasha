# Tasha — Mute Music During Countdown Beeps

**Date:** 2026-07-03
**Status:** Approved design

## Behaviour

During the 3-2-1 countdown beeps at the end of any interval, the music is
**fully muted** (volume 0). Each beep re-fires the mute for 1.3s, holding
silence through the countdown; the following interval transition's
announcement duck (15%) takes over and then restores the new interval's base
volume. Voice announcements keep the existing 15% duck.

## Implementation

- `src/spotify.ts` — `PlayerHandle.duck` gains optional parameters:
  `duck(volume = DUCK_VOLUME, ms = DUCK_MS)`. Existing callers unchanged.
- `src/components/Workout.tsx` — both beep call sites (same-interval countdown
  and short-interval entry beep) additionally call
  `playerRef.current?.duck(0, 1300)`.

## Testing

Existing suites (behaviour is audio-level only); audible result user-verified.
