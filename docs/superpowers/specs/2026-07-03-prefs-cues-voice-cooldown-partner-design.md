# Tasha — Preferences, Cues, Voice Control, Cool-down, Partner Mode

**Date:** 2026-07-03
**Status:** Approved design
**Builds on:** 2026-07-02 circuit timer spec, 2026-07-03 Spotify spec

## Purpose

Five additions to the existing app: exercise favourites/bans that steer the
generator (with a mid-workout "never again" swap), per-exercise form cues
(shown and spoken), voice control on the workout screen, an optional Spotify
cool-down playlist at session end, and a two-person offset-stations partner
mode. No new dependencies; localStorage persistence throughout.

## 1. Favourites / bans

**Data.** `Exercise` gains `pref?: 'fav' | 'ban'` (absent = neutral). Old
stored pools lack the field and parse unchanged.

**Generator.** In `pickStations`:
- Banned exercises are removed from the pool before category grouping. If
  filtering empties the pool entirely, fall back to the unfiltered pool
  (banning everything should not break generation; Setup shows the existing
  small-pool warning behaviour).
- Favourites are inserted twice into their category's shuffle (≈2× pick
  probability). A favourite may therefore appear at two stations when the
  category is thin — same acceptance as the existing small-pool reuse rule.

**Pool UI.** Each row gets a preference cycle button: neutral (–) → ★ → 🚫 →
neutral. Persisted via the existing `savePool` path.

**Mid-workout ban.** The workout screen gets a 👎 button (work intervals
only). Clicking it:
1. Sets `pref: 'ban'` on the current exercise and persists the pool.
2. Swaps a replacement into every *remaining* interval of the current session
   that references the banned exercise (work intervals and rest/roundRest
   "next up" previews), via a pure helper:
   `replaceInSession(session, fromIndex, bannedId, replacement): Session`.
   Replacement choice: same category, not banned, not already a station;
   fallback any non-banned unused; fallback leave session unchanged.
3. Must NOT invalidate the running session: the ban path writes the pool via
   a dedicated handler (state + `savePool`) that skips App's
   pool-change-clears-session behaviour. The completed/current interval keeps
   its label; only *later* intervals swap.

## 2. Form cues

**Data.** `Exercise` gains `cue?: string`. All 24 seed exercises ship with a
one-line cue (e.g. Squats → "drive through the heels").

**Pool UI.** Each row gets a cue text input (placeholder "Form cue").

**Workout.** During work intervals the cue renders under the exercise name
(smaller text, class `.cue`). Rest announcements append the upcoming
exercise's cue: "Rest. Next up: squats — drive through the heels". Work-start
announcements stay short ("Squats. Go!"). Missing cue → no dash, no change.
In partner mode (§5) cues are omitted from announcements AND not rendered
(screen space is used by the dual assignment display).

## 3. Voice control

**Engine.** `window.SpeechRecognition ?? window.webkitSpeechRecognition`,
`continuous: true`, `lang: 'en-GB'`, running only while the workout screen is
mounted. Unsupported browser or denied mic permission → feature silently
absent (existing degradation convention, console.warn allowed).

**Commands** (match anywhere in the recognised phrase, case-insensitive,
first match wins):
- "pause" → pause timer
- "go" / "resume" → resume timer
- "skip" → next interval
- "back" → previous interval
- "next track" → skip Spotify track (checked before "skip"… ordering: test
  "next track" first, then "pause", "resume"/"go", "skip", "back")

**Self-hearing guard.** The app's own announcements contain command words
("Go!", "Next up"). `speak()` pauses recognition for the utterance's duration
(SpeechSynthesisUtterance `onstart`/`onend`/`onerror` → `recognition.stop()`
then restart). Recognition also auto-restarts on its `onend` (Chrome stops
the session periodically) unless the workout is unmounting.

**UI.** A 🎤 toggle button on the workout screen next to the track display;
visual state for listening vs off. Default ON when supported; the choice
persists (`tasha.voice` = '0' | '1').

**Module.** `src/voice.ts`: `createVoiceControl(onCommand: (cmd: VoiceCommand)
=> void): { stop(): void } | null` — returns null when unsupported. Command
parsing (`parseCommand(transcript): VoiceCommand | null`) is a pure exported
function, unit-tested.

## 4. Cool-down playlist

**Data.** `tasha.spotify.cooldown` holds a saved playlist id ('' / absent =
off). Music section gains a second dropdown "Cool-down (optional)" listing
the same saved playlists plus "None", persisted on change.

**Behaviour.** When the timer reaches `done` and a cool-down playlist is
configured and the player exists: play the cool-down playlist at `DIP_VOLUME`
instead of pausing. Exit/unmount still pauses as today. No cool-down
configured → exact current behaviour (pause on done).

## 5. Partner mode (offset stations)

**Data.** `Settings` gains `partner?: { on: boolean; names: [string, string] }`
(absent = solo; defaults names to "A" and "B" when enabled). Setup gets a
toggle + two name inputs (visible only when on). Changing it invalidates the
session like any settings change.

**Semantics.** Session structure, generator, and timer are untouched. Partner
mode is a *display/announcement* layer: for a work interval at station `i`
(1-based) of `N` stations, partner 1 does `stations[i-1]`, partner 2 does
`stations[i % N]` (wraps to station 1). Both work simultaneously; rests are
shared. Each partner covers all stations across a round. Pure helper
`partnerExercises(stations, station): [Exercise, Exercise]` unit-tested.

**Workout UI.** In partner mode the label area shows both assignments:
"Steve: Squats" (large) with "Tasha: Burpees" directly below (same size —
neither partner is secondary). Rest preview shows both next assignments.
Cues are not rendered in partner mode (space), and announcements become
"Steve: squats. Tasha: burpees. Go!" / "Next — Steve: lunges. Tasha: squats".
The 👎 ban button still works on partner 1's exercise only (ponytail: banning
mid-session in partner mode affects the same shared station list).

**Stations list.** Workout derives the round-1 station list from the session
the same way Setup does (work intervals of round 1).

## Error handling

- All new storage reads go through the existing shape-guarded loaders.
- Voice: recognition errors (`onerror`) are logged (console.warn) and the
  session restarts once; repeated failure leaves voice off for the workout.
- Cool-down playback failure = existing silent-failure convention.
- `replaceInSession` finding no candidate leaves the session unchanged (the
  ban still persists for future sessions).

## Testing

Vitest on pure logic: generator ban filtering + fav weighting + empty-after-
filter fallback; `replaceInSession` (swaps later work intervals and previews,
leaves past intervals, no-candidate no-op); `parseCommand` (all commands,
ordering of "next track" vs "skip", junk); `partnerExercises` (offset + wrap).
Voice/cool-down/partner UI verified in the browser.

## Out of scope (YAGNI)

Configurable favourite multiplier, per-partner exercise pools or names >2,
voice wake-word, custom command phrases, BPM/tempo anything, cool-down
duration control.
