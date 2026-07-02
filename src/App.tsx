import { useState } from 'react';
import type { Exercise, Session, Settings } from './types';
import { loadPool, loadSettings, savePool, saveSettings } from './storage';
import { initAudio } from './audio';
import { Pool } from './components/Pool';
import { Setup } from './components/Setup';
import { Workout } from './components/Workout';

type Screen = 'setup' | 'pool' | 'workout';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [pool, setPoolState] = useState<Exercise[]>(loadPool);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Session | null>(null);

  const setPool = (p: Exercise[]) => {
    setPoolState(p);
    savePool(p);
  };
  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
    setSession(null); // settings changed -> stale session invalidated
  };

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
