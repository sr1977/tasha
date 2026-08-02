import { describe, expect, it } from 'vitest';
import { announcementText, drawFromCycle, REST_OPENERS, TEAM_REST_OPENERS } from '../src/coach';
import { buildSession } from '../src/generator';
import type { Category, Exercise, PartnerConfig, Session, Settings } from '../src/types';

const ex = (id: string, category: Category): Exercise => ({
  id,
  name: id,
  category,
  equipment: 'bodyweight',
});

const stations = [ex('u1', 'upper'), ex('l1', 'lower'), ex('c1', 'core')];

// 3-station sets; target = exactly 2 rounds' worth (9:45), so fitRounds picks 2
const settings: Settings = { workSecs: 40, restSecs: 20, roundRestSecs: 60, totalMins: 9.75 };
const session = buildSession([stations], settings);
// restSecs 0: rest intervals exist but are zero-length (the timer skips them)
const noGaps = buildSession([stations], { ...settings, restSecs: 0 });

const threeGroups: PartnerConfig = { on: true, groups: [['Ann'], ['Ben'], ['Cat']] };
const twoGroups: PartnerConfig = { on: true, groups: [['Ann', 'Ben'], ['Cat']] };

const at = (s: Session, index: number) => ({ session: s, index, remainingMs: 0, status: 'running' as const });
// rand () => 1 silences progressLine's random "minutes left" extra
const text = (s: Session, index: number, partner?: PartnerConfig) =>
  announcementText(at(s, index), partner, () => 1)?.text;

const find = (s: Session, pred: (iv: Session[number]) => boolean) => s.findIndex(pred);

const breather = find(session, (iv) => iv.kind === 'rest' && iv.station === 0);
const work1 = find(session, (iv) => iv.kind === 'work' && iv.station === 1);
const rest1 = find(session, (iv) => iv.kind === 'rest' && iv.station === 1);
const work2 = find(session, (iv) => iv.kind === 'work' && iv.station === 2);
const roundRest = find(session, (iv) => iv.kind === 'roundRest');

const anyOpener = [...REST_OPENERS, ...TEAM_REST_OPENERS];
const startsWithOpener = (t: string, pool: string[]) => pool.some((p) => t.startsWith(`${p} `));

describe('announcementText rotation cues (3+ groups)', () => {
  it('puts Rotate on the inter-station rest, not the following work', () => {
    const t = text(session, rest1, threeGroups)!;
    expect(t.endsWith('Rotate!')).toBe(true);
    expect(startsWithOpener(t, anyOpener)).toBe(true);
    expect(text(session, work2, threeGroups)).toBe('Go!');
  });

  it('keeps Rotate on the work start when there was no audible gap (restSecs 0)', () => {
    const w2 = find(noGaps, (iv) => iv.kind === 'work' && iv.station === 2);
    expect(noGaps[w2 - 1].duration).toBe(0);
    expect(text(noGaps, w2, threeGroups)).toBe('Rotate — go!');
  });

  it('never says Rotate on the warm-up breather', () => {
    expect(text(session, breather, threeGroups)).toBe('Rest.');
  });

  it('says Rotate on the round rest', () => {
    const t = text(session, roundRest, threeGroups)!;
    expect(t).toContain('Rotate — round 2 coming up. Round 1 of 2 done.');
    expect(startsWithOpener(t, anyOpener)).toBe(true);
  });

  it('first work set of the session just says Go', () => {
    expect(text(session, work1, threeGroups)).toBe('Go!');
  });
});

describe('announcementText rotation cues (1-2 groups)', () => {
  it('reframes the inter-station rest as a rotation roll call', () => {
    const t = text(session, rest1, twoGroups)!;
    expect(startsWithOpener(t, anyOpener)).toBe(true);
    expect(t).toContain('Rotate — ');
    expect(t).toContain('Ann, Ben:');
    expect(t).toContain('Cat:');
  });

  it('leaves the work roll call unchanged', () => {
    expect(text(session, work2, twoGroups)).toBe('Ann, Ben: l1. Cat: c1. Go!');
  });

  it('never says Rotate on the warm-up breather', () => {
    const t = text(session, breather, twoGroups)!;
    expect(t.startsWith('Next — ')).toBe(true);
    expect(t).not.toContain('Rotate');
  });

  it('reframes the round rest as a rotation roll call', () => {
    const t = text(session, roundRest, twoGroups)!;
    expect(startsWithOpener(t, anyOpener)).toBe(true);
    expect(t).toContain('Rotate — ');
  });
});

describe('announcementText rest openers', () => {
  it('opens a solo rest with a warm phrase instead of the plain Rest call', () => {
    const t = text(session, rest1)!;
    expect(startsWithOpener(t, REST_OPENERS)).toBe(true);
    expect(t.endsWith('Next up: l1.')).toBe(true);
    expect(t.startsWith('Rest.')).toBe(false);
    const rr = text(session, roundRest)!;
    expect(startsWithOpener(rr, REST_OPENERS)).toBe(true);
    expect(rr).toContain('Round 2 coming up.');
  });

  it('keeps the plain call on the warm-up breather — no set was completed', () => {
    expect(text(session, breather)).toBe('Rest. Next up: u1.');
  });

  it('never uses team phrasing in a solo session', () => {
    for (let i = 0; i < session.length; i++) {
      expect((text(session, i) ?? '').toLowerCase()).not.toContain('team');
    }
  });

  it('has about 30 phrases and cycles without repetition until the pool is spent', () => {
    expect(anyOpener.length).toBeGreaterThanOrEqual(30);
    const queue: string[] = [];
    const drawn = Array.from({ length: REST_OPENERS.length }, () =>
      drawFromCycle(REST_OPENERS, queue, Math.random),
    );
    expect(new Set(drawn).size).toBe(REST_OPENERS.length);
    // Next cycle refills and again exhausts the pool before repeating.
    const second = Array.from({ length: REST_OPENERS.length }, () =>
      drawFromCycle(REST_OPENERS, queue, Math.random),
    );
    expect(new Set(second).size).toBe(REST_OPENERS.length);
  });
});

describe('announcementText solo', () => {
  it('never says Rotate anywhere in a session', () => {
    for (let i = 0; i < session.length; i++) {
      expect(text(session, i) ?? '').not.toContain('Rotate');
    }
  });
});

describe('announcementText shout flag', () => {
  it('is true exactly for work intervals', () => {
    for (let i = 0; i < session.length; i++) {
      const line = announcementText(at(session, i), threeGroups, () => 1);
      if (!line) continue;
      expect(line.shout).toBe(session[i].kind === 'work');
    }
  });

  it('is silent on prep', () => {
    expect(announcementText(at(session, 0), threeGroups, () => 1)).toBeNull();
    expect(announcementText(at(session, 0), undefined, () => 1)).toBeNull();
  });
});
