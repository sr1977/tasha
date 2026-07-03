import { useEffect, useState } from 'react';
import type { Exercise, Session, Settings } from './types';
import { loadPool, loadSettings, savePool, saveSettings } from './storage';
import { initAudio } from './audio';
import { handleCallback } from './spotify';
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

  if (!callbackDone) return null; // exchanging the Spotify auth code

  if (screen === 'workout' && session) {
    return <Workout session={session} onExit={() => setScreen('setup')} />;
  }

  return (
    <div className="app">
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
