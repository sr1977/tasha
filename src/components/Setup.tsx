import { useState } from 'react';
import type { Exercise, Session, Settings } from '../types';
import { buildSession, generateSession, roundCount, sessionDuration } from '../generator';
import { Music } from './Music';

export const fmt = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.round(secs) % 60).padStart(2, '0')}`;

interface Props {
  pool: Exercise[];
  settings: Settings;
  setSettings: (s: Settings) => void;
  session: Session | null;
  setSession: (s: Session | null) => void;
  onStart: () => void;
  goToPool: () => void;
}

export function Setup({ pool, settings, setSettings, session, setSession, onStart, goToPool }: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<keyof Settings, string>>>({});
  const stations =
    session?.filter((iv) => iv.kind === 'work' && iv.round === 1).map((iv) => iv.exercise!) ?? null;

  const swap = (i: number) => {
    if (!stations) return;
    const current = stations[i];
    const usedIds = new Set(stations.map((s) => s.id));
    const sameCat = pool.filter((e) => e.category === current.category && !usedIds.has(e.id));
    const candidates = sameCat.length > 0 ? sameCat : pool.filter((e) => !usedIds.has(e.id));
    if (candidates.length === 0) return;
    const next = [...stations];
    next[i] = candidates[Math.floor(Math.random() * candidates.length)];
    setSession(buildSession(next, settings));
  };

  const num = (key: keyof Settings, label: string, min: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={drafts[key] ?? String(settings[key])}
        onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })}
        onBlur={(e) => {
          if (drafts[key] === undefined) return; // never edited -> nothing to commit
          const clamped = Math.max(min, Number(e.target.value) || min);
          const clearDraft = () =>
            setDrafts((d) => {
              const next = { ...d };
              delete next[key];
              return next;
            });
          if (clamped === settings[key]) {
            clearDraft(); // unchanged value -> don't invalidate the session
            return;
          }
          setSettings({ ...settings, [key]: clamped });
          clearDraft();
        }}
      />
    </label>
  );

  return (
    <>
      <section>
        <h2>Session</h2>
        <div className="settings-grid">
          {num('workSecs', 'Work (seconds)', 5)}
          {num('restSecs', 'Rest (seconds)', 0)}
          {num('stations', 'Stations', 1)}
          {num('roundRestSecs', 'Round rest (seconds)', 0)}
          {num('totalMins', 'Target length (minutes)', 5)}
        </div>
        {pool.length === 0 ? (
          <p className="warn">
            Your exercise pool is empty. <button onClick={goToPool}>Add exercises</button>
          </p>
        ) : (
          <>
            {pool.length < settings.stations && (
              <p className="warn">
                Only {pool.length} exercises for {settings.stations} stations — some will repeat.
              </p>
            )}
            <button onClick={() => setSession(generateSession(pool, settings))}>
              {session ? 'Regenerate' : 'Generate session'}
            </button>
          </>
        )}
        {session && stations && (
          <>
            <p>
              {roundCount(settings)} rounds · actual duration {fmt(sessionDuration(session))}
            </p>
            <ol className="stations">
              {stations.map((s, i) => (
                <li key={`${s.id}-${i}`}>
                  {s.name} <small>({s.category})</small>{' '}
                  <button onClick={() => swap(i)} title="Swap this station">↻</button>
                </li>
              ))}
            </ol>
            <button className="start" onClick={onStart}>Start workout ▶</button>
          </>
        )}
      </section>
      <Music />
    </>
  );
}
