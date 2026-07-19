import { useEffect, useState } from 'react';
import { DEFAULT_ROSTER, DEFAULT_SETTINGS, type Exercise, type Session, type Settings } from '../types';
import { banReplacement, buildSession, generateSession, groupLabel, roundCount, sessionDuration, stationsForRound } from '../generator';
import {
  getGoogleVoice,
  getVoiceName,
  GOOGLE_VOICES,
  googleTtsActive,
  listVoices,
  setGoogleVoice,
  setVoiceName,
  speak,
} from '../audio';
import { DumbbellIcon } from './DumbbellIcon';
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
  const [newPerson, setNewPerson] = useState('');
  const [voices, setVoices] = useState(listVoices);
  const [voiceName, setVoiceNameState] = useState<string>(() => getVoiceName() ?? '');
  const [googleVoice, setGoogleVoiceState] = useState<string>(getGoogleVoice);
  useEffect(() => {
    const refresh = () => setVoices(listVoices());
    refresh(); // voices often load async after first paint
    window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh);
  }, []);
  // One station set per distinct round (rounds cycle these sets).
  const numSets = Math.max(1, Math.min(settings.distinctRounds ?? 1, roundCount(settings)));
  const roundSets = session
    ? Array.from({ length: numSets }, (_, k) => stationsForRound(session, k + 1))
    : null;

  const swap = (setIndex: number, i: number) => {
    if (!roundSets) return;
    const set = roundSets[setIndex];
    const replacement = banReplacement(pool, set, set[i]);
    if (!replacement) return;
    const nextSets = roundSets.map((s) => [...s]);
    nextSets[setIndex][i] = replacement;
    setSession(buildSession(nextSets, settings));
  };

  // roster = the permanent list of people (survives across sessions). Session
  // participation is just group membership; the bench is everyone else.
  const roster = settings.roster ?? DEFAULT_ROSTER;
  const groups = settings.partner?.groups ?? [];
  const groupOf = (person: string) => groups.findIndex((g) => g.includes(person));
  const participants = roster.filter((p) => groupOf(p) >= 0);
  const bench = roster.filter((p) => groupOf(p) < 0);
  const setGroups = (next: string[][]) =>
    setSettings({ ...settings, partner: { on: true, groups: next } });

  const assign = (person: string, index: number) => {
    const next = groups.map((g) => g.filter((p) => p !== person));
    if (index >= 0) next[index] = [...next[index], person];
    setGroups(next);
  };
  const removeFromSession = (person: string) => assign(person, -1); // stays on the bench
  const addToSession = (person: string) => assign(person, 0); // into the first group
  const setGroupCount = (n: number) =>
    setGroups(Array.from({ length: n }, (_, i) => groups[i] ?? [])); // members of dropped groups fall to the bench
  const addPerson = () => {
    const name = newPerson.trim();
    if (!name || roster.includes(name)) return;
    setSettings({ ...settings, roster: [...roster, name] }); // to the bench, not yet in the session
    setNewPerson('');
  };
  const deleteFromRoster = (person: string) =>
    setSettings({
      ...settings,
      roster: roster.filter((p) => p !== person),
      partner: settings.partner && {
        ...settings.partner,
        groups: groups.map((g) => g.filter((p) => p !== person)),
      },
    });

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
          {num('distinctRounds', 'Distinct rounds', 1)}
        </div>
        <label className="partner-toggle">
          <input
            type="checkbox"
            checked={settings.partner?.on ?? false}
            onChange={(e) =>
              setSettings({
                ...settings,
                partner: {
                  on: e.target.checked,
                  groups: settings.partner?.groups ?? DEFAULT_SETTINGS.partner!.groups,
                },
              })
            }
          />
          Group mode — rotate together on offset stations
        </label>
        {settings.partner?.on && (
          <>
            <div className="partner-count">
              <select value={groups.length} onChange={(e) => setGroupCount(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n === 1 ? '1 group' : `${n} groups`}</option>
                ))}
              </select>
            </div>
            {participants.length > 0 && (
              <ul className="roster">
                {participants.map((person) => (
                  <li key={person}>
                    <span className="person-name">{person}</span>
                    <select
                      value={groupOf(person)}
                      onChange={(e) => assign(person, Number(e.target.value))}
                    >
                      {groups.map((_, i) => (
                        <option key={i} value={i}>{`Group ${i + 1}`}</option>
                      ))}
                    </select>
                    <button onClick={() => removeFromSession(person)} title="Remove from this session">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="bench">
              <span className="bench-label">Not in this session</span>
              {bench.map((person) => (
                <span key={person} className="bench-person">
                  <button onClick={() => addToSession(person)} title="Add to this session">
                    + {person}
                  </button>
                  <button
                    className="del"
                    onClick={() => deleteFromRoster(person)}
                    title="Delete from roster permanently"
                  >
                    🗑
                  </button>
                </span>
              ))}
              <span className="add-person">
                <input
                  value={newPerson}
                  onChange={(e) => setNewPerson(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                  placeholder="Add a person"
                />
                <button onClick={addPerson}>Add</button>
              </span>
            </div>
            <ol className="group-preview">
              {groups.map((g, i) => (
                <li key={i}>{groupLabel(g, i)}</li>
              ))}
            </ol>
            {settings.stations < groups.length && (
              <p className="warn">
                Fewer stations than groups — some groups will share a station.
              </p>
            )}
          </>
        )}
        {(voices.length > 0 || googleTtsActive()) && (
          <div className="voice-row">
            {googleTtsActive() ? (
              <label>
                Coach voice
                <select
                  value={googleVoice}
                  onChange={(e) => {
                    setGoogleVoiceState(e.target.value);
                    setGoogleVoice(e.target.value);
                  }}
                >
                  {GOOGLE_VOICES.map((v) => (
                    <option key={v.name} value={v.name}>{v.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Coach voice
                <select
                  value={voiceName}
                  onChange={(e) => {
                    setVoiceNameState(e.target.value);
                    setVoiceName(e.target.value);
                  }}
                >
                  <option value="">Default (auto)</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={() => speak('Next up: squats — drive through the heels')} title="Test the voice">
              ▶ Test
            </button>
          </div>
        )}
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
        {session && roundSets && (
          <>
            <p>
              {roundCount(settings)} rounds · actual duration {fmt(sessionDuration(session))}
            </p>
            {roundSets.map((set, k) => (
              <div key={k}>
                {roundSets.length > 1 && <h3 className="round-heading">Round {k + 1}</h3>}
                <ol className="stations">
                  {set.map((s, i) => (
                    <li key={`${s.id}-${i}`}>
                      {s.equipment === 'dumbbells' && <DumbbellIcon />}
                      {s.name} <small>({s.category})</small>{' '}
                      <button onClick={() => swap(k, i)} title="Swap this station">↻</button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <button className="start" onClick={onStart}>Start workout ▶</button>
          </>
        )}
      </section>
      <Music />
    </>
  );
}
