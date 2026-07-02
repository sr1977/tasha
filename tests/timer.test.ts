import { describe, expect, it } from 'vitest';
import { initTimer, timerReducer, type TimerState } from '../src/timer';
import type { Session } from '../src/types';

const session: Session = [
  { kind: 'prep', duration: 2, round: 1, station: 0 },
  { kind: 'work', duration: 5, round: 1, station: 1 },
  { kind: 'rest', duration: 3, round: 1, station: 1 },
];

const tick = (s: TimerState, ms: number) => timerReducer(s, { type: 'tick', elapsedMs: ms });

describe('timer', () => {
  it('initialises at the first interval, running', () => {
    expect(initTimer(session)).toEqual({ session, index: 0, remainingMs: 2000, status: 'running' });
  });

  it('tick reduces remaining time', () => {
    expect(tick(initTimer(session), 500).remainingMs).toBe(1500);
  });

  it('tick crossing a boundary advances and carries overflow', () => {
    const s = tick(initTimer(session), 2500);
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(4500);
  });

  it('tick past the final interval finishes the session', () => {
    const atLast: TimerState = { session, index: 2, remainingMs: 1000, status: 'running' };
    const s = tick(atLast, 1500);
    expect(s.status).toBe('done');
    expect(s.remainingMs).toBe(0);
  });

  it('pause freezes ticks; resume unfreezes', () => {
    const paused = timerReducer(initTimer(session), { type: 'pause' });
    expect(paused.status).toBe('paused');
    expect(tick(paused, 1000)).toEqual(paused);
    const resumed = timerReducer(paused, { type: 'resume' });
    expect(resumed.status).toBe('running');
    expect(tick(resumed, 1000).remainingMs).toBe(1000);
  });

  it('next jumps to the following interval at full duration', () => {
    const s = timerReducer(initTimer(session), { type: 'next' });
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(5000);
  });

  it('next on the last interval finishes the session', () => {
    const atLast: TimerState = { session, index: 2, remainingMs: 1000, status: 'running' };
    expect(timerReducer(atLast, { type: 'next' }).status).toBe('done');
  });

  it('prev restarts the current interval when >2s elapsed', () => {
    const mid: TimerState = { session, index: 1, remainingMs: 2500, status: 'running' }; // 2.5s elapsed
    const s = timerReducer(mid, { type: 'prev' });
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(5000);
  });

  it('prev goes to the previous interval when <2s elapsed', () => {
    const early: TimerState = { session, index: 1, remainingMs: 4500, status: 'running' }; // 0.5s elapsed
    const s = timerReducer(early, { type: 'prev' });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(2000);
  });

  it('prev at the first interval restarts it', () => {
    const s = timerReducer(tick(initTimer(session), 1500), { type: 'prev' });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(2000);
  });

  it('tick spanning multiple intervals carries overflow across each boundary', () => {
    // 8000ms from start: prep(2000) + work(5000) consumed, 1000 into rest -> 2000 left
    const s = tick(initTimer(session), 8000);
    expect(s.index).toBe(2);
    expect(s.remainingMs).toBe(2000);
    expect(s.status).toBe('running');
  });

  it('tick landing exactly on a boundary advances to the next interval at full duration', () => {
    const s = tick(initTimer(session), 2000);
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(5000);
  });

  it('prev at exactly 2s elapsed goes to the previous interval (strict > threshold)', () => {
    const atTwo: TimerState = { session, index: 1, remainingMs: 3000, status: 'running' }; // exactly 2s elapsed
    const s = timerReducer(atTwo, { type: 'prev' });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(2000);
  });

  it('pause and resume on a done state are no-ops', () => {
    const done: TimerState = { session, index: 2, remainingMs: 0, status: 'done' };
    expect(timerReducer(done, { type: 'pause' })).toEqual(done);
    expect(timerReducer(done, { type: 'resume' })).toEqual(done);
  });

  it('done state ignores further actions', () => {
    const done: TimerState = { session, index: 2, remainingMs: 0, status: 'done' };
    expect(timerReducer(done, { type: 'next' })).toEqual(done);
    expect(timerReducer(done, { type: 'prev' })).toEqual(done);
    expect(tick(done, 1000)).toEqual(done);
  });
});
