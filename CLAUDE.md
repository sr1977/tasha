# Tasha

Personal circuit-training timer. Vite + React + TypeScript, no backend;
localStorage persistence; Spotify Web Playback SDK from CDN (no npm dep).
Tests in `tests/` (Vitest, `npm test`). Dev server must run at
http://127.0.0.1:5173 (Spotify OAuth redirect; strictPort).

Commits: plain conventional style — never any AI attribution.

## Design Context

### Users
One household: Steve (and a partner in partner mode). Desktop browser,
full-screened, propped up in the training space. During workouts the screen is
read from 2–4 metres away, mid-exertion — glanceability beats density. Setup
and pool management happen up close, pre-session, in a calmer state.

### Brand Personality
**Loud, physical, disciplined.** Drill-hall energy: a boxing-gym poster that
shouts at you, not a subscription fitness app that coaches gently.

### Aesthetic Direction
Dark, always. Physical print, not digital gloss — heavy poster type, hard
edges, ink-on-paper contrast. No glassmorphism, neon glows, or gradient
washes. Interval color-coding (work/rest/round-rest/prep) is functional signal
and must stay legible at a glance. Accent color is rare and earned.

### Design Principles
1. **The clock is the hero.** Workout-screen decisions defer to countdown
   legibility at 3 metres.
2. **Shout when it matters, shut up when it doesn't.** Work intervals loud and
   total; setup/pool screens quiet, procedural, disciplined.
3. **Physical, not digital.** If an effect couldn't exist on printed paper or
   painted gym signage, question it.
4. **Color is state, not decoration.**
5. **Motion is a bell, not wallpaper.** Interval transitions may punch;
   nothing else moves. Respect prefers-reduced-motion.
