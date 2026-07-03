# Spotify Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a user-chosen Spotify playlist in the Tasha tab during workouts — auto start/pause/stop with the session, volume dips during rests, ducks under voice cues, skip-track control — fully optional and silently absent when not connected.

**Architecture:** One new module `src/spotify.ts` owns auth (PKCE, no secret), token refresh, playlist persistence, and a thin wrapper over Spotify's Web Playback SDK (CDN script — no npm dependency). A new `Music.tsx` section on the Setup screen manages connection + playlists; `Workout.tsx` drives the player from existing timer state. Pure helpers are unit-tested; the SDK/OAuth round-trip is verified manually.

**Tech Stack:** Existing Vite + React + TS + Vitest. Spotify Web Playback SDK via `https://sdk.scdn.co/spotify-player.js`; Web API via `fetch`.

**Spec:** `docs/superpowers/specs/2026-07-03-spotify-integration-design.md`

## Global Constraints

- No new npm dependencies (SDK from CDN, Web API via fetch).
- Client ID baked in: `599ca406479846b688274bba8fe50fc8`. **No client secret anywhere** — PKCE only.
- Redirect URI exactly `http://127.0.0.1:5173/callback`.
- Scopes: `streaming user-read-email user-read-private user-modify-playback-state`.
- Volumes: work `0.8`, dip `0.35` (prep/rest/roundRest), duck `0.15` for `2500`ms.
- localStorage keys: `tasha.spotify.auth`, `tasha.spotify.playlists`, `tasha.spotify.active`, `tasha.spotify.error`; verifier in sessionStorage `tasha.spotify.verifier`. All reads shape-guarded with fallback.
- Any Spotify failure → silent no-music session; timer and audio cues never affected.
- Tests live in `tests/`. Commits: plain conventional style, **NEVER any AI attribution**.
- Work on branch `feature/spotify`.

---

### Task 1: Auth core + pure helpers (`src/spotify.ts` part 1)

**Files:**
- Create: `src/spotify.ts`
- Modify: `src/storage.ts` (export the JSON loader)
- Test: `tests/spotify.test.ts`

**Interfaces:**
- Consumes: `loadJson` from `src/storage.ts` (created in this task).
- Produces (from `src/spotify.ts`): `WORK_VOLUME`, `DIP_VOLUME`, `SpotifyPlaylist`, `parsePlaylistInput(text): string | null`, `generateVerifier(): string`, `challenge(verifier): Promise<string>`, `tokenNeedsRefresh(auth, now): boolean`, `isConnected(): boolean`, `connect(): Promise<void>`, `handleCallback(): Promise<boolean>`, `disconnect(): void`, `getAccessToken(): Promise<string | null>`.

- [ ] **Step 1: Export the JSON loader from storage**

In `src/storage.ts`, rename the private `load` function to an exported `loadJson` (same body), and update the two internal call sites:

```ts
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
```

(`loadPool` and `loadSettings` call `loadJson<unknown>(...)` instead of `load<unknown>(...)`.)

