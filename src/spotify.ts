import { loadJson } from './storage';

const CLIENT_ID = '599ca406479846b688274bba8fe50fc8';
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

export const WORK_VOLUME = 0.8;
export const DIP_VOLUME = 0.35;

const AUTH_KEY = 'tasha.spotify.auth';
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
