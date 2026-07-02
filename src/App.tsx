import { useState } from 'react';
import type { Exercise, Session, Settings } from './types';
import { loadPool, loadSettings, savePool, saveSettings } from './storage';
import { initAudio } from './audio';
import { Pool } from './components/Pool';

// Placeholders — replaced by real components in Tasks 7 and 8.
const Setup = (_props: Record<string, unknown>) => <p>Setup coming in Task 7</p>;
const Workout = (_props: Record<string, unknown>) => <p>Workout coming in Task 8</p>;

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
