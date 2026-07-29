import { useEffect, useReducer, useRef, useState } from 'react';
import type { Exercise, PartnerConfig, Session } from '../types';
import { initTimer, timerReducer } from '../timer';
import { activityShout, beep, cancelSpeech, type CalloutSlot, encouragement, formShout, halfwayShout, jab, offSpeaking, onSpeaking, pickCalloutSlots, pushShout, SHOUT, speak, teamShout, transitionTone, warmupJibe } from '../audio';
import { announcementText } from '../coach';
import { banReplacement, groupExercises, groupLabel, replaceInSession, sessionDuration, stationsForRound } from '../generator';
import { fmt } from './Setup';
import { EquipmentIcon } from './EquipmentIcon';
import { activePlaylist, cooldownPlaylist, createPlayer, DIP_VOLUME, WORK_VOLUME, type PlayerHandle } from '../spotify';
import { createVoiceControl, voiceSupported } from '../voice';

// How often a mid-set callout is aimed at someone by name instead of a generic
// shout. Hearing your own name mid-set is the point of keeping a roster; the
// remainder keeps her from sounding like a register being read out.
const NAME_RATE = 0.85;

// Of the callouts that name someone, this share address the whole session
// instead. Solo sessions never use these.
const TEAM_RATE = 0.25;

// Share of mid-set callouts tied to the exercise's equipment rather than a
// generic line. Applies to halfway + spurs; jabs/form hints untouched.
const ACTIVITY_RATE = 0.3;

