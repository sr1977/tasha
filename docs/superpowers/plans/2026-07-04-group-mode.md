# Group Mode (2–4 Groups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partner mode becomes group mode: 2–4 named groups rotating together on offset stations; short spoken commands at 3+ groups.

**Architecture:** `groupExercises(stations, station, count)` (pure, tested) replaces the pair-only `partnerExercises`; UI reads `partner.names.length` as the group count. Announcements branch on count (2 = named roll call as today; 3+ = "Rotate — go!" / "Rest").

**Tech Stack:** Existing only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-group-mode-design.md`

## Global Constraints

- `PartnerConfig.names: string[]` (2–4). Old stored 2-tuples parse unchanged; toggle default `['A','B']`.
- Offset rule: group `g` (0-based) does `stations[(station - 1 + g) % stations.length]`.
- Announcements: count 2 unchanged (named); count ≥3 → work "Rotate — go!", rest "Rest", roundRest "Round <n+1> coming up"; prep silent.
- Setup warns (existing `.warn` style, non-blocking) when `stations < groups`.
- 2-group behaviour must remain byte-identical (display format, announcements, tests).
- Tests in `tests/`. Conventional commits, NEVER any AI attribution. Branch `feature/group-mode`.

---

### Task 1: `groupExercises` + PartnerConfig type (TDD)

**Files:**
- Modify: `src/types.ts`, `src/generator.ts`
- Test: `tests/generator.test.ts` (replace the `partnerExercises` describe block)

**Interfaces:**
- Produces: `PartnerConfig { on: boolean; names: string[] }`;
  `groupExercises(stations: Exercise[], station: number, count: number): Exercise[]` exported from `src/generator.ts`.
- `partnerExercises` remains as a one-line transitional wrapper over
  `groupExercises(stations, station, 2)` so the build stays green between
  tasks; Task 2 switches its consumers and deletes it.

- [ ] **Step 1: Update `src/types.ts`**

```ts
export interface PartnerConfig {
  on: boolean;
  names: string[]; // 2-4 group names
}
```

(Replaces the `[string, string]` tuple. Nothing else in the file changes.)

- [ ] **Step 2: Write the failing tests** — in `tests/generator.test.ts`, replace the whole `describe('partnerExercises', ...)` block with:

```ts
describe('groupExercises', () => {
  const stations = [exp('s1', 'upper'), exp('s2', 'lower'), exp('s3', 'core'), exp('s4', 'cardio')];

  it('count 2 matches the old partner behaviour incl. wrap', () => {
    expect(groupExercises(stations, 1, 2).map((e) => e.id)).toEqual(['s1', 's2']);
    expect(groupExercises(stations, 4, 2).map((e) => e.id)).toEqual(['s4', 's1']);
  });

  it('count 4 on 4 stations covers all stations in rotated order', () => {
    expect(groupExercises(stations, 1, 4).map((e) => e.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(groupExercises(stations, 3, 4).map((e) => e.id)).toEqual(['s3', 's4', 's1', 's2']);
  });

  it('count 3 on 3 stations wraps correctly', () => {
    const three = stations.slice(0, 3);
    expect(groupExercises(three, 2, 3).map((e) => e.id)).toEqual(['s2', 's3', 's1']);
  });
});
```

Update the test file's generator import: `partnerExercises` → `groupExercises`.

- [ ] **Step 3: Run to verify failure** — `npx vitest run tests/generator.test.ts` → FAIL (no export).

- [ ] **Step 4: Implement in `src/generator.ts`** — replace the `partnerExercises` function with:

```ts
export function groupExercises(stations: Exercise[], station: number, count: number): Exercise[] {
  return Array.from({ length: count }, (_, g) => stations[(station - 1 + g) % stations.length]);
}

// ponytail: transitional wrapper, deleted in the next task once consumers move
export function partnerExercises(stations: Exercise[], station: number): [Exercise, Exercise] {
  return groupExercises(stations, station, 2) as [Exercise, Exercise];
}
```

- [ ] **Step 5: Verify** — `npx vitest run` all pass (75 total: 3 old partner tests replaced by 3 new) and `npm run build` clean (wrapper keeps consumers compiling; `names: string[]` is looser than the old tuple so existing reads of `names[0]`/`names[1]` still typecheck).

- [ ] **Step 6: Commit** — `feat: generalize partner offsets to 2-4 group rotation`

---

### Task 2: Setup group controls + Workout display/announcements

**Files:**
- Modify: `src/components/Setup.tsx`, `src/components/Workout.tsx`, `src/generator.ts` (delete wrapper), `src/index.css`

**Interfaces:**
- Consumes: `groupExercises`, `PartnerConfig.names: string[]` from Task 1.
- Deletes: `partnerExercises` (wrapper) once Workout is switched.

- [ ] **Step 1: Setup.tsx — group count + names.** Replace the partner-names block (the `{settings.partner?.on && (<div className="partner-names">...)}` JSX) with:

```tsx
        {settings.partner?.on && (
          <>
            <div className="partner-names">
              <select
                value={settings.partner.names.length}
                onChange={(e) => {
                  const count = Number(e.target.value);
                  const defaults = ['A', 'B', 'C', 'D'];
                  const names = Array.from(
                    { length: count },
                    (_, i) => settings.partner!.names[i] ?? defaults[i],
                  );
                  setSettings({ ...settings, partner: { on: true, names } });
                }}
              >
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} groups</option>
                ))}
              </select>
              {settings.partner.names.map((name, i) => (
                <input
                  key={i}
                  value={name}
                  onChange={(e) => {
                    const names = [...settings.partner!.names];
                    names[i] = e.target.value;
                    setSettings({ ...settings, partner: { on: true, names } });
                  }}
                  placeholder={`Group ${i + 1}`}
                />
              ))}
            </div>
            {settings.stations < settings.partner.names.length && (
              <p className="warn">
                Fewer stations than groups — some groups will share a station.
              </p>
            )}
          </>
        )}
