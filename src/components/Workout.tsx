import { useEffect, useReducer, useRef, useState } from 'react';
import type { Session } from '../types';
import { initTimer, timerReducer, type TimerState } from '../timer';
import { beep, cancelSpeech, speak, transitionTone } from '../audio';
import { sessionDuration } from '../generator';
import { fmt } from './Setup';
import { activePlaylist, createPlayer, DIP_VOLUME, WORK_VOLUME, type PlayerHandle } from '../spotify';

function announce(state: TimerState): void {
  const iv = state.session[state.index];
  if (iv.kind === 'work') speak(`${iv.exercise!.name}. Go!`);
  else if (iv.kind === 'rest') speak(`Rest. Next up: ${iv.exercise!.name}`);
  else if (iv.kind === 'roundRest') speak(`Round ${iv.round + 1} coming up`);
}

export function Workout({ session, onExit }: { session: Session; onExit: () => void }) {
  const [state, dispatch] = useReducer(timerReducer, session, initTimer);

  const playerRef = useRef<PlayerHandle | null>(null);
  const [track, setTrack] = useState<string | null>(null);

  // Live status/kind refs so the async player-ready callback sees current state.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const kindRef = useRef(state.session[state.index].kind);
  kindRef.current = state.session[state.index].kind;

  // Music lifecycle: get the shared player + start the active playlist on
  // mount, pause on unmount (the player is a page-lifetime singleton — never
  // disconnect it here). All failures leave a silent session.
  useEffect(() => {
    const pl = activePlaylist();
    if (!pl) return;
    let cancelled = false;
    void createPlayer()
      .then((p) => {
        if (!p || cancelled) return;
        playerRef.current = p;
        p.onTrack((label) => setTrack(label));
        p.setBaseVolume(kindRef.current === 'work' ? WORK_VOLUME : DIP_VOLUME);
        void p
          .play(pl.uri)
          .then(() => {
            if (statusRef.current !== 'running') p.pause();
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      playerRef.current?.pause();
      playerRef.current = null;
    };
  }, []);

  // Music follows the timer: paused/done -> pause, running -> resume.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (state.status === 'running') p.resume();
    else p.pause();
  }, [state.status]);

  // Interval-aware volume: full during work, dipped otherwise.
  useEffect(() => {
    const kind = state.session[state.index].kind;
    playerRef.current?.setBaseVolume(kind === 'work' ? WORK_VOLUME : DIP_VOLUME);
  }, [state.index, state.session]);

  // Drift-free ticking: measure real elapsed time between ticks.
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', elapsedMs: now - last });
      last = now;
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Stop any in-flight speech when the workout unmounts (e.g. user exits).
  useEffect(() => cancelSpeech, []);

  // Keep the screen awake during the workout.
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        if (cancelled) void l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      lock?.release().catch(() => {});
    };
  }, []);

  // Keyboard: space = pause/resume, arrows = skip, N = skip track.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: state.status === 'paused' ? 'resume' : 'pause' });
      } else if (e.code === 'ArrowRight') dispatch({ type: 'next' });
      else if (e.code === 'ArrowLeft') dispatch({ type: 'prev' });
      else if (e.code === 'KeyN') playerRef.current?.skipTrack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status]);

  // Audio cues: transition tone + announcement on interval change,
  // countdown beeps at 3/2/1, completion announcement.
  const secsLeft = Math.ceil(state.remainingMs / 1000);
  const prevIndex = useRef(state.index);
  const prevSecs = useRef(secsLeft);
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (state.status === 'done') {
      if (prevStatus.current !== 'done') {
        transitionTone();
        speak('Session complete. Well done!');
        playerRef.current?.duck();
        prevStatus.current = 'done';
      }
      return;
    }
    prevStatus.current = state.status;
    if (state.index !== prevIndex.current) {
      prevIndex.current = state.index;
      prevSecs.current = secsLeft;
      transitionTone();
      announce(state);
      playerRef.current?.duck();
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) beep();
      return;
    }
    if (secsLeft !== prevSecs.current) {
      prevSecs.current = secsLeft;
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) beep();
    }
  });

  if (state.status === 'done') {
    return (
      <div className="workout done">
        <div className="label">Session complete 🎉</div>
        <p className="meta">
          {session[session.length - 1].round} rounds · {fmt(sessionDuration(session))}
        </p>
        <button onClick={onExit}>Back to setup</button>
      </div>
    );
  }

  const iv = state.session[state.index];
  const stationsPerRound = Math.max(...session.map((i) => i.station));
  const totalRounds = session[session.length - 1].round;
  const total = sessionDuration(session);
  const elapsed =
    session.slice(0, state.index).reduce((t, i) => t + i.duration, 0) +
    (iv.duration - state.remainingMs / 1000);

  return (
    <div className={`workout ${iv.kind}${state.status === 'paused' ? ' paused' : ''}`}>
      <button className="exit" onClick={onExit}>Exit</button>
      <div className="meta">
        Round {iv.round}/{totalRounds}
        {iv.kind === 'work' && ` · Station ${iv.station}/${stationsPerRound}`}
        {state.status === 'paused' && ' · PAUSED'}
      </div>
      <div className="label">
        {iv.kind === 'work' ? iv.exercise!.name : iv.kind === 'prep' ? 'Get ready' : 'Rest'}
      </div>
      <div className="clock">{secsLeft >= 60 ? fmt(secsLeft) : secsLeft}</div>
      {iv.kind !== 'work' && iv.exercise && <div className="next">Next: {iv.exercise.name}</div>}
      <div className="controls">
        <button onClick={() => dispatch({ type: 'prev' })} title="Back (←)">⏮</button>
        <button
          onClick={() => dispatch({ type: state.status === 'paused' ? 'resume' : 'pause' })}
          title="Pause/resume (space)"
        >
          {state.status === 'paused' ? '▶' : '⏸'}
        </button>
        <button onClick={() => dispatch({ type: 'next' })} title="Skip (→)">⏭</button>
      </div>
      <progress value={elapsed} max={total} />
      {track && (
        <div className="track">
          ♪ {track}
          <button onClick={() => playerRef.current?.skipTrack()} title="Skip track (N)">⏭♪</button>
        </div>
      )}
    </div>
  );
}