- [ ] **Step 2: Write the failing test `tests/spotify.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  challenge,
  generateVerifier,
  parsePlaylistInput,
  tokenNeedsRefresh,
} from '../src/spotify';

describe('parsePlaylistInput', () => {
  it('parses an open.spotify.com playlist URL', () => {
    expect(parsePlaylistInput('https://open.spotify.com/playlist/37i9dQZF1DX70RN3TfWWJh')).toBe(
      'spotify:playlist:37i9dQZF1DX70RN3TfWWJh',
    );
  });

  it('parses a URL with query string', () => {
    expect(
      parsePlaylistInput('https://open.spotify.com/playlist/37i9dQZF1DX70RN3TfWWJh?si=abc123'),
    ).toBe('spotify:playlist:37i9dQZF1DX70RN3TfWWJh');
  });

  it('accepts a raw spotify:playlist: URI', () => {
    expect(parsePlaylistInput('spotify:playlist:37i9dQZF1DX70RN3TfWWJh')).toBe(
      'spotify:playlist:37i9dQZF1DX70RN3TfWWJh',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(parsePlaylistInput('  spotify:playlist:37i9dQZF1DX70RN3TfWWJh  ')).not.toBeNull();
  });

  it('rejects junk, album URLs, and empty input', () => {
    expect(parsePlaylistInput('hello')).toBeNull();
    expect(parsePlaylistInput('https://open.spotify.com/album/xyz')).toBeNull();
    expect(parsePlaylistInput('')).toBeNull();
  });
});

describe('PKCE helpers', () => {
  it('generates a 64-char base64url verifier, unique per call', () => {
    const a = generateVerifier();
    const b = generateVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(a).not.toBe(b);
  });

  it('produces a deterministic 43-char base64url challenge', async () => {
    const c1 = await challenge('test-verifier-test-verifier-test-verifier-test');
    const c2 = await challenge('test-verifier-test-verifier-test-verifier-test');
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await challenge('different')).not.toBe(c1);
  });
});

describe('tokenNeedsRefresh', () => {
  const auth = { expiresAt: 1_000_000 };
  it('false when well before expiry', () => {
    expect(tokenNeedsRefresh(auth, 1_000_000 - 120_000)).toBe(false);
  });
  it('true within the 60s safety window', () => {
    expect(tokenNeedsRefresh(auth, 1_000_000 - 30_000)).toBe(true);
  });
  it('true at and after expiry', () => {
    expect(tokenNeedsRefresh(auth, 1_000_000)).toBe(true);
    expect(tokenNeedsRefresh(auth, 2_000_000)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/spotify.test.ts`
Expected: FAIL — cannot resolve `../src/spotify`.

- [ ] **Step 4: Write `src/spotify.ts` (auth core)**

```ts
import { loadJson } from './storage';

const CLIENT_ID = '599ca406479846b688274bba8fe50fc8';
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

export const WORK_VOLUME = 0.8;
export const DIP_VOLUME = 0.35;
const DUCK_VOLUME = 0.15;
const DUCK_MS = 2500;

const AUTH_KEY = 'tasha.spotify.auth';
const PLAYLISTS_KEY = 'tasha.spotify.playlists';
const ACTIVE_KEY = 'tasha.spotify.active';
const ERROR_KEY = 'tasha.spotify.error';
const VERIFIER_KEY = 'tasha.spotify.verifier';

export interface SpotifyPlaylist {
  id: string; // crypto.randomUUID()
  name: string; // user label
  uri: string; // spotify:playlist:<id>
}

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

// ---------- pure helpers ----------

export function parsePlaylistInput(text: string): string | null {
  const t = text.trim();
  const url = t.match(/^https:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(?:[?/].*)?$/);
  if (url) return `spotify:playlist:${url[1]}`;
  if (/^spotify:playlist:[A-Za-z0-9]+$/.test(t)) return t;
  return null;
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(48))); // 48 bytes -> 64 chars
}

export async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function tokenNeedsRefresh(auth: { expiresAt: number }, now: number): boolean {
  return now >= auth.expiresAt - 60_000;
}

// ---------- auth flow ----------

function loadAuth(): StoredAuth | null {
  const a = loadJson<unknown>(AUTH_KEY, null);
  return a !== null && typeof a === 'object' && 'accessToken' in a ? (a as StoredAuth) : null;
}

export function isConnected(): boolean {
  return loadAuth() !== null;
}

export function disconnect(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(ERROR_KEY);
}

export async function connect(): Promise<void> {
  const verifier = generateVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>): Promise<StoredAuth | null> {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? loadAuth()?.refreshToken ?? '',
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  } catch {
    return null;
  }
}

export async function handleCallback(): Promise<boolean> {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY) ?? '';
  sessionStorage.removeItem(VERIFIER_KEY);
  const auth = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  window.history.replaceState({}, '', '/');
  return auth !== null;
}

export async function getAccessToken(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth) return null;
  if (!tokenNeedsRefresh(auth, Date.now())) return auth.accessToken;
  const next = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
  });
  if (!next) {
    disconnect(); // refresh failed -> treat as disconnected
    return null;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(next));
  return next.accessToken;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/spotify.test.ts`
