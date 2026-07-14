import { useEffect, useReducer, useRef, useState } from 'react';
import type { Exercise, PartnerConfig, Session } from '../types';
import { initTimer, timerReducer, type TimerState } from '../timer';
import { beep, cancelSpeech, encouragement, SHOUT, speak, transitionTone } from '../audio';
import { banReplacement, groupExercises, groupLabel, replaceInSession, sessionDuration, stationsForRound } from '../generator';
import { fmt } from './Setup';
import { DumbbellIcon } from './DumbbellIcon';
import { activePlaylist, cooldownPlaylist, createPlayer, DIP_VOLUME, WORK_VOLUME, type PlayerHandle } from '../spotify';
import { createVoiceControl, voiceSupported } from '../voice';

function announce(state: TimerState, partner?: PartnerConfig): void {
  const iv = state.session[state.index];
  // Work is the loud moment — shout it; rest/next-up stay calm.
  const say = (text: string) => speak(text, iv.kind === 'work' ? SHOUT : {});
  if (partner?.on && iv.kind !== 'prep') {
    const count = partner.groups.length;
    if (count >= 3) {
      if (iv.kind === 'work') say('Rotate — go!');
      else if (iv.kind === 'rest') say('Rest');
      else say(`Round ${iv.round + 1} coming up`);
      return;
    }
    // 1-2 groups: named roll call (for count 2 this emits the exact
    // pre-group-mode strings). roundRest previews the next round's set.
    const round = iv.kind === 'roundRest' ? iv.round + 1 : iv.round;
    const station = iv.kind === 'work' ? iv.station : iv.kind === 'rest' ? iv.station + 1 : 1;
    const call = groupExercises(stationsForRound(state.session, round), station, count)
      .map((e, i) => `${groupLabel(partner.groups[i], i)}: ${e.name}`)
      .join('. ');
    say(iv.kind === 'work' ? `${call}. Go!` : `Next — ${call}`);
    return;
  }
  if (iv.kind === 'work') say(`${iv.exercise!.name}. Go!`);
  else if (iv.kind === 'rest') {
    const cue = iv.exercise!.cue ? ` — ${iv.exercise!.cue}` : '';
    say(`Rest. Next up: ${iv.exercise!.name}${cue}`);
  } else if (iv.kind === 'roundRest') say(`Round ${iv.round + 1} coming up`);
}

