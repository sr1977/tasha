import type { Session } from './types';

export interface TimerState {
  session: Session;
  index: number;
  remainingMs: number;
  status: 'running' | 'paused' | 'done';
}

export type TimerAction =
  | { type: 'tick'; elapsedMs: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'replace'; session: Session };

export function initTimer(session: Session): TimerState {
  return { session, index: 0, remainingMs: session[0].duration * 1000, status: 'running' };
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  const { session, index } = state;
  const durMs = (i: number) => session[i].duration * 1000;

  switch (action.type) {
    case 'pause':
      return state.status === 'running' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'running' } : state;
    case 'next': {
      if (state.status === 'done') return state;
      if (index + 1 >= session.length) return { ...state, remainingMs: 0, status: 'done' };
      return { ...state, index: index + 1, remainingMs: durMs(index + 1) };
    }
    case 'prev': {
      if (state.status === 'done') return state;
      const elapsed = durMs(index) - state.remainingMs;
      if (elapsed > 2000 || index === 0) return { ...state, remainingMs: durMs(index) };
      return { ...state, index: index - 1, remainingMs: durMs(index - 1) };
    }
    case 'tick': {
      if (state.status !== 'running') return state;
      let remaining = state.remainingMs - action.elapsedMs;
      let i = index;
      while (remaining <= 0) {
        if (i + 1 >= session.length) return { ...state, index: i, remainingMs: 0, status: 'done' };
        i++;
        remaining += durMs(i);
      }
      return { ...state, index: i, remainingMs: remaining };
    }
    case 'replace':
      return { ...state, session: action.session };
  }
}
