# Tasha — Spotify Workout Music Integration

**Date:** 2026-07-03
**Status:** Approved design
**Builds on:** 2026-07-02-tasha-circuit-timer-design.md

## Purpose

Play an upbeat Spotify mix during a workout session, in the same browser tab
as the timer. Music follows the session (start/pause/resume/stop), dips during
rest periods so effort matches intensity, ducks under voice announcements, and
offers a skip-track control. Multiple saved playlists, one chosen per session.

## Decisions (from brainstorming)

- **Account:** User has Spotify Premium (required by Spotify for any playback
  control; free accounts cannot be controlled programmatically).
- **Playback location:** In the Tasha browser tab via the **Web Playback SDK**
  (the tab becomes a Spotify Connect device). No desktop Spotify app needed.
- **Auth:** Authorization Code with **PKCE** — client-side only, no backend,
  no client secret anywhere in the code or storage. Client ID is baked in as a
  constant: `599ca406479846b688274bba8fe50fc8`.
- **Redirect URI:** `http://127.0.0.1:5173/callback` — must be registered in
  the user's Spotify app dashboard, and the app must be opened at
  `http://127.0.0.1:5173` (not `localhost`) for auth to work.
- **Playlists:** user-managed list of saved playlists (name + pasted Spotify
  playlist URL). One selected as active per session via dropdown; last used
  pre-selected. No editorial/auto-picked playlists (Spotify closed that API
  for new apps).
- **Rest dipping:** interval-aware volume — full during work, dipped during
  prep/rest/roundRest.
- **Skip track:** button on the workout screen + `N` key.
- **Optional throughout:** no connection / expired token / SDK failure →
  session runs exactly as today, silently, without music.
- **No new npm dependencies:** the SDK loads from Spotify's CDN
  (`https://sdk.scdn.co/spotify-player.js`); Web API calls use `fetch`.

## Constants

```ts
const CLIENT_ID = '599ca406479846b688274bba8fe50fc8';
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';
const WORK_VOLUME = 0.8;   // work intervals
const DIP_VOLUME = 0.35;   // prep / rest / roundRest
const DUCK_VOLUME = 0.15;  // while an announcement is speaking
const DUCK_MS = 2500;      // duck duration per announcement
```

Volume model: the *base* volume is decided by the current interval kind; a
speech announcement temporarily overrides to `DUCK_MS` of `DUCK_VOLUME`, then
restores the current base (re-read at restore time, not captured — an
announcement that spans a work→rest boundary must restore to the rest dip).

## Data model & storage

```ts
interface SpotifyPlaylist {
  id: string;    // crypto.randomUUID()
  name: string;  // user-entered label
  uri: string;   // spotify:playlist:<id> — parsed from pasted URL
}

// localStorage keys (all under the existing corrupt-fallback load() guard):
// tasha.spotify.auth      -> { accessToken, refreshToken, expiresAt } (epoch ms)
// tasha.spotify.playlists -> SpotifyPlaylist[]
// tasha.spotify.active    -> playlist id (string)
```

Playlist URL parsing accepts `https://open.spotify.com/playlist/<id>[?...]`
and raw `spotify:playlist:<id>` forms; anything else is rejected with an
inline message.

## Module: `src/spotify.ts`

One module owning all Spotify concerns, exposing a small surface:

```ts
// -- auth (pure helpers unit-tested; flow functions thin) --
parsePlaylistInput(text: string): string | null   // -> spotify:playlist:<id> | null
buildAuthUrl(verifier: string): Promise<string>   // PKCE challenge from verifier
isConnected(): boolean                            // valid or refreshable token exists
connect(): Promise<never>                         // generates verifier, stores it, redirects
handleCallback(): Promise<boolean>                // if ?code= present: exchange, store, clean URL
disconnect(): void                                // clear stored auth
getAccessToken(): Promise<string | null>          // returns valid token, refreshing if needed

// -- player (thin wrapper over Web Playback SDK) --
interface PlayerHandle {
  play(playlistUri: string): Promise<void>;  // transfer playback here + start, shuffle on
  pause(): void;
  resume(): void;
  skipTrack(): void;
  setBaseVolume(v: number): void;            // interval-kind volume
  duck(): void;                              // DUCK_VOLUME for DUCK_MS, then restore base
  disconnect(): void;                        // release the SDK player
  onTrack(cb: (name: string, artist: string) => void): void;
}
createPlayer(): Promise<PlayerHandle | null> // loads CDN script, resolves null on any failure
```

