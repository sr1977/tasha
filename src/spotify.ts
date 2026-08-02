import { loadJson } from './storage';

const CLIENT_ID = '599ca406479846b688274bba8fe50fc8';
// Origin-based so it works on both local dev (http://127.0.0.1:6173) and a
// deployed host (https://<app>.onrender.com). Computed at call time — module
// import must stay window-free for the node test env. Every origin used must
// be registered as a redirect URI in the Spotify dashboard.
const redirectUri = () => `${window.location.origin}/callback`;
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

export const WORK_VOLUME = 0.8;
export const DIP_VOLUME = 0.35;

const AUTH_KEY = 'tasha.spotify.auth';
const ERROR_KEY = 'tasha.spotify.error';
const VERIFIER_KEY = 'tasha.spotify.verifier';
const DUCK_VOLUME = 0.3; // dipped but still present while the coach is speaking
const DUCK_MS = 2500;
const SPEECH_HOLD_MAX_MS = 25_000; // backstop if a speech-end event never arrives
const PLAYLISTS_KEY = 'tasha.spotify.playlists';
const ACTIVE_KEY = 'tasha.spotify.active';

/**
 * Music volume policy. A speech hold outranks every timed dip: while the coach
 * has the floor the music stays dipped, and only the end of speech (or the
 * backstop) brings it back — a countdown beep can't fade it up early.
 */
export function createDucker(setVolume: (v: number) => void) {
  let base = WORK_VOLUME;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let speechHold = false;

  const release = () => {
    clearTimeout(timer);
    timer = undefined;
    speechHold = false;
    setVolume(base);
  };

  return {
    setBase(v: number) {
      base = v;
      if (timer === undefined) setVolume(base); // mid-dip: the restore picks it up
    },
    duck(volume = DUCK_VOLUME, ms = DUCK_MS) {
      if (speechHold) return;
      clearTimeout(timer);
      setVolume(volume);
      timer = setTimeout(() => {
        timer = undefined;
        setVolume(base);
      }, ms);
    },
    holdForSpeech() {
      clearTimeout(timer);
      speechHold = true;
      setVolume(DUCK_VOLUME);
      // Backstop only: a dropped speech-end event must not mute the music forever.
      timer = setTimeout(release, SPEECH_HOLD_MAX_MS);
    },
    releaseSpeech: release,
    stop() {
      clearTimeout(timer);
    },
  };
}

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
  destroyPlayer(); // a live player would hold a dead token-refresh callback
}

export async function connect(): Promise<void> {
  const verifier = generateVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
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

let callbackResult: Promise<boolean> | null = null;

export function handleCallback(): Promise<boolean> {
  callbackResult ??= exchangeCallback();
  return callbackResult;
}

async function exchangeCallback(): Promise<boolean> {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY) ?? '';
  sessionStorage.removeItem(VERIFIER_KEY);
  const auth = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  window.history.replaceState({}, '', '/');
  return auth !== null;
}

let refreshPromise: Promise<StoredAuth | null | 'network'> | null = null;

// Distinct from tokenRequest: refresh must tell apart a definitive HTTP
// rejection (rotated/invalid refresh token -> null) from a transient network
// failure (thrown fetch error -> 'network'), since only the former should
// wipe a stored session.
async function refreshAccessToken(refreshToken: string): Promise<StoredAuth | null | 'network'> {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? loadAuth()?.refreshToken ?? refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  } catch {
    return 'network';
  }
}

export async function getAccessToken(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth) return null;
  if (!tokenNeedsRefresh(auth, Date.now())) return auth.accessToken;

  // Single-flight: PKCE refresh tokens rotate, so two concurrent refreshes
  // (SDK getOAuthToken + an api() call) both racing against the same stored
  // refresh token would have the loser rejected. Share one in-flight promise.
  refreshPromise ??= refreshAccessToken(auth.refreshToken);
  const outcome = await refreshPromise;
  refreshPromise = null;

  if (outcome === 'network') return auth.accessToken; // transient failure: fail soft, keep stale token
  if (outcome === null) {
    disconnect(); // refresh definitively rejected -> treat as disconnected
    return null;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(outcome));
  return outcome.accessToken;
}

// ---------- playlist persistence ----------

// Seeded on first run so a fresh browser starts with the household set.
// Deleting them all sticks ("[]" in storage beats the defaults).
const DEFAULT_PLAYLISTS: SpotifyPlaylist[] = [
  { id: '9737755b-660d-40b5-bb54-73622c011e2c', name: '90s Workout', uri: 'spotify:playlist:37i9dQZF1DXdMm3yYbD7IO' },
  { id: '60bac800-9983-43bd-9619-8810fb125f5f', name: 'Workout 120bpm', uri: 'spotify:playlist:1vdkPd9esYFohPkUxcrUDa' },
];