```

Also update the toggle's label text from "Partner mode — two people, offset stations" to "Group mode — rotate together on offset stations".

- [ ] **Step 2: Workout.tsx — switch to groupExercises.** Update the generator import (`partnerExercises` → `groupExercises`), then:

Replace `announce`'s partner branch:

```tsx
function announce(state: TimerState, partner?: PartnerConfig): void {
  const iv = state.session[state.index];
  if (partner?.on && iv.kind !== 'prep') {
    const count = partner.names.length;
    if (count >= 3) {
      if (iv.kind === 'work') speak('Rotate — go!');
      else if (iv.kind === 'rest') speak('Rest');
      else speak(`Round ${iv.round + 1} coming up`);
      return;
    }
    const stations = stationTemplate(state.session);
    const [n1, n2] = partner.names;
    if (iv.kind === 'work') {
      const [a, b] = groupExercises(stations, iv.station, 2);
      speak(`${n1}: ${a.name}. ${n2}: ${b.name}. Go!`);
    } else {
      const nextStation = iv.kind === 'rest' ? iv.station + 1 : 1;
      const [a, b] = groupExercises(stations, nextStation, 2);
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

In the running JSX, replace both `partnerExercises(...)` call sites with `groupExercises(..., partner!.names.length)` — the label block:

```tsx
        <div className="label partner" key={state.index}>
          {groupExercises(stations, iv.station, partner!.names.length).map((e, i) => (
            <div key={i}>
              {partner!.names[i]}: {e.name}
            </div>
          ))}
        </div>
```

and the next-preview:

```tsx
            <div className="next">
              Next —{' '}
              {groupExercises(stations, iv.kind === 'rest' ? iv.station + 1 : 1, partner!.names.length)
                .map((e, i) => `${partner!.names[i]}: ${e.name}`)
                .join(' · ')}
            </div>
```

- [ ] **Step 3: Delete the `partnerExercises` wrapper** from `src/generator.ts` (no consumers remain — verify with `grep -rn partnerExercises src/ tests/` → empty).

- [ ] **Step 4: CSS** — append to `src/index.css`:

```css
.workout .label.partner:has(div:nth-child(3)) {
  font-size: clamp(1.3rem, 3.8vw, 2.4rem);
}
```

- [ ] **Step 5: Verify** — `npm run build` clean; `npx vitest run` all pass; controller E2E: 4-group workout shows 4 offset lines with wrap, 2-group output byte-identical to before, count + names persist, stations<groups warning shows.

- [ ] **Step 6: Commit** — `feat: group mode with 2-4 groups, short commands at 3+`
