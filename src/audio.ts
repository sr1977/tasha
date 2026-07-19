let ctx: AudioContext | null = null;
let speechListener: ((speaking: boolean) => void) | null = null;
let utteranceGen = 0;

export function initAudio(): void {
  try {
    ctx = ctx ?? new AudioContext();
    ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

export function onSpeaking(cb: (speaking: boolean) => void): void {
  speechListener = cb;
}

export function offSpeaking(cb: (speaking: boolean) => void): void {
  if (speechListener === cb) speechListener = null;
}

function tone(freq: number, ms: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
  osc.start();
  osc.stop(ctx.currentTime + ms / 1000);
}

export function beep(): void {
  tone(880, 150);
}

export function transitionTone(): void {
  tone(1320, 400);
}

export interface SpeakOpts {
  rate?: number;
  pitch?: number;
  volume?: number;
}

// Punchier delivery for the loud moments (work "Go!", encouragements, finish):
// faster + higher pitch reads as an energetic shout. Volume is already maxed.
export const SHOUT: SpeakOpts = { rate: 1.15, pitch: 1.3 };

// ---------- Google Cloud TTS (Chirp 3: HD) ----------

const TTS_CACHE = 'tasha-tts-v1';
const GOOGLE_VOICE_KEY = 'tasha.googleVoice';

export const GOOGLE_VOICES = [
  { name: 'en-GB-Chirp3-HD-Kore', label: 'Kore — firm female' },
  { name: 'en-GB-Chirp3-HD-Aoede', label: 'Aoede — breezy female' },
  { name: 'en-GB-Chirp3-HD-Leda', label: 'Leda — youthful female' },
  { name: 'en-GB-Chirp3-HD-Zephyr', label: 'Zephyr — bright female' },
  { name: 'en-GB-Chirp3-HD-Puck', label: 'Puck — upbeat male' },
  { name: 'en-GB-Chirp3-HD-Charon', label: 'Charon — deep male' },
  { name: 'en-GB-Chirp3-HD-Fenrir', label: 'Fenrir — excitable male' },
  { name: 'en-GB-Chirp3-HD-Orus', label: 'Orus — firm male' },
];

export function getGoogleVoice(): string {
  return localStorage.getItem(GOOGLE_VOICE_KEY) ?? GOOGLE_VOICES[0].name;
}

export function setGoogleVoice(name: string): void {
  localStorage.setItem(GOOGLE_VOICE_KEY, name);
}

function ttsKey(): string | null {
  return (
    localStorage.getItem('tasha.ttsKey') ??
    (import.meta.env.VITE_GOOGLE_TTS_KEY as string | undefined) ??
    null
  );
}

export function googleTtsActive(): boolean {
  return ttsKey() !== null;
}

let currentAudio: HTMLAudioElement | null = null;

// Phrases repeat every workout — cache synthesized MP3s so repeat announcements
// are instant, free, and work offline. The URL is only a cache key.
async function fetchTtsBlob(text: string, rate: number, key: string): Promise<Blob> {
  const voice = getGoogleVoice();
  const cacheReq = new Request(
    `https://tts.tasha.invalid/${voice}/${rate}/${encodeURIComponent(text)}`,
  );
  const cache = await caches.open(TTS_CACHE).catch(() => null);
  const hit = await cache?.match(cacheReq);
  if (hit) return hit.blob();
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'en-GB', name: voice },
      // Chirp 3: HD supports rate but not pitch — SHOUT's pitch only applies
      // to the local fallback voice.
      audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
    }),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const { audioContent } = (await res.json()) as { audioContent: string };
  const bytes = Uint8Array.from(atob(audioContent), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  cache?.put(cacheReq, new Response(blob)).catch(() => {});
  return blob;
}

function stopPlayback(): void {
  utteranceGen++; // orphan in-flight fetches and stale utterance callbacks
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  speechListener?.(false);
}

export function speak(text: string, opts: SpeakOpts = {}): void {
  const key = ttsKey();
  if (!key) {
    speakLocal(text, opts);
    return;
  }
  stopPlayback();
  const gen = ++utteranceGen;
  fetchTtsBlob(text, opts.rate ?? 1, key)
    // One retry absorbs transient API blips before dropping to the robot voice.
    .catch(() => fetchTtsBlob(text, opts.rate ?? 1, key))
    .then((blob) => {
      if (gen !== utteranceGen) return;
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      currentAudio = a;
      if (opts.volume !== undefined) a.volume = opts.volume;
      const failsafe = setTimeout(
        () => {
          if (gen === utteranceGen) speechListener?.(false);
        },
        Math.min(10_000, 1000 + text.length * 90),
      );
      const release = () => {
        clearTimeout(failsafe);
        URL.revokeObjectURL(url);
        if (gen === utteranceGen) speechListener?.(false);
      };
      a.onplay = () => {
        if (gen === utteranceGen) speechListener?.(true);
      };
      a.onended = release;
      a.onerror = release;
      a.play().catch(release);
    })
    .catch((err) => {
      // Offline / quota / bad key -> robot voice beats silence.
      console.warn('[tasha] Google TTS failed, falling back:', err);
      if (gen === utteranceGen) speakLocal(text, opts);
    });
}