export function Workout({
  session,
  pool,
  onBan,
  partner,
  onExit,
}: {
  session: Session;
  pool: Exercise[];
  onBan: (e: Exercise) => void;
  partner?: PartnerConfig;
  onExit: () => void;
}) {
  const [state, dispatch] = useReducer(timerReducer, session, initTimer);

  const playerRef = useRef<PlayerHandle | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('tasha.voice') !== '0');
  const [picking, setPicking] = useState(false);

  // Live status/kind refs so the async player-ready callback sees current state.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const kindRef = useRef(state.session[state.index].kind);
  kindRef.current = state.session[state.index].kind;

  const ban = () => {
    const iv = state.session[state.index];
    if (iv.kind !== 'work' || !iv.exercise) return;
    // Exercises actually in use from the current interval onward — round-1
    // snapshots go stale once a previous ban has already replaced something.
    const inUse = new Map<string, Exercise>();
    state.session.forEach((x, i) => {
      if (i >= state.index && x.kind === 'work' && x.exercise) inUse.set(x.exercise.id, x.exercise);
    });
    const replacement = banReplacement(pool, [...inUse.values()], iv.exercise);
    onBan(iv.exercise);
    if (replacement) {
      dispatch({
        type: 'replace',
        session: replaceInSession(state.session, state.index, iv.exercise.id, replacement),
      });
    }
  };

  // Swap the current station's exercise for a chosen one, now and for the rest
  // of the session (fromIndex = index-1 so the live interval updates too).
  const changeExercise = (replacement: Exercise) => {
    const cur = state.session[state.index];
    setPicking(false);
    if (cur.kind !== 'work' || !cur.exercise || replacement.id === cur.exercise.id) return;
    dispatch({
      type: 'replace',
      session: replaceInSession(state.session, state.index - 1, cur.exercise.id, replacement),
    });
  };

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

  // Music follows the timer: running -> resume, paused -> pause,
  // done -> cool-down playlist if configured, else pause.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (state.status === 'running') {
      p.resume();
    } else if (state.status === 'done') {
      const cd = cooldownPlaylist();
      if (cd) {
        p.setBaseVolume(DIP_VOLUME);
        void p.play(cd.uri).catch(() => {});
      } else {
        p.pause();
      }
    } else {
      p.pause();
    }
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

  // Voice control: mic listens only while the workout screen is mounted.
  useEffect(() => {
    if (!voiceOn) return;
    const vc = createVoiceControl((cmd) => {
      if (cmd === 'pause') dispatch({ type: 'pause' });
      else if (cmd === 'resume') dispatch({ type: 'resume' });
      else if (cmd === 'skip') dispatch({ type: 'next' });
      else if (cmd === 'back') dispatch({ type: 'prev' });
      else playerRef.current?.skipTrack();
    });
    if (!vc) return;
    return () => vc.stop();
  }, [voiceOn]);

  // Audio cues: transition tone + announcement on interval change,
  // countdown beeps at 3/2/1, completion announcement.
  const secsLeft = Math.ceil(state.remainingMs / 1000);
  const prevIndex = useRef(state.index);
  const prevSecs = useRef(secsLeft);
  const prevStatus = useRef(state.status);
  const halfwayRef = useRef(-1); // interval index that already got its halfway call
  useEffect(() => {
    if (state.status === 'done') {
      if (prevStatus.current !== 'done') {
        transitionTone();
        speak('Session complete. Well done!', SHOUT);
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
      announce(state, partner);
      playerRef.current?.duck();
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) {
        beep();
        playerRef.current?.duck(0.5, 1300); // dip only lightly for the countdown clicks
      }
      return;
    }
    if (secsLeft !== prevSecs.current) {
      const prev = prevSecs.current;
      prevSecs.current = secsLeft;
      if (state.status === 'running' && secsLeft >= 1 && secsLeft <= 3) {
        beep();
        playerRef.current?.duck(0.5, 1300); // dip only lightly for the countdown clicks
      }
      const cur = state.session[state.index];
      const half = Math.ceil(cur.duration / 2);
      if (
        state.status === 'running' &&
        cur.kind === 'work' &&
        cur.duration >= 10 && // short intervals: halfway collides with 3-2-1 beeps
        prev > half &&
        secsLeft <= half &&
        halfwayRef.current !== state.index
      ) {
        halfwayRef.current = state.index;
        // Mid-set is the one collision-free speech slot — use it to shout a
        // random named encouragement, falling back to the plain halfway cue.
        const people = partner?.on ? partner.groups.flat() : [];
        speak(
          people.length > 0
            ? encouragement(people[Math.floor(Math.random() * people.length)])
            : 'Halfway!',
          SHOUT,
        );
        playerRef.current?.duck();
      }
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
  const partnerOn = partner?.on ?? false;
  const roundStations = (round: number) => stationsForRound(state.session, round);
  const nextWork = state.session.slice(state.index + 1).find((x) => x.kind === 'work') ?? null;
  const totalRounds = session[session.length - 1].round;
  const total = sessionDuration(session);
  const elapsed =
    session.slice(0, state.index).reduce((t, i) => t + i.duration, 0) +
    (iv.duration - state.remainingMs / 1000);

  return (
    <div className={`workout ${iv.kind}${state.status === 'paused' ? ' paused' : ''}`}>
      <button className="exit" onClick={onExit}>Exit</button>
      {voiceSupported() && (
        <button
          className={`mic${voiceOn ? '' : ' off'}`}
          onClick={() => {
            const v = !voiceOn;
            setVoiceOn(v);
            localStorage.setItem('tasha.voice', v ? '1' : '0');
          }}
          title={voiceOn ? 'Voice control on — say pause / go / skip / back / next track' : 'Voice control off'}
        >
          🎤
        </button>
      )}
      <div className="meta">
        Round {iv.round}/{totalRounds}
        {iv.kind === 'work' && ` · Station ${iv.station}/${stationsPerRound}`}
        {state.status === 'paused' && ' · PAUSED'}
      </div>
      {partnerOn && iv.kind === 'work' ? (
        <div className="label partner" key={state.index}>
          {groupExercises(roundStations(iv.round), iv.station, partner!.groups.length).map((e, i) => (
            <div key={i}>
              {groupLabel(partner!.groups[i], i)}: {e.name}
              {e.equipment === 'dumbbells' && <DumbbellIcon />}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="label" key={state.index}>
            {iv.kind === 'work' ? iv.exercise!.name : iv.kind === 'prep' ? 'Get ready' : 'Rest'}
            {iv.kind === 'work' && iv.exercise!.equipment === 'dumbbells' && <DumbbellIcon />}
          </div>
          {!partnerOn && iv.kind === 'work' && iv.exercise?.cue && (
            <div className="cue">{iv.exercise.cue}</div>
          )}
        </>
      )}
      <div className="clock">{secsLeft >= 60 ? fmt(secsLeft) : secsLeft}</div>
      {iv.kind === 'work' && nextWork && (
        <div className="next">
          Next{partnerOn ? ' — ' : ': '}
          {partnerOn
            ? groupExercises(roundStations(nextWork.round), nextWork.station, partner!.groups.length)
                .map((e, i) => `${groupLabel(partner!.groups[i], i)}: ${e.name}`)
                .join(' · ')
            : nextWork.exercise!.name}
        </div>
      )}
      {iv.kind !== 'work' &&
        (partnerOn ? (
          iv.kind !== 'prep' && nextWork && (
            <div className="next">
              Next —{' '}
              {groupExercises(roundStations(nextWork.round), nextWork.station, partner!.groups.length)
                .map((e, i) => `${groupLabel(partner!.groups[i], i)}: ${e.name}`)
                .join(' · ')}
            </div>
          )
        ) : (
          iv.exercise && <div className="next">Next: {iv.exercise.name}</div>
        ))}
      <div className="controls">
        <button onClick={() => dispatch({ type: 'prev' })} title="Back (←)">⏮</button>
        <button
          onClick={() => dispatch({ type: state.status === 'paused' ? 'resume' : 'pause' })}
          title="Pause/resume (space)"
        >
          {state.status === 'paused' ? '▶' : '⏸'}
        </button>
        <button onClick={() => dispatch({ type: 'next' })} title="Skip (→)">⏭</button>
        {iv.kind === 'work' && (
          <button onClick={() => setPicking(true)} title="Change this exercise">🔁</button>
        )}
        {iv.kind === 'work' && pool.find((p) => p.id === iv.exercise!.id)?.pref !== 'ban' && (
          <button onClick={ban} title="Never again — ban this exercise and swap it out">👎</button>
        )}
      </div>
      {picking && iv.kind === 'work' && (
        <div className="picker" onClick={() => setPicking(false)}>
          <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
            <div className="picker-title">Change {iv.exercise!.name} to…</div>
            <ul>
              {pool
                .filter((e) => e.pref !== 'ban')
                .map((e) => (
                  <li key={e.id}>
                    <button onClick={() => changeExercise(e)}>
                      {e.equipment === 'dumbbells' && <DumbbellIcon />}
                      {e.name} <small>({e.category})</small>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
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
