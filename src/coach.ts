import type { PartnerConfig } from './types';
import type { TimerState } from './timer';
import { groupExercises, groupLabel, sessionDuration, stationsForRound } from './generator';

// Occasional progress line for rest periods — some rests, not all, so the
// coach doesn't turn into a narrator.
function progressLine(state: TimerState, rand: () => number): string {
  const iv = state.session[state.index];
  if (iv.kind === 'roundRest') {
    const works = state.session.filter((i) => i.kind === 'work');
    return ` Round ${iv.round} of ${works[works.length - 1].round} done.`;
  }
  // rest: iv.station = station just completed
  const stations = state.session.filter((i) => i.kind === 'work' && i.round === iv.round).length;
  if (iv.station + 1 === stations) return ' Last station of the round coming up.';
  if (rand() >= 0.35) return '';
  let secs = 0;
  for (let i = state.index; i < state.session.length; i++) {
    const x = state.session[i];
    if (x.round !== iv.round || x.kind === 'roundRest' || x.kind === 'cooldown') break;
    secs += x.duration;
  }
  const mins = Math.round(secs / 60);
  return mins >= 2 ? ` About ${mins} minutes left in this round.` : '';
}

// Warm word for the gap after a completed set — praise first, instructions
// second. Team-flavoured lines only make sense with 2+ people in the session.
export const REST_OPENERS = [
  'And relax.',
  "You've earned a breather.",
  'Good set!',
  'Nice work!',
  'Strong effort.',
  "That's how it's done.",
  'Shake it out.',
  'Set complete — breathe.',
  'Lovely work.',
  'That looked strong.',
  'Cracking effort.',
  'Well earned rest.',
  'Take a breath — you deserve it.',
  'Superb work.',
  'That set is in the bank.',
  'Another one down.',
  'Quality work.',
  'Big effort — nicely done.',
  'Chalk that one up.',
  'Job done — breathe easy.',
  'Smashed it.',
  'Beautiful finish.',
  'Strong to the last second.',
  "That's the standard.",
  'Proud of that one.',
  'Recover well.',
  'Grab a drink.',
  'Quick sip of water.',
  'Hydrate while you can.',
];
export const TEAM_REST_OPENERS = [
  'Well done team!',
  'Top work everyone!',
  'Great effort all round!',
  'Team effort — love it!',
  'Everyone crushed that!',
  'All of you — brilliant!',
];

/**
 * Pop from a shuffled cycle, refilling from the pool when empty — no phrase
 * repeats until the whole pool has been heard. Mutates `queue`.
 */
export function drawFromCycle(pool: string[], queue: string[], rand: () => number): string {
  if (queue.length === 0) {
    queue.push(...pool);
    for (let i = queue.length - 1; i > 0; i--) {
      // Math.min guards rand() === 1 (tests pass () => 1 for determinism)
      const j = Math.min(i, Math.floor(rand() * (i + 1)));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  return queue.pop()!;
}

// Module state: resets on page load, which is exactly a session's lifetime.
const openerQueues = new Map<string, string[]>();

function restOpener(partner: PartnerConfig | undefined, rand: () => number): string {
  const team = partner?.on && partner.groups.flat().length >= 2;
  let q = openerQueues.get(team ? 'team' : 'solo');
  if (!q) openerQueues.set(team ? 'team' : 'solo', (q = []));
  return drawFromCycle(team ? [...REST_OPENERS, ...TEAM_REST_OPENERS] : REST_OPENERS, q, rand);
}

/** The line the coach speaks when the interval changes, or null for silence. */
export function announcementText(
  state: TimerState,
  partner?: PartnerConfig,
  rand: () => number = Math.random,
): { text: string; shout: boolean } | null {
  const iv = state.session[state.index];
  // Work is the loud moment — the caller shouts it; rest/next-up stay calm.
  const line = (text: string) => ({ text, shout: iv.kind === 'work' });
  if (iv.kind === 'warmup' || iv.kind === 'cooldown') {
    if (iv.exercise!.id === 'cd-gap') {
      return line('Great work, everyone! Catch your breath — now get ready to cool down.');
    }
    // Same for everyone regardless of partner mode. Prefix the block's first move.
    const first = state.session[state.index - 1]?.kind !== iv.kind;
    const intro =
      first && iv.kind === 'warmup'
        ? // "Tasher" is deliberate: en-GB TTS reads "Tasha" as "TAY-sha".
          `I'm Tasher — your coach. For the next ${Math.round(sessionDuration(state.session) / 60)} minutes, you're MINE! `
        : '';
    const prefix = first ? (iv.kind === 'warmup' ? 'Warm up. ' : 'Cool down. ') : '';
    const cue = iv.exercise!.cue ? ` — ${iv.exercise!.cue}` : '';
    return line(`${intro}${prefix}${iv.exercise!.name}${cue}${iv.kind === 'warmup' ? '. Go!' : ''}`);
  }
  if (partner?.on && iv.kind !== 'prep') {
    const count = partner.groups.length;
    // Rotation lands on the gap AFTER a set — the moment the set ends — never
    // on the warm-up breather (rest with station 0: no one has a station yet).
    // Zero-length gaps are skipped by the timer, so with restSecs 0 the next
    // work start IS the end of the previous set and keeps the rotate cue.
    const prev = state.session[state.index - 1];
    const hadGap = !!prev && (prev.kind === 'rest' || prev.kind === 'roundRest') && prev.duration > 0;
    const afterAStation = iv.kind === 'roundRest' || (iv.kind === 'rest' && iv.station >= 1);
    if (count >= 3) {
      if (iv.kind === 'work') return line(hadGap ? 'Go!' : 'Rotate — go!');
      if (iv.kind === 'rest') {
        return line(
          `${afterAStation ? `${restOpener(partner, rand)} Rotate!` : 'Rest.'}${progressLine(state, rand)}`,
        );
      }
      return line(
        `${restOpener(partner, rand)} Rotate — round ${iv.round + 1} coming up.${progressLine(state, rand)}`,
      );
    }
    // 1-2 groups: named roll call (for count 2 this emits the exact
    // pre-group-mode strings). roundRest previews the next round's set.
    const round = iv.kind === 'roundRest' ? iv.round + 1 : iv.round;
    const station = iv.kind === 'work' ? iv.station : iv.kind === 'rest' ? iv.station + 1 : 1;
    const call = groupExercises(stationsForRound(state.session, round), station, count)
      .map((e, i) => `${groupLabel(partner.groups[i], i)}: ${e.name}`)
      .join('. ');
    if (iv.kind === 'work') return line(`${call}. Go!`);
    return line(
      afterAStation
        ? `${restOpener(partner, rand)} Rotate — ${call}.${progressLine(state, rand)}`
        : `Next — ${call}.${progressLine(state, rand)}`,
    );
  }
  if (iv.kind === 'work') return line(`${iv.exercise!.name}. Go!`);
  if (iv.kind === 'rest') {
    const cue = iv.exercise!.cue ? ` — ${iv.exercise!.cue}` : '';
    // The opener stands in for "Rest." after a completed set; the warm-up
    // breather (station 0) keeps the plain call — no set was completed.
    const intro = iv.station >= 1 ? restOpener(partner, rand) : 'Rest.';
    return line(`${intro} Next up: ${iv.exercise!.name}${cue}.${progressLine(state, rand)}`);
  }
  if (iv.kind === 'roundRest') {
    return line(`${restOpener(partner, rand)} Round ${iv.round + 1} coming up.${progressLine(state, rand)}`);
  }
  return null; // prep
}