Expected: PASS (all tests). Also run `npx vitest run` — the full suite (35 + new) must pass (storage tests still green after the `loadJson` rename).

- [ ] **Step 6: Commit**

```bash
git add src/spotify.ts src/storage.ts tests/spotify.test.ts
git commit -m "feat: add Spotify PKCE auth core and playlist URL parsing"
```

---

### Task 2: Playlist persistence + player wrapper (`src/spotify.ts` part 2)

**Files:**
- Modify: `src/spotify.ts` (append; constants/keys from Task 1 already present)

**Interfaces:**
- Produces (appended exports): `loadPlaylists(): SpotifyPlaylist[]`, `savePlaylists(p): void`, `loadActiveId(): string | null`, `saveActiveId(id): void`, `activePlaylist(): SpotifyPlaylist | null`, `playerError(): string | null`, `PlayerHandle`, `createPlayer(): Promise<PlayerHandle | null>`.

No unit tests — this is a thin wrapper over the CDN SDK and Web API (browser-only); exercised in Task 4's manual verification. Verification here = typecheck/build.

- [ ] **Step 1: Append playlist persistence + error flag to `src/spotify.ts`**

```ts
// ---------- playlist persistence ----------

export function loadPlaylists(): SpotifyPlaylist[] {
  const p = loadJson<unknown>(PLAYLISTS_KEY, []);
  return Array.isArray(p) ? (p as SpotifyPlaylist[]) : [];
}

export function savePlaylists(p: SpotifyPlaylist[]): void {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(p));
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function activePlaylist(): SpotifyPlaylist | null {
  const id = loadActiveId();
  return loadPlaylists().find((p) => p.id === id) ?? null;
}

export function playerError(): string | null {
  return localStorage.getItem(ERROR_KEY);
}
```

- [ ] **Step 2: Append the SDK loader and player wrapper**

```ts
// ---------- Web Playback SDK ----------

interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: never) => void): void;
  nextTrack(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(v: number): Promise<void>;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SdkPlayer;
    };
  }
}

let sdkPromise: Promise<boolean> | null = null;

function loadSdk(): Promise<boolean> {
  sdkPromise ??= new Promise((resolve) => {
    if (window.Spotify) {
      resolve(true);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve(true);
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export interface PlayerHandle {
  play(playlistUri: string): Promise<void>;
  pause(): void;
  resume(): void;
  skipTrack(): void;
  setBaseVolume(v: number): void;
  duck(): void;
  disconnect(): void;
  onTrack(cb: (name: string, artist: string) => void): void;
}

export async function createPlayer(): Promise<PlayerHandle | null> {
  if (!(await getAccessToken())) return null;
  if (!(await loadSdk())) return null;

  const player = new window.Spotify!.Player({
    name: 'Tasha Workout Timer',
    getOAuthToken: (cb) => {
      void getAccessToken().then((t) => t && cb(t));
    },
    volume: WORK_VOLUME,
  });

  let trackCb: ((name: string, artist: string) => void) | null = null;
  let baseVolume = WORK_VOLUME;
  let duckTimer: ReturnType<typeof setTimeout> | undefined;

  const ready = new Promise<string | null>((resolve) => {
    player.addListener('ready', (data: never) => {
      resolve((data as { device_id: string }).device_id);
    });
    player.addListener('initialization_error', () => resolve(null));
    player.addListener('authentication_error', () => resolve(null));
    player.addListener('account_error', () => {
      localStorage.setItem(ERROR_KEY, 'Spotify Premium is required for playback.');
      resolve(null);
    });
    setTimeout(() => resolve(null), 15_000);
  });

  player.addListener('player_state_changed', (data: never) => {
    const s = data as {
      track_window?: { current_track?: { name: string; artists?: { name: string }[] } };
    } | null;
    const t = s?.track_window?.current_track;
    if (t && trackCb) trackCb(t.name, t.artists?.map((a) => a.name).join(', ') ?? '');
  });

  if (!(await player.connect())) return null;
  const deviceId = await ready;
  if (!deviceId) {
    player.disconnect();
    return null;
  }
  localStorage.removeItem(ERROR_KEY);

  const api = async (path: string, body?: unknown): Promise<void> => {
    const t = await getAccessToken();
    if (!t) return;
    await fetch(`https://api.spotify.com/v1${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => {});
  };

  const applyBase = () => {
    player.setVolume(baseVolume).catch(() => {});
  };

  return {
    async play(playlistUri) {
      await api(`/me/player/play?device_id=${deviceId}`, { context_uri: playlistUri });
      // ponytail: shuffle after play — shuffle-before-play fails with no active
      // playback, so the first track is unshuffled; acceptable.
      await api(`/me/player/shuffle?state=true&device_id=${deviceId}`);
    },
    pause() {
      player.pause().catch(() => {});
    },
    resume() {
      player.resume().catch(() => {});
    },
    skipTrack() {
      player.nextTrack().catch(() => {});
    },
    setBaseVolume(v) {
      baseVolume = v;
      if (duckTimer === undefined) applyBase(); // mid-duck: restore picks up new base
    },
    duck() {
      clearTimeout(duckTimer);
      player.setVolume(DUCK_VOLUME).catch(() => {});
      duckTimer = setTimeout(() => {
        duckTimer = undefined;
        applyBase();
      }, DUCK_MS);
    },
    disconnect() {
      clearTimeout(duckTimer);
      player.pause().catch(() => {});
      player.disconnect();
    },
    onTrack(cb) {
      trackCb = cb;
    },
  };
}
```

- [ ] **Step 3: Verify typecheck/build and full suite**

Run: `npm run build && npx vitest run`
Expected: build clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/spotify.ts
git commit -m "feat: add Spotify player wrapper and playlist persistence"
```