export function Workout({
  session,
  pool,
  onBan,
  partner,
  roster = [],
  nasty = 0.25,
  onExit,
}: {
  session: Session;
  pool: Exercise[];
  onBan: (e: Exercise) => void;
  partner?: PartnerConfig;
  /** Everyone known, used to name people when group mode is off. */
  roster?: string[];
  /** 0–1: chance the late-set callout is a jab instead of encouragement. */
  nasty?: number;
  onExit: () => void;
}) {
  const [state, dispatch] = useReducer(timerReducer, session, initTimer);

  // Who Tasha shouts at by name. Group mode makes the bench explicit, so only
  // the assigned people count; without it the roster is the best answer we have
  // — a solo session should still hear a name, not "buttercup".
  const people = partner?.on ? partner.groups.flat() : roster;

  const playerRef = useRef<PlayerHandle | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('tasha.voice') !== '0');
  const [picking, setPicking] = useState(false);

  // Live status/kind refs so the async player-ready callback sees current state.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const kindRef = useRef(state.session[state.index].kind);
  kindRef.current = state.session[state.index].kind;
  const cooldownStartedRef = useRef(false); // cool-down playlist already started

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
      if (cd && cooldownStartedRef.current) {
        // Already switched when the stretch block started — just keep playing.
      } else if (cd) {
        p.setBaseVolume(DIP_VOLUME);
        void p.play(cd.uri).catch(() => {});
      } else {
        p.pause();
      }
    } else {
      p.pause();
    }
  }, [state.status]);

  // Interval-aware volume: full during work, dipped otherwise. Entering the
  // cool-down block switches to the cool-down playlist (once).
  useEffect(() => {
    const kind = state.session[state.index].kind;
    playerRef.current?.setBaseVolume(kind === 'work' ? WORK_VOLUME : DIP_VOLUME);
    if (kind === 'cooldown' && !cooldownStartedRef.current) {
      cooldownStartedRef.current = true;
      const cd = cooldownPlaylist();
      if (cd) void playerRef.current?.play(cd.uri).catch(() => {});
    }
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

  // Duck follows actual speech: the fixed-length duck() after each speak() only
  // bridges the TTS fetch; once playback starts the hold keeps the music down
  // until the last word, so beeps and later dips can't fade it up mid-sentence.
  useEffect(() => {
    const cb = (speaking: boolean) => {
      const p = playerRef.current;
      if (!p) return;
      if (speaking) p.holdForSpeech();
      else p.releaseSpeech();
    };
    onSpeaking(cb);
    return () => offSpeaking(cb);
  }, []);

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
  const jabRef = useRef(-1); // interval index that already got its late callout
  const earlyRef = useRef(-1); // interval index that already got its early callout
  // Fair rotation: everyone gets a turn before anyone repeats (shuffled cycles).
  const encQueueRef = useRef<string[]>([]);
  const jabQueueRef = useRef<string[]>([]);
  const drawName = (queue: { current: string[] }, people: string[]): string => {
    if (queue.current.length === 0) {
      const a = [...people];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      queue.current = a;
    }
    return queue.current.pop()!;
  };
  // Every form cue an exercise offers, headline first.
  const allCues = (e: Exercise): string[] =>
    [e.cue, ...(e.cues ?? [])].filter((c): c is string => Boolean(c));
  // The "named" side of a callout draw: usually one person, sometimes the whole
  // session — "come on team" to one person would be wrong, hence the >= 2.
  const namedOrTeam = () =>
    people.length >= 2 && Math.random() < TEAM_RATE
      ? teamShout()
      : encouragement(drawName(encQueueRef, people));
  // Drawn once per set and cached, so the choice is stable across ticks.
  const slotsRef = useRef<{ index: number; slots: CalloutSlot[] }>({ index: -1, slots: [] });
  const calloutSlots = (index: number, secs: number): CalloutSlot[] => {
    if (slotsRef.current.index !== index) {
      slotsRef.current = { index, slots: pickCalloutSlots(secs) };
    }
    return slotsRef.current.slots;
  };
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
      const line = announcementText(state, partner);
      if (line) speak(line.text, line.shout ? SHOUT : {});
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
      // Exercises in play right now: the station's one exercise, or one per
      // group in group mode (entries can be undefined — filter them).
      const activeNow: Exercise[] = (partner?.on
        ? groupExercises(stationsForRound(state.session, cur.round), cur.station, partner.groups.length)
        : [cur.exercise!]
      ).filter((e): e is Exercise => Boolean(e));
      // One mid-set line: exercise-keyed at ACTIVITY_RATE — a form cue for the
      // move being done, or an equipment line when the exercise has no cues —
      // else the existing named-or-impersonal draw. `impersonal` is the
      // fallback pool for the slot.
      const midSetLine = (impersonal: () => string): string => {
        if (activeNow.length > 0 && Math.random() < ACTIVITY_RATE) {
          const ex = activeNow[Math.floor(Math.random() * activeNow.length)];
          const name =
            people.length > 0 && Math.random() < NAME_RATE
              ? drawName(encQueueRef, people)
              : undefined;
          const cues = allCues(ex);
          return cues.length > 0 ? formShout(cues, name) : activityShout(ex.equipment, name);
        }
        return people.length > 0 && Math.random() < NAME_RATE ? namedOrTeam() : impersonal();
      };
      if (
        state.status === 'running' &&
        cur.kind === 'work' &&
        cur.duration >= 10 && // short intervals: halfway collides with 3-2-1 beeps
        prev > half &&
        secsLeft <= half &&
        halfwayRef.current !== state.index &&
        calloutSlots(state.index, cur.duration).includes('halfway')
      ) {
        halfwayRef.current = state.index;
        // Mid-set is the one collision-free speech slot — mix it up between a
        // generic halfway shout and a named encouragement (when there's a roster).
        speak(midSetLine(halfwayShout), SHOUT);
        playerRef.current?.duck();
      }
      // Warm-up moves get their witty jibe at the halfway point, not the
      // announce — keeps the interval-start speech short.
      if (
        state.status === 'running' &&
        cur.kind === 'warmup' &&
        prev > half &&
        secsLeft <= half &&
        halfwayRef.current !== state.index
      ) {
        halfwayRef.current = state.index;
        speak(warmupJibe(), SHOUT);
        playerRef.current?.duck();
      }
      // Cool-down stretches work one side at a time — call the swap at halfway.
      if (
        state.status === 'running' &&
        cur.kind === 'cooldown' &&
        cur.exercise!.cue?.startsWith('each') && // not the "great work" breather
        prev > half &&
        secsLeft <= half &&
        halfwayRef.current !== state.index
      ) {
        halfwayRef.current = state.index;
        speak(cur.exercise!.category === 'upper' ? 'Switch arms' : 'Switch legs');
        playerRef.current?.duck();
      }
      // Extra work-set callouts around the halfway call: an early spur at
      // quarter-elapsed and a late one at quarter-remaining. Long sets only —
      // they need clear air between announce, halfway, and the 3-2-1 beeps.
      const spur = () => midSetLine(pushShout);
      const early = cur.duration - Math.ceil(cur.duration / 4);
      if (
        state.status === 'running' &&
        cur.kind === 'work' &&
        cur.duration >= 30 &&
        prev > early &&
        secsLeft <= early &&
        earlyRef.current !== state.index &&
        calloutSlots(state.index, cur.duration).includes('early')
      ) {
        earlyRef.current = state.index;
        // Sometimes a form hint instead of a spur — names the exercise so the
        // right person listens in group mode.
        const active = activeNow.filter((e) => e.cue);
        const hinted = active.length > 0 && Math.random() < 0.4 ? active[Math.floor(Math.random() * active.length)] : null;
        const hintCues = hinted ? allCues(hinted) : [];
        speak(
          hinted
            ? `Form check on the ${hinted.name} — ${hintCues[Math.floor(Math.random() * hintCues.length)]}!`
            : spur(),
          SHOUT,
        );
        playerRef.current?.duck();
      }
      const late = Math.ceil(cur.duration / 4);
      if (
        state.status === 'running' &&
        cur.kind === 'work' &&
        cur.duration >= 30 &&
        prev > late &&
        secsLeft <= late &&
        jabRef.current !== state.index &&
        calloutSlots(state.index, cur.duration).includes('late')
      ) {
        jabRef.current = state.index;
        // Nasty-dial odds of a drill-sergeant jab; no roster -> cheeky vocative.
        speak(
          Math.random() < nasty
            ? jab(people.length > 0 ? drawName(jabQueueRef, people) : undefined)
            : spur(),
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
        {iv.kind === 'warmup' ? 'Warm-up' : iv.kind === 'cooldown' ? 'Cool-down' : `Round ${iv.round}/${totalRounds}`}
        {iv.kind === 'work' && ` · Station ${iv.station}/${stationsPerRound}`}
        {state.status === 'paused' && ' · PAUSED'}
      </div>
      {partnerOn && iv.kind === 'work' ? (
        <div className="label partner" key={state.index}>
          {groupExercises(roundStations(iv.round), iv.station, partner!.groups.length).map((e, i) => (
            <div key={i}>
              {groupLabel(partner!.groups[i], i)}: {e.name}
              <EquipmentIcon equipment={e.equipment} />
            </div>
          ))}
        </div>
      ) : (iv.kind === 'rest' || iv.kind === 'roundRest') && nextWork ? (
        // Rest: next exercise gets equal billing with the rest call itself.
        <div className="label partner" key={state.index}>
          <div>Rest</div>
          {/* .next inside the label keeps its small-print size — reads as a header */}
          <div className="next">Up next</div>
          {partnerOn ? (
            groupExercises(roundStations(nextWork.round), nextWork.station, partner!.groups.length).map(
              (e, i) => (
                <div key={i}>
                  {groupLabel(partner!.groups[i], i)}: {e.name}
                  <EquipmentIcon equipment={e.equipment} />
                </div>
              ),
            )
          ) : (
            <div>
              {nextWork.exercise!.name}
              <EquipmentIcon equipment={nextWork.exercise!.equipment} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="label" key={state.index}>
            {iv.kind === 'work' || iv.kind === 'warmup' || iv.kind === 'cooldown' ? iv.exercise!.name : iv.kind === 'prep' ? 'Get ready' : 'Rest'}
            {iv.kind === 'work' && <EquipmentIcon equipment={iv.exercise!.equipment} />}
          </div>
          {(iv.kind === 'warmup' || iv.kind === 'cooldown' || (!partnerOn && iv.kind === 'work')) && iv.exercise?.cue && (
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
      {(iv.kind === 'prep' || iv.kind === 'warmup' || iv.kind === 'cooldown') &&
        (['warmup', 'cooldown'].includes(state.session[state.index + 1]?.kind ?? '') ? (
          <div className="next">
            {iv.kind === 'prep' ? 'Warm-up first' : 'Next'}: {state.session[state.index + 1].exercise!.name}
          </div>
        ) : (
          nextWork && (
            <div className="next">
              First up{partnerOn ? ' — ' : ': '}
              {partnerOn
                ? groupExercises(roundStations(nextWork.round), nextWork.station, partner!.groups.length)
                    .map((e, i) => `${groupLabel(partner!.groups[i], i)}: ${e.name}`)
                    .join(' · ')
                : nextWork.exercise!.name}
            </div>
          )
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
                      <EquipmentIcon equipment={e.equipment} />
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
