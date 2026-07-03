import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

import {
  activePlaylist,
  challenge,
  generateVerifier,
  parsePlaylistInput,
  saveActiveId,
  savePlaylists,
  tokenNeedsRefresh,
  type SpotifyPlaylist,
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

describe('activePlaylist', () => {
  beforeEach(() => store.clear());

  const playlists: SpotifyPlaylist[] = [
    { id: 'a', name: 'Alpha', uri: 'spotify:playlist:a' },
    { id: 'b', name: 'Beta', uri: 'spotify:playlist:b' },
  ];

  it('returns the playlist matching the stored active id', () => {
    savePlaylists(playlists);
    saveActiveId('b');
    expect(activePlaylist()).toEqual(playlists[1]);
  });

  it('falls back to the first playlist when the stored id is stale', () => {
    savePlaylists(playlists);
    saveActiveId('does-not-exist');
    expect(activePlaylist()).toEqual(playlists[0]);
  });

  it('returns null when no playlists exist', () => {
    saveActiveId('a');
    expect(activePlaylist()).toBeNull();
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