PKCE internals: `generateVerifier()` (random 64-char), `challenge(verifier)`
(SHA-256 → base64url via Web Crypto). Token exchange and refresh are `fetch`
POSTs to `https://accounts.spotify.com/api/token` (no secret; PKCE). Refresh
happens lazily inside `getAccessToken()` when within 60s of expiry.

Starting playback: `PUT https://api.spotify.com/v1/me/player/play?device_id=<sdk device>`
with `{ context_uri: playlistUri }`, followed by
`PUT /v1/me/player/shuffle?state=true&device_id=...` (shuffle before playback
starts fails with "no active device", so the first track plays unshuffled —
accepted). Skip/pause/resume/volume
use the SDK's local methods (`nextTrack`, `pause`, `resume`, `setVolume`) —
no extra API calls.

## UI changes

**Setup screen — new "Music" section** (rendered by a new
`src/components/Music.tsx`, embedded below the session settings):
- Not connected: "Connect Spotify" button → OAuth redirect. A note reminds
  the user the app must be open at `127.0.0.1:5173`.
- Connected: playlist manager — add row (name + URL inputs + Add), list with
  delete buttons, a dropdown to choose the active playlist, and a
  "Disconnect" link. Invalid URL shows an inline `.warn` message.
- The chosen playlist is optional: starting a workout with none selected (or
  not connected) simply starts a silent session.

**Workout screen:**
- On mount: if connected and a playlist is active, `createPlayer()` then
  `play(uri)`. Failures are swallowed (console-silent no-music session).
- Timer pause/resume also pauses/resumes music; done state and unmount
  (Exit) pause music and disconnect the player.
- Interval kind drives `setBaseVolume`: work → `WORK_VOLUME`, anything else →
  `DIP_VOLUME`, applied on every interval change.
- Every `speak()` announcement is paired with `duck()`.
- New bottom-corner element: `♪ <track> — <artist>` plus a skip-track button
  (`⏭♪`, title "Skip track (N)"); `N` key calls `skipTrack()`. Hidden when no
  music is playing.

**App shell:** on startup, `handleCallback()` runs once before rendering
screens (async effect); returning from Spotify lands the user back on the
Setup screen, now connected.

## Error handling

- Any auth/SDK/API failure → music silently absent; timer/audio cues never
  affected. Errors logged with `console.warn` only.
- Token refresh failure → treated as disconnected; Music section shows
  "Connect Spotify" again.
- `tasha.spotify.*` storage uses the same corrupt-JSON fallback pattern as
  existing keys (shape-guarded: playlists must be an array).
- Non-Premium account: Spotify returns 403 on play — surfaced as one inline
  message in the Music section ("Spotify Premium is required"), workout
  unaffected.

## Testing

- **Vitest** (pure logic only): `parsePlaylistInput` (URL forms, junk, query
  strings), PKCE verifier/challenge shape (base64url, length), token expiry
  logic for `getAccessToken` decisions (mocked fetch + stubbed storage), and
  the volume model's restore-to-current-base behavior if extracted as a pure
  helper.
- Player/SDK/OAuth round-trip: manual browser verification (real Spotify
  account), per the project's convention of manual UI verification.

## Out of scope (YAGNI)

- BPM matching, per-interval or per-station music, volume sliders/settings UI
  for the volume constants, playlist search/browse, album art, queue display,
  controlling external devices (Connect remote), multiple accounts.