---

### Task 3: Music section UI + auth callback wiring

**Files:**
- Create: `src/components/Music.tsx`
- Modify: `src/App.tsx` (callback handling on startup)
- Modify: `src/components/Setup.tsx` (embed Music below the session section)
- Modify: `src/index.css` (music styles)

**Interfaces:**
- Consumes (from `src/spotify.ts`): `connect`, `disconnect`, `isConnected`, `handleCallback`, `loadPlaylists`, `savePlaylists`, `loadActiveId`, `saveActiveId`, `parsePlaylistInput`, `playerError`, `SpotifyPlaylist`.
- Produces: `Music` component (no props).

- [ ] **Step 1: Write `src/components/Music.tsx`**

```tsx
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
```

- [ ] **Step 2: Wire callback handling into `src/App.tsx`**

Add imports and callback gate (diff against current file):

```tsx
import { useEffect, useState } from 'react';
// ...existing imports...
import { handleCallback } from './spotify';
```

Inside `App()`, before other state:

```tsx
const [callbackDone, setCallbackDone] = useState(
  () => !window.location.search.includes('code='),
);
useEffect(() => {
  if (!callbackDone) void handleCallback().finally(() => setCallbackDone(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

And immediately after the state declarations, before the workout branch:

```tsx
if (!callbackDone) return null; // exchanging the Spotify auth code
```

- [ ] **Step 3: Embed Music in `src/components/Setup.tsx`**

Add `import { Music } from './Music';` and change the component's return to wrap the existing section plus the new one in a fragment:

```tsx
return (
  <>
    <section>
      {/* ...entire existing section content unchanged... */}
    </section>
    <Music />
  </>
);
```

- [ ] **Step 4: Append music styles to `src/index.css`**

```css
/* ---- music ---- */
.music { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #333; }
.music label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; color: #aaa; margin: 0.75rem 0; max-width: 20rem; }
.music .playlist-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; margin: 0.75rem 0; }
.music .playlist-list li { display: flex; gap: 0.5rem; align-items: center; }
.music .hint { color: #888; font-size: 0.85rem; }
```

- [ ] **Step 5: Verify build, tests, and the section renders**

Run: `npm run build && npx vitest run` — both clean.
Run `npm run dev`, open the app: Setup shows a Music section with a "Connect Spotify" button and the 127.0.0.1 hint. (Full OAuth round-trip is verified in Task 4 — it needs the registered redirect URI.)

- [ ] **Step 6: Commit**

```bash
git add src/components/Music.tsx src/App.tsx src/components/Setup.tsx src/index.css
git commit -m "feat: add Spotify connect and playlist manager to setup screen"
```

---

### Task 4: Workout playback integration + manual verification

**Files:**
- Modify: `src/components/Workout.tsx`
- Modify: `src/index.css` (track display styles)

**Interfaces:**
- Consumes (from `src/spotify.ts`): `activePlaylist`, `createPlayer`, `PlayerHandle`, `WORK_VOLUME`, `DIP_VOLUME`.

- [ ] **Step 1: Wire the player into `src/components/Workout.tsx`**

Add imports:

```tsx
import { useEffect, useReducer, useRef, useState } from 'react';
import { activePlaylist, createPlayer, DIP_VOLUME, WORK_VOLUME, type PlayerHandle } from '../spotify';
```

Inside the component, after the `useReducer` line, add player state and lifecycle:

```tsx
const playerRef = useRef<PlayerHandle | null>(null);
const [track, setTrack] = useState<string | null>(null);

// Music lifecycle: create player + start the active playlist on mount,
// pause + release on unmount. All failures leave a silent session.
useEffect(() => {
  const pl = activePlaylist();
  if (!pl) return;
  let cancelled = false;
  void createPlayer().then((p) => {
    if (!p) return;
    if (cancelled) {
      p.disconnect();
      return;
    }
    playerRef.current = p;
    p.onTrack((name, artist) => setTrack(`${name} — ${artist}`));
    void p.play(pl.uri);
  });
  return () => {
    cancelled = true;
    playerRef.current?.disconnect();
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
```

- [ ] **Step 2: Duck music under announcements**

In the existing audio-cue effect, add a duck alongside each spoken announcement:

- In the done branch, after `speak('Session complete. Well done!');` add:
  ```tsx
  playerRef.current?.duck();
  ```
- In the index-change branch, after `announce(state);` add:
  ```tsx
  playerRef.current?.duck();
  ```

- [ ] **Step 3: Skip-track key and UI**

In the keyboard effect, add a branch:

```tsx
else if (e.code === 'KeyN') playerRef.current?.skipTrack();
```

In the running-state JSX, after the `<progress>` element, add:

```tsx
{track && (
  <div className="track">
    ♪ {track}
    <button onClick={() => playerRef.current?.skipTrack()} title="Skip track (N)">⏭♪</button>
  </div>
)}
```

- [ ] **Step 4: Append track styles to `src/index.css`**

```css
.workout .track { position: absolute; bottom: 1rem; right: 1rem; display: flex; gap: 0.5rem; align-items: center; font-size: 1rem; color: rgba(255, 255, 255, 0.8); max-width: 40vw; }
.workout .track button { font-size: 1rem; padding: 0.3rem 0.7rem; background: rgba(0, 0, 0, 0.3); }
```

- [ ] **Step 5: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: clean build, all tests pass.

- [ ] **Step 6: Manual verification (requires the user's Spotify account — coordinate with the controller/user)**

Pre-requisite (user, one-time): in the Spotify developer dashboard for app `599ca…`, add redirect URI `http://127.0.0.1:5173/callback`.

Run `npm run dev` and open **http://127.0.0.1:5173** (not localhost). Verify:

1. Music section → Connect Spotify → Spotify consent → redirected back, section now shows the playlist manager.
2. Add a playlist by pasting its share link; it appears in the list and the dropdown; invalid text shows an inline warning; entries survive reload.
3. Start a workout (quick config: work 10s / rest 5s / 2 stations): music starts in the tab within a few seconds.
4. Volume dips audibly during rest/prep, returns for work; announcements duck the music briefly.
5. Pause (space) pauses music; resume resumes it.
6. Track name shows bottom-right; ⏭♪ button and `N` key skip to the next track.
7. Exit or finish the session: music stops.
8. Disconnect Spotify → workout runs silent, exactly as before the feature.

- [ ] **Step 7: Commit**

```bash
git add src/components/Workout.tsx src/index.css
git commit -m "feat: drive Spotify playback from workout with rest dipping and track skip"
```
