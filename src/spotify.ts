import { loadJson } from './storage';

const CLIENT_ID = '599ca406479846b688274bba8fe50fc8';
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

export const WORK_VOLUME = 0.8;
export const DIP_VOLUME = 0.35;

const AUTH_KEY = 'tasha.spotify.auth';
const ERROR_KEY = 'tasha.spotify.error';
const VERIFIER_KEY = 'tasha.spotify.verifier';
const DUCK_VOLUME = 0.15;
const DUCK_MS = 2500;
const PLAYLISTS_KEY = 'tasha.spotify.playlists';
const ACTIVE_KEY = 'tasha.spotify.active';

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

export function clearActiveId(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

export function activePlaylist(): SpotifyPlaylist | null {
  const id = loadActiveId();
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
