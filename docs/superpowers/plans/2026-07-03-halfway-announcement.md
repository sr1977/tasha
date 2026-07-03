# Halfway Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speak "Halfway!" (with music duck) at the midpoint of work intervals ≥10s, once per interval, while running.

**Spec:** `docs/superpowers/specs/2026-07-03-halfway-announcement-design.md`

## Global Constraints

Branch `feature/halfway`. Conventional commit, no AI attribution. No new deps.

---

### Task 1: Midpoint detection in the audio-cue effect

**Files:**
- Modify: `src/components/Workout.tsx`

- [ ] **Step 1: Add the fired-index ref** near the other audio refs:

```tsx
  const halfwayRef = useRef(-1); // interval index that already got its halfway call
```

- [ ] **Step 2: Extend the same-interval branch** of the audio-cue effect. Replace:

```tsx
    if (secsLeft !== prevSecs.current) {
      prevSecs.current = secsLeft;
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) beep();
    }
```

with:

```tsx
    if (secsLeft !== prevSecs.current) {
      const prev = prevSecs.current;
      prevSecs.current = secsLeft;
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) beep();
      const cur = state.session[state.index];
      const half = Math.ceil(cur.duration / 2);
      if (
        state.status === 'running' &&
        cur.kind === 'work' &&
        cur.duration >= 10 &&
        prev > half &&
        secsLeft <= half &&
        halfwayRef.current !== state.index
      ) {
        halfwayRef.current = state.index;
        speak('Halfway!');
        playerRef.current?.duck();
      }
    }
```

- [ ] **Step 3: Verify** — `npm run build` clean, `npx vitest run` 75/75.

- [ ] **Step 4: E2E check (controller)** — headless: stub `speechSynthesis.speak` to record texts, run a 12s work interval ~7s past its midpoint in real time, assert exactly one "Halfway!"; run a 5s work interval fully, assert none.

- [ ] **Step 5: Commit** — `feat: halfway announcement with music duck on work intervals`.
