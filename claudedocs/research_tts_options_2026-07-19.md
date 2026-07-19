# Research: Realistic TTS options for Tasha (replacing speechSynthesis)

Date: 2026-07-19 · Depth: standard · Confidence: high (pricing from vendor/aggregator pages, cross-checked)

## Context

Tasha currently speaks via `window.speechSynthesis` (`src/audio.ts`). Announcements are
short and partly dynamic (exercise names from the user's pool, cues, round numbers).
Constraints that shape the answer:

- **No backend.** Vite static site — any API must be callable from the browser, or run in it.
- **Tiny volume.** ~40 chars/announcement, ~40 announcements/workout ≈ 1.6k chars/session.
  Daily use ≈ **50k chars/month** — two orders of magnitude under every free tier.
- **Phrases repeat.** Exercise pool is small and stable → synthesized audio is cacheable
  (IndexedDB/Cache API keyed by text); after warm-up, near-zero API calls.

## Options compared

| Option | Cost at Tasha's volume | Realism | Browser-callable w/o backend | Notes |
|---|---|---|---|---|
| **Google Cloud TTS — Chirp 3: HD** | **$0** (1M chars/mo free; $30/1M after) | Very good | **Yes** — REST + API key with HTTP-referrer restriction | Needs GCP project + billing enabled (still $0 within free tier) |
| Google Cloud TTS — Neural2 | $0 (1M free; $16/1M after) | Good | Yes (same) | Cheaper paid tier, less natural than Chirp |
| **Kokoro (kokoro-js, in-browser WebGPU)** | $0 forever, no account | Good (rivals cloud for short English phrases) | Runs *in* the browser | ~80MB one-time model download; Apache-2.0; works offline |
| ElevenLabs Flash/Turbo | Free tier ~10k credits/mo (≈20k chars on Flash) — marginal without caching; paid from $5/mo | Best-in-class | Key can't be domain-restricted → exposed key is spendable by anyone | Free tier requires attribution, no commercial use |
| OpenAI TTS (gpt-4o-mini-tts / tts-1) | ~$15/1M chars, no free tier | Very good | **No** — key can't be restricted; needs a proxy | Ruled out by no-backend constraint |
| Azure Neural | $15/1M (500k free/mo F0) | Very good | Awkward (key or token flow; region keys not referrer-restrictable) | More setup than Google for same result |
| Better `speechSynthesis` voice (e.g. macOS Siri voices in Safari, Google voices in Chrome) | $0 | Meh–OK | Native | The do-nothing option; quality ceiling is low in Chrome |

## Recommendation

1. **Google Cloud TTS, Chirp 3: HD voice** — effectively free forever at this volume,
   realistic, and callable directly from the browser with an API key locked to
   `http://127.0.0.1:6173` + the deployed origin via HTTP-referrer restriction.
   Cache synthesized MP3 blobs by phrase text so repeat announcements cost nothing
   and play with zero latency. Keep `speechSynthesis` as offline/failure fallback.
2. **Runner-up: Kokoro in-browser** if you'd rather have zero accounts/keys and offline
   operation — cost is an ~80MB model download and a heavier integration.
3. **Skip ElevenLabs/OpenAI** for this app: best voices, but no safe way to ship a key
   in a static site, and the free tiers don't fit.

## Risks / caveats

- Google free tier requires **billing enabled** on the project; set a budget alert.
- Referrer restrictions deter abuse but aren't cryptographic — fine for a personal app,
  not for a product with paid quotas at stake.
- First utterance of a new phrase has network latency (~200–500ms); pre-fetch
  announcements one interval ahead to hide it.

## Sources

- https://cloud.google.com/text-to-speech/pricing
- https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys
- https://docs.cloud.google.com/text-to-speech/docs/reference/rest
- https://elevenlabs.io/pricing
- https://flexprice.io/blog/elevenlabs-pricing-breakdown
- https://tokenmix.ai/blog/tts-api-comparison
- https://awesomeagents.ai/pricing/voice-tts-pricing/
- https://kokoroweb.app/
- https://huggingface.co/posts/Xenova/620657830533509
- https://news.ycombinator.com/item?id=42973769
