import { useEffect, useState } from 'react';
import type { Exercise, Session, Settings } from './types';
import { loadPool, loadSettings, savePool, saveSettings } from './storage';
import { initAudio } from './audio';
import { handleCallback } from './spotify';
import { Logo } from './components/Logo';
import { Pool } from './components/Pool';
import { Setup } from './components/Setup';
import { Workout } from './components/Workout';

type Screen = 'setup' | 'pool' | 'workout';

export default function App() {
  const [callbackDone, setCallbackDone] = useState(
    () => !window.location.search.includes('code='),
  );
  useEffect(() => {
    if (!callbackDone) void handleCallback().finally(() => setCallbackDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [screen, setScreen] = useState<Screen>('setup');
  const [pool, setPoolState] = useState<Exercise[]>(loadPool);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Session | null>(null);

  const setPool = (p: Exercise[]) => {
    setPoolState(p);
    savePool(p);
    setSession(null); // pool changed -> stale session may reference deleted exercises
  };
  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
    setSession(null); // settings changed -> stale session invalidated
  };

  const banExercise = (banned: Exercise) => {
    const next = pool.map((e) => (e.id === banned.id ? { ...e, pref: 'ban' as const } : e));
    setPoolState(next);
    savePool(next); // deliberately NOT setPool: the running session must survive
  };

  if (!callbackDone) return null; // exchanging the Spotify auth code

  if (screen === 'workout' && session) {
    return (
      <Workout
        session={session}
        pool={pool}
        onBan={banExercise}
        partner={settings.partner}
        onExit={() => setScreen('setup')}
      />
    );
  }

  return (
    <div className="app">
      <header className="brand">
        <Logo size={40} />
        <div>
          <div className="brand-name">Tasha</div>
          <div className="brand-tag">Train. Attack. Sweat. Hold. Again.</div>
        </div>
      </header>
      <nav>
        <button onClick={() => setScreen('setup')} disabled={screen === 'setup'}>Session</button>
        <button onClick={() => setScreen('pool')} disabled={screen === 'pool'}>Exercises</button>
      </nav>
      {screen === 'setup' ? (
        <Setup
          pool={pool}
          settings={settings}
          setSettings={setSettings}
          session={session}
          setSession={setSession}
          onStart={() => {
            initAudio();
            setScreen('workout');
          }}
          goToPool={() => setScreen('pool')}
        />
      ) : (
        <Pool pool={pool} setPool={setPool} />
      )}
    </div>
  );
}
