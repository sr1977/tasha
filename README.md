# Tasha

Personal circuit-training timer. A loud, glanceable interval clock for a
home training space — big countdown readable from 3 metres, spoken cues, and
optional Spotify playback that ducks under the coach's voice.

Vite + React + TypeScript. No backend. State lives in `localStorage`; the
Spotify Web Playback SDK is loaded from a CDN at runtime (not an npm dep).

## Features

- **Circuit generator** — builds a session from an exercise pool given work /
  rest / stations / round-rest / total-time settings.
- **Big-clock workout screen** — colour-coded intervals (prep / work / rest /
  round-rest), spoken exercise cues, halfway announcements.
- **Exercise pool management** — favourite/ban exercises, per-exercise cues,
  categories (upper/lower/core) and equipment (bodyweight/dumbbells).
- **Partner / group mode** — rotate 1–4 named groups through stations with
  spoken announcements.
- **Spotify** (optional, Premium required) — play a chosen playlist during the
  workout; volume ducks under voice cues; separate cooldown playlist.

## Requirements

- Node 20+ and npm.
- A desktop Chromium/Firefox browser for the workout screen.
- Spotify **Premium** account, only if you want music (playback SDK refuses
  free accounts).

## Getting started

```bash
npm install
npm run dev
```

The dev server binds **`http://127.0.0.1:5173`** and uses `strictPort` — if
5173 is taken it fails loudly rather than drifting to another port. This is
deliberate: the Spotify OAuth redirect URI is pinned to that exact address.
Use `127.0.0.1`, not `localhost` (they are not interchangeable for the OAuth
redirect on this setup).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://127.0.0.1:5173 |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | oxlint |
| `npm test` | Vitest (`tests/`), single run |

## Spotify setup

Music is optional — everything except playback works without it. To enable it
you register your own Spotify app and point Tasha at your client ID.

Tasha uses the **Authorization Code + PKCE** flow. There is **no client
secret** — PKCE exists so a browser app never needs one. The client ID is
public by design (it travels in the authorize URL), so it lives in the source.

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and log in.
2. **Create app**. Name/description are up to you.
3. Under **Redirect URIs**, add exactly:

   ```
   http://127.0.0.1:5173/callback
   ```

   It must match character-for-character — trailing slash, port, and
   `127.0.0.1` (not `localhost`) all matter.
4. For **Which API/SDKs are you planning to use?**, tick **Web Playback SDK**.
5. Save. Copy the **Client ID** from the app's settings.

### 2. Point Tasha at your client ID

Edit `src/spotify.ts` and replace the `CLIENT_ID` constant near the top:

```ts
const CLIENT_ID = '<your-client-id>';
```

The redirect URI and scopes are already set correctly:

```ts
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';
```

### 3. Authorise from the app

1. `npm run dev`, open http://127.0.0.1:5173.
2. Go to the **Music** panel and click **Connect Spotify**.
3. You're redirected to Spotify's login/consent page; approve.
4. Spotify redirects back to `/callback?code=…`; Tasha exchanges the code for
   tokens and stores them in `localStorage`. The URL is cleaned up
   automatically.

Tokens (access + refresh) live in `localStorage` under `tasha.spotify.*` and
refresh silently in the background. **Disconnect** in the Music panel clears
them. Add playlists by pasting a Spotify playlist URL
(`https://open.spotify.com/playlist/…`) or URI (`spotify:playlist:…`).

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "INVALID_CLIENT: Invalid redirect URI" | Redirect URI in the dashboard doesn't exactly match `http://127.0.0.1:5173/callback`. |
| Connect loops / never returns | Dev server not on `127.0.0.1:5173` (check `strictPort` didn't fail). Don't use `localhost`. |
| "Spotify Premium is required for playback." | The Web Playback SDK only works with Premium accounts. |
| Music connects but nothing plays | Device transfer can take 1–3s on first play; check the browser console for `[tasha] spotify` warnings. |

## Project layout

```
src/
  App.tsx           screen routing (setup / pool / workout) + auth callback
  generator.ts      builds a Session from settings + pool
  timer.ts          interval countdown logic
  spotify.ts        OAuth (PKCE), token refresh, Web Playback SDK player
  voice.ts          spoken cues (Web Speech API)
  audio.ts          beeps
  storage.ts        localStorage helpers
  seed.ts           default exercise pool
  types.ts          domain types
  components/        Setup, Pool, Workout, Music, Logo, DumbbellIcon
tests/              Vitest unit tests
docs/               design specs & implementation plans
```

## Notes

- **Persistence:** all state is per-browser `localStorage`; there is no
  account or sync. Clearing site data resets everything.
- **Privacy/security:** no client secret or API key is stored in the repo. The
  committed Spotify client ID is public by design.