function speakLocal(text: string, opts: SpeakOpts = {}): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const gen = ++utteranceGen;
    const u = new SpeechSynthesisUtterance(text);
    if (opts.rate !== undefined) u.rate = opts.rate;
    if (opts.pitch !== undefined) u.pitch = opts.pitch;
    if (opts.volume !== undefined) u.volume = opts.volume;
    const voice = pickVoice(listVoices(), getVoiceName());
    if (voice) u.voice = voice;
    // Chrome (especially with Google network voices) sometimes never fires
    // end/error for an utterance. Without a failsafe the speaking=true latch
    // would mute voice recognition permanently.
    const failsafe = setTimeout(
      () => {
        if (gen === utteranceGen) speechListener?.(false);
      },
      Math.min(10_000, 1000 + text.length * 90),
    );
    const release = () => {
      clearTimeout(failsafe);
      if (gen === utteranceGen) speechListener?.(false);
    };
    u.onstart = () => {
      if (gen === utteranceGen) speechListener?.(true);
    };
    u.onend = release;
    u.onerror = release;
    window.speechSynthesis.speak(u);
  } catch {
    // voice unavailable -> beeps only
  }
}

// Name flows at the end with no comma before it — the vocative comma makes TTS
// pause ("Push it, Steve") and sound staccato; "Push it Steve" reads as one line.
const ENCOURAGEMENTS = [
  (n: string) => `Come on ${n}!`,
  (n: string) => `Dig deep ${n}!`,
  (n: string) => `You've got this ${n}!`,
  (n: string) => `Push it ${n}!`,
  (n: string) => `Stay strong ${n}!`,
  (n: string) => `Don't quit now ${n}!`,
  (n: string) => `Looking powerful ${n}!`,
  (n: string) => `Own it ${n}!`,
  (n: string) => `Empty the tank ${n}!`,
  (n: string) => `Every rep counts ${n}!`,
  (n: string) => `Finish strong ${n}!`,
  (n: string) => `Dig in ${n}!`,
  (n: string) => `Keep the pace ${n}!`,
  (n: string) => `You're tougher than this ${n}!`,
  (n: string) => `Hold the line ${n}!`,
  (n: string) => `Breathe and drive ${n}!`,
  (n: string) => `No easing off ${n}!`,
  (n: string) => `Show me what you've got ${n}!`,
  (n: string) => `All the way ${n}!`,
  (n: string) => `Leave nothing behind ${n}!`,
  (n: string) => `Lock in ${n}!`,
  (n: string) => `Fire it up ${n}!`,
  (n: string) => `Grind it out ${n}!`,
  (n: string) => `Keep going ${n}!`,
  (n: string) => `Power through ${n}!`,
  (n: string) => `Beast mode ${n}!`,
  (n: string) => `Stay unstoppable ${n}!`,
  (n: string) => `You've got more ${n}!`,
  (n: string) => `Hold nothing back ${n}!`,
  (n: string) => `Eyes forward ${n}!`,
  (n: string) => `Don't stop ${n}!`,
  (n: string) => `Own this set ${n}!`,
  (n: string) => `One more gear ${n}!`,
  (n: string) => `Stay in it ${n}!`,
  (n: string) => `Crush it ${n}!`,
  (n: string) => `You're on fire ${n}!`,
  (n: string) => `Keep pounding ${n}!`,
  (n: string) => `Finish it ${n}!`,
  (n: string) => `Give it everything ${n}!`,
  (n: string) => `Rise up ${n}!`,
  (n: string) => `Heart and hustle ${n}!`,
  (n: string) => `Make it count ${n}!`,
  (n: string) => `Let's go ${n}!`,
  (n: string) => `Set the pace ${n}!`,
  (n: string) => `Bring it home ${n}!`,
];

/** A random motivational line aimed at a named person. */
export function encouragement(name: string): string {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)](name);
}

export function cancelSpeech(): void {
  stopPlayback();
}

// ---------- coach voice selection ----------

const VOICE_KEY = 'tasha.voiceName';
const FEMALE_SYSTEM_VOICES = ['Samantha', 'Karen', 'Moira', 'Tessa'];

export interface VoiceLike {
  name: string;
  lang: string;
}

export function pickVoice<T extends VoiceLike>(voices: T[], savedName: string | null): T | null {
  const saved = savedName ? voices.find((v) => v.name === savedName) : undefined;
  if (saved) return saved;
  return (
    voices.find((v) => v.name === 'Google UK English Female') ??
    voices.find(
      (v) => v.name.startsWith('Google') && v.lang.startsWith('en') && v.name.includes('Female'),
    ) ??
    voices.find((v) => FEMALE_SYSTEM_VOICES.includes(v.name)) ??
    null
  );
}

let voiceCache: SpeechSynthesisVoice[] = [];

function refreshVoices(): void {
  try {
    voiceCache = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith('en'));
  } catch {
    voiceCache = [];
  }
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (voiceCache.length === 0) refreshVoices();
  return voiceCache;
}

if (typeof window !== 'undefined') {
  try {
    window.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices);
  } catch {
    // no speech synthesis -> picker stays hidden
  }
}

export function getVoiceName(): string | null {
  return localStorage.getItem(VOICE_KEY);
}

export function setVoiceName(name: string): void {
  if (name) localStorage.setItem(VOICE_KEY, name);
  else localStorage.removeItem(VOICE_KEY);
}