export function loadPlaylists(): SpotifyPlaylist[] {
  const p = loadJson<unknown>(PLAYLISTS_KEY, null);
  return Array.isArray(p) ? (p as SpotifyPlaylist[]) : DEFAULT_PLAYLISTS;
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

export function clearActiveId(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

export function activePlaylist(): SpotifyPlaylist | null {
  const id = loadActiveId();
  const list = loadPlaylists();
  return list.find((p) => p.id === id) ?? list[0] ?? null;
}

const COOLDOWN_KEY = 'tasha.spotify.cooldown';

export function loadCooldownId(): string | null {
  return localStorage.getItem(COOLDOWN_KEY);
}

export function saveCooldownId(id: string): void {
  if (id) localStorage.setItem(COOLDOWN_KEY, id);
  else localStorage.removeItem(COOLDOWN_KEY);
}

export function cooldownPlaylist(): SpotifyPlaylist | null {
  const id = loadCooldownId();
  if (!id) return null;
  return loadPlaylists().find((p) => p.id === id) ?? null;
}

export function playerError(): string | null {
  return localStorage.getItem(ERROR_KEY);
}

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
    s.onerror = () => {
      s.remove(); // don't leave a dead <script> tag behind
      sdkPromise = null; // allow a later createPlayer() to retry the load
      resolve(false);
    };
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
  /** Brief dip (tones, beeps, bridging a TTS fetch). Ignored while speech holds. */
  duck(volume?: number, ms?: number): void;
  /** Coach has the floor: stay near-silent until releaseSpeech(). */
  holdForSpeech(): void;
  releaseSpeech(): void;
  disconnect(): void;
  onTrack(cb: (label: string | null) => void): void;
}

let playerPromise: Promise<PlayerHandle | null> | null = null;

// Singleton: two concurrent SDK players in one page (React StrictMode's
// double-mounted effects) corrupt the device registration — the device
// reports ready client-side but is never targetable via the Web API.
// The player lives for the page's lifetime; Workout pauses it on unmount.
export function createPlayer(): Promise<PlayerHandle | null> {
  playerPromise ??= buildPlayer().then((p) => {
    if (!p) playerPromise = null; // failed -> allow a later retry
    return p;
  });
  return playerPromise;
}

export function destroyPlayer(): void {
  const p = playerPromise;
  playerPromise = null;
  void p?.then((h) => h?.disconnect()).catch(() => {});
}

async function buildPlayer(): Promise<PlayerHandle | null> {
  if (!(await getAccessToken())) {
    console.warn('[tasha] spotify: no valid access token — not connected or refresh failed');
    return null;
  }
  if (!(await loadSdk())) {
    console.warn('[tasha] spotify: Web Playback SDK failed to load');
    return null;
  }

  const player = new window.Spotify!.Player({
    name: 'Tasha Workout Timer',
    getOAuthToken: (cb) => {
      void getAccessToken().then((t) => t && cb(t));
    },
    volume: WORK_VOLUME,
  });

  let trackCb: ((label: string | null) => void) | null = null;
  const ducker = createDucker((v) => player.setVolume(v).catch(() => {}));

  const ready = new Promise<string | null>((resolve) => {
    player.addListener('ready', (data: never) => {
      resolve((data as { device_id: string }).device_id);
    });
    const fail = (kind: string) => (e: never) => {
      console.warn(`[tasha] spotify ${kind}:`, (e as { message?: string })?.message);
      resolve(null);
    };
    player.addListener('initialization_error', fail('initialization_error'));
    player.addListener('authentication_error', fail('authentication_error'));
    player.addListener('account_error', (e: never) => {
      localStorage.setItem(ERROR_KEY, 'Spotify Premium is required for playback.');
      fail('account_error')(e);
    });
    setTimeout(() => {
      console.warn('[tasha] spotify: player not ready within 15s');
      resolve(null);
    }, 15_000);
  });

  player.addListener('player_state_changed', (data: never) => {
    if (!trackCb) return;
    const s = data as {
      track_window?: { current_track?: { name: string; artists?: { name: string }[] } };
    } | null;
    const t = s?.track_window?.current_track;
    trackCb(t ? `${t.name} — ${t.artists?.map((a) => a.name).join(', ') ?? ''}` : null);
  });

  if (!(await player.connect())) {
    console.warn('[tasha] spotify: player.connect() returned false');
    return null;
  }
  const deviceId = await ready;
  if (!deviceId) {
    player.disconnect();
    return null;
  }
  localStorage.removeItem(ERROR_KEY);

  const api = async (path: string, body?: unknown): Promise<void> => {
    const t = await getAccessToken();
    if (!t) return;
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch((e) => {
      console.warn('[tasha] spotify api fetch failed:', path, e);
      return null;
    });
    if (res && !res.ok) {
      console.warn('[tasha] spotify api error:', path, res.status, await res.text().catch(() => ''));
    }
  };

  // The SDK fires 'ready' before the device is targetable via the Web API —
  // commands sent in that window are dropped (202) or 404 "Device not found".
  // Transfer playback to our device until Spotify accepts it (usually 0.5-3s);
  // transfer needs only the user-modify-playback-state scope we already hold.
  const waitForDevice = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      }).catch(() => null);
      if (res?.ok) return; // device is live and now the active player
      await new Promise((r) => setTimeout(r, 500));
    }
    console.warn('[tasha] spotify: device transfer never succeeded; trying to play anyway');
  };

  return {
    async play(playlistUri) {
      await waitForDevice();
      await api(`/me/player/play?device_id=${deviceId}`, { context_uri: playlistUri });
      // Shuffle can only be set once playback exists (shuffle-before-play
      // fails with no active playback), so the playlist always opens on
      // track 1 — skip once to land on a random track instead.
      await api(`/me/player/shuffle?state=true&device_id=${deviceId}`);
      await player.nextTrack().catch(() => {});
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
    setBaseVolume: ducker.setBase,
    duck: ducker.duck,
    holdForSpeech: ducker.holdForSpeech,
    releaseSpeech: ducker.releaseSpeech,
    disconnect() {
      ducker.stop();
      player.pause().catch(() => {});
      player.disconnect();
    },
    onTrack(cb) {
      trackCb = cb;
    },
  };
}
