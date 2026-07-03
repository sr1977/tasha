# Coach Voice Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick the announcement voice from the browser's installed voices, defaulting to the most natural female English voice.

**Architecture:** Pure `pickVoice` resolver in `src/audio.ts` (unit-tested) + a voiceschanged-aware cache; `speak()` resolves per call. Small "Coach voice" block in Setup with a test button.

**Tech Stack:** Existing only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-coach-voice-picker-design.md`

## Global Constraints

- localStorage key `tasha.voiceName` ('' / absent = auto preference).
- Auto chain: exact 'Google UK English Female' → Google + en + 'Female' → ['Samantha','Karen','Moira','Tessa'] → null (browser default).
- Dropdown hidden when no voices/speechSynthesis. Silent degradation throughout.
- Tests in `tests/`. Commit: conventional, NEVER any AI attribution. Branch `feature/voice-picker`.

---

### Task 1: Voice resolver + picker UI

**Files:**
- Modify: `src/audio.ts`, `src/components/Setup.tsx`, `src/index.css`
- Test: `tests/audio.test.ts` (create)

**Interfaces:**
- Produces (audio.ts): `pickVoice(voices: VoiceLike[], savedName: string | null): VoiceLike | null` where `VoiceLike = { name: string; lang: string }`; `listVoices(): SpeechSynthesisVoice[]`; `getVoiceName(): string | null`; `setVoiceName(name: string): void`.

- [ ] **Step 1: Write the failing test `tests/audio.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { pickVoice } from '../src/audio';

const v = (name: string, lang = 'en-GB') => ({ name, lang });

describe('pickVoice', () => {
  const voices = [
    v('Daniel'),
    v('Google UK English Male'),
    v('Google UK English Female'),
    v('Google US English', 'en-US'),
    v('Samantha', 'en-US'),
    v('Amélie', 'fr-CA'),
  ];

  it('returns the exact saved voice when present', () => {
    expect(pickVoice(voices, 'Daniel')!.name).toBe('Daniel');
  });

  it('falls back to auto preference when the saved name is gone', () => {
    expect(pickVoice(voices, 'Departed Voice')!.name).toBe('Google UK English Female');
  });

  it('prefers Google UK English Female', () => {
    expect(pickVoice(voices, null)!.name).toBe('Google UK English Female');
  });

  it('falls back to other Google female English voices', () => {
    const noUk = voices.filter((x) => x.name !== 'Google UK English Female');
    expect(pickVoice([...noUk, v('Google Australian English Female', 'en-AU')], null)!.name).toBe(
      'Google Australian English Female',
    );
  });

  it('falls back to known female system voices', () => {
    expect(pickVoice([v('Daniel'), v('Samantha', 'en-US')], null)!.name).toBe('Samantha');
  });

  it('returns null when nothing matches or list is empty', () => {
    expect(pickVoice([v('Daniel')], null)).toBeNull();
    expect(pickVoice([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio.test.ts`
Expected: FAIL — `pickVoice` not exported.

- [ ] **Step 3: Implement in `src/audio.ts`**

Append:

```ts
// ---------- coach voice selection ----------

const VOICE_KEY = 'tasha.voiceName';
const FEMALE_SYSTEM_VOICES = ['Samantha', 'Karen', 'Moira', 'Tessa'];

export interface VoiceLike {
  name: string;
  lang: string;
}

export function pickVoice<T extends VoiceLike>(voices: T[], savedName: string | null): T | null {
  const saved = savedName ? voices.find((v) => v.name === savedName) : undefined;
  if (saved) return saved;
  return (
    voices.find((v) => v.name === 'Google UK English Female') ??
    voices.find(
      (v) => v.name.startsWith('Google') && v.lang.startsWith('en') && v.name.includes('Female'),
    ) ??
    voices.find((v) => FEMALE_SYSTEM_VOICES.includes(v.name)) ??
    null
  );
}

let voiceCache: SpeechSynthesisVoice[] = [];

function refreshVoices(): void {
  try {
    voiceCache = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith('en'));
  } catch {
    voiceCache = [];
  }
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (voiceCache.length === 0) refreshVoices();
  return voiceCache;
}

try {
  window.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices);
} catch {
  // no speech synthesis -> picker stays hidden
}

export function getVoiceName(): string | null {
  return localStorage.getItem(VOICE_KEY);
}

export function setVoiceName(name: string): void {
  if (name) localStorage.setItem(VOICE_KEY, name);
  else localStorage.removeItem(VOICE_KEY);
}
```

In `speak()`, after creating the utterance and before the `onstart` assignment, add:

```ts
    const voice = pickVoice(listVoices(), getVoiceName());
    if (voice) u.voice = voice as SpeechSynthesisVoice;
```

CAUTION: `src/audio.ts` currently has NO top-level window/localStorage access (safe under the node test env). The `addEventListener` call above is top-level — it must stay inside the try/catch AND tolerate `window` being undefined in tests. Wrap it:

```ts
if (typeof window !== 'undefined') {
  try {
    window.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices);
  } catch {
    // ignore
  }
}
```

(Use this guarded form, not the bare one.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: all pass (69 existing + 6 new = 75). The node env must not crash on import (window guard above).

- [ ] **Step 5: Add the Coach voice block to `src/components/Setup.tsx`**

Imports: `import { getVoiceName, listVoices, setVoiceName, speak } from '../audio';` and add `useEffect` to the react import.

State + effect inside the component (after the `drafts` state):

```tsx
  const [voices, setVoices] = useState(listVoices);
  const [voiceName, setVoiceNameState] = useState<string>(() => getVoiceName() ?? '');
  useEffect(() => {
    const refresh = () => setVoices(listVoices());
    refresh(); // voices often load async after first paint
    window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh);
  }, []);
```

JSX after the partner-names block (before the empty-pool check):

```tsx
      {voices.length > 0 && (
        <div className="voice-row">
          <label>
            Coach voice
            <select
              value={voiceName}
              onChange={(e) => {
                setVoiceNameState(e.target.value);
                setVoiceName(e.target.value);
              }}
            >
              <option value="">Default (auto)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
          </label>
          <button onClick={() => speak('Next up: squats — drive through the heels')} title="Test the voice">
            ▶ Test
          </button>
        </div>
      )}
```

- [ ] **Step 6: CSS**

Append to `src/index.css`:

```css
.voice-row {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-end;
  margin: var(--space-md) 0;
}
.voice-row label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
```

- [ ] **Step 7: Verify**

Run: `npm run build && npx vitest run` — clean/green. Browser: dropdown lists English voices, ▶ Test speaks in the selected voice, choice persists across reload, "Default (auto)" prefers a female Google voice.

- [ ] **Step 8: Commit**

```bash
git add src/audio.ts src/components/Setup.tsx src/index.css tests/audio.test.ts
git commit -m "feat: coach voice picker with natural female default"
```
