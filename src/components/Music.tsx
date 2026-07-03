import { useState } from 'react';
import {
  connect,
  disconnect,
  isConnected,
  loadActiveId,
  loadPlaylists,
  parsePlaylistInput,
  playerError,
  saveActiveId,
  savePlaylists,
  type SpotifyPlaylist,
} from '../spotify';

export function Music() {
  const [connected, setConnected] = useState(isConnected);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>(loadPlaylists);
  const [activeId, setActiveId] = useState<string | null>(loadActiveId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const update = (p: SpotifyPlaylist[]) => {
    setPlaylists(p);
    savePlaylists(p);
  };

  const setActive = (id: string) => {
    setActiveId(id);
    saveActiveId(id);
  };

  const add = () => {
    const uri = parsePlaylistInput(url);
    if (!uri) {
      setError('Not a Spotify playlist link');
      return;
    }
    if (!name.trim()) {
      setError('Give the playlist a name');
      return;
    }
    setError(null);
    const pl: SpotifyPlaylist = { id: crypto.randomUUID(), name: name.trim(), uri };
    update([...playlists, pl]);
    if (!activeId) setActive(pl.id);
    setName('');
    setUrl('');
  };

  const remove = (id: string) => {
    const next = playlists.filter((p) => p.id !== id);
    update(next);
    if (id === activeId && next.length > 0) setActive(next[0].id);
  };

  if (!connected) {
    return (
      <section className="music">
        <h2>Music</h2>
        <button onClick={() => void connect()}>Connect Spotify</button>
        <p className="hint">
          Open the app at http://127.0.0.1:5173 — the Spotify login redirects back there.
        </p>
      </section>
    );
  }

  return (
    <section className="music">
      <h2>Music</h2>
      {playerError() && <p className="warn">{playerError()}</p>}
      {playlists.length > 0 && (
        <label>
          Play during workout
          <select value={activeId ?? ''} onChange={(e) => setActive(e.target.value)}>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
      <ul className="playlist-list">
        {playlists.map((p) => (
          <li key={p.id}>
            {p.name}
            <button onClick={() => remove(p.id)} title="Delete">✕</button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Spotify playlist link"
        />
        <button onClick={add}>Add</button>
      </div>
      {error && <p className="warn">{error}</p>}
      <button
        onClick={() => {
          disconnect();
          setConnected(false);
        }}
      >
        Disconnect Spotify
      </button>
    </section>
  );
}
