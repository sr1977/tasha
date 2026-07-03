# Tasha — Coach Voice Picker

**Date:** 2026-07-03
**Status:** Approved design

## Purpose

The app currently speaks with the browser's default TTS voice (robotic).
Let the user pick from the browser's installed voices, defaulting to the most
natural female English voice available.

## Behaviour

- **Setup screen** gains a "Coach voice" block below the session settings:
  a dropdown of available English (`lang` starting `en`) voices plus a
  "Default" option, and a ▶ test button that speaks a fixed sample line
  ("Next up: squats — drive through the heels") in the selected voice.
- Selection persists at localStorage `tasha.voiceName` (voice `name` string;
  absent = auto preference).
- **Auto preference** (when no explicit selection): first match of
  1. name === 'Google UK English Female'
  2. name starts with 'Google' and lang starts 'en' and name includes 'Female'
  3. name in ['Samantha', 'Karen', 'Moira', 'Tessa'] (common female en system voices)
  4. null → browser default.
- `speak()` sets `utterance.voice` to the resolved voice; a saved name that no
  longer exists falls back to auto preference silently.

## Implementation

`src/audio.ts`:
- `listVoices(): SpeechSynthesisVoice[]` — English voices; handles Chrome's
  async load via a module-level cache refreshed on `voiceschanged`.
- `pickVoice(voices: {name: string; lang: string}[], savedName: string | null): {name: string} | null`
  — **pure**, unit-tested: exact saved-name match first, else the auto
  preference chain above.
- `setVoiceName(name: string): void` ('' clears → auto), `getVoiceName()`.
- `speak()` resolves via `pickVoice(listVoices(), getVoiceName())` per call.

`src/components/Setup.tsx`: "Coach voice" label + select (option value '' =
"Default (auto)") + test button calling `speak(sample)`. Voice list loads in
a `useEffect` (voiceschanged listener; cleanup on unmount).

## Error handling

- No voices / speechSynthesis unavailable → dropdown hidden entirely.
- All failures leave speak() at its existing silent-degradation behaviour.

## Testing

Vitest on `pickVoice` (saved-name hit, saved-name gone → auto chain, each
preference tier, empty list → null). Audible result user-verified.

## Out of scope (YAGNI)

Rate/pitch controls, per-announcement voices, cloud TTS, non-English voices
(the announcements are English).
