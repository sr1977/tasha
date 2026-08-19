import type { Equipment } from './types';

let ctx: AudioContext | null = null;
const speechListeners = new Set<(speaking: boolean) => void>();
const speechListener = (speaking: boolean) => speechListeners.forEach((cb) => cb(speaking));
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
  speechListeners.add(cb);
}

export function offSpeaking(cb: (speaking: boolean) => void): void {
  speechListeners.delete(cb);
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

// No volume option: the coach always speaks at maximum — both playback paths
// pin volume to 1 in speak()/speakLocal().
export interface SpeakOpts {
  rate?: number;
  pitch?: number;
}

// Punchier delivery for the loud moments (work "Go!", encouragements, finish):
// higher pitch reads as an energetic shout. Rate stays at 1 — faster delivery
// sounded rushed and muddied the words. Volume is already maxed.
export const SHOUT: SpeakOpts = { pitch: 1.3 };

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

// Element volume caps at 1.0 — to go louder the clip must route through the
// WebAudio graph. Compressor tames the peaks the boost would otherwise clip.
// ponytail: fixed 2x boost, make it a setting if it ever needs tuning.
const VOICE_BOOST = 2;

function boostVoice(a: HTMLAudioElement): void {
  // A suspended context would silence the element entirely (the graph becomes
  // its only output) — skip the boost and play plain rather than risk that.
  if (!ctx || ctx.state !== 'running') return;
  try {
    const gain = ctx.createGain();
    gain.gain.value = VOICE_BOOST;
    const comp = ctx.createDynamicsCompressor();
    ctx.createMediaElementSource(a).connect(gain);
    gain.connect(comp);
    comp.connect(ctx.destination);
  } catch {
    // graph hookup failed -> element plays at normal volume
  }
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
  speechListener(false);
}

export function speak(text: string, opts: SpeakOpts = {}): void {
  const key = ttsKey();
  if (!key) {
    speakLocal(text, opts);
    return;
  }
  stopPlayback();
  const gen = ++utteranceGen;
  // Hold the music down from the moment speech is requested — a slow TTS
  // fetch must not let it fade back up before the voice even starts. The
  // ducker's backstop releases the hold if playback never materialises.
  speechListener(true);
  fetchTtsBlob(text, opts.rate ?? 1, key)
    // One retry absorbs transient API blips before dropping to the robot voice.
    .catch(() => fetchTtsBlob(text, opts.rate ?? 1, key))
    .then((blob) => {
      if (gen !== utteranceGen) return;
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      currentAudio = a;
      a.volume = 1;
      boostVoice(a);
      const expire = () => {
        if (gen === utteranceGen) speechListener(false);
      };
      // Guesswork from character count used to expire mid-sentence and let the
      // music back up; the clip's own duration is the truth once metadata lands.
      let failsafe = setTimeout(expire, 20_000);
      a.onloadedmetadata = () => {
        clearTimeout(failsafe);
        if (Number.isFinite(a.duration)) failsafe = setTimeout(expire, a.duration * 1000 + 2000);
      };
      const release = () => {
        clearTimeout(failsafe);
        URL.revokeObjectURL(url);
        expire();
      };
      a.onplay = () => {
        if (gen === utteranceGen) speechListener(true);
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
    // Chrome's network voices can take a beat to start — hold the music now.
    speechListener(true);
    const u = new SpeechSynthesisUtterance(text);
    if (opts.rate !== undefined) u.rate = opts.rate;
    if (opts.pitch !== undefined) u.pitch = opts.pitch;
    u.volume = 1;
    const voice = pickVoice(listVoices(), getVoiceName());
    if (voice) u.voice = voice;
    // Chrome (especially with Google network voices) sometimes never fires
    // end/error for an utterance. Without a failsafe the speaking=true latch
    // would mute voice recognition permanently.
    // No duration API here, so estimate generously — firing early would fade the
    // music up mid-sentence; firing late costs a moment of quiet music.
    const failsafe = setTimeout(
      () => {
        if (gen === utteranceGen) speechListener(false);
      },
      Math.min(25_000, 2000 + text.length * 130),
    );
    const release = () => {
      clearTimeout(failsafe);
      if (gen === utteranceGen) speechListener(false);
    };
    u.onstart = () => {
      if (gen === utteranceGen) speechListener(true);
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
  (n: string) => `Every repetition counts ${n}!`,
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

// Drill-sergeant jabs — parade-ground bark, British seasoning, household-safe.
const JABS = [
  (n: string) => `${n}! Snails are LAPPING you and they carry their HOUSE!`,
  (n: string) => `Pick it up, ${n}! I've seen faster movement in a DOCTOR'S WAITING ROOM!`,
  (n: string) => `${n}, that's not effort — that's a GENTLE SUGGESTION of effort!`,
  (n: string) => `Oi, ${n}! This is a circuit, not a SUNDAY STROLL round the garden centre!`,
  (n: string) => `${n}! A traffic cone contributes more and it just STANDS there!`,
  (n: string) => `Is that your top speed, ${n}, or are you BUFFERING?`,
  (n: string) => `${n}, the BIN LORRY shows up with more enthusiasm — and it's TUESDAY!`,
  (n: string) => `Are those arms working, ${n}, or just WAVING GOODBYE to the effort?`,
  (n: string) => `${n}! You move like you're wading through COLD CUSTARD!`,
  (n: string) => `Look lively, ${n}! Even the QUEUE at the tip moves faster!`,
  (n: string) => `${n}, a garden GNOME has more explosive power — and it's CONCRETE!`,
  (n: string) => `Budge yourself, ${n}, before I put you on ROADWORKS duty!`,
  (n: string) => `${n}! You're wobbling about like a SHOPPING TROLLEY with a bad wheel!`,
  (n: string) => `Should I book an APPOINTMENT for that next rep, ${n}?`,
  (n: string) => `${n}, if faffing were an Olympic sport you'd be on the STAMPS!`,
  (n: string) => `The toaster pops with more urgency than you, ${n}!`,
  (n: string) => `${n}! Less pondering, more PUMMELLING!`,
  (n: string) => `Bravo, ${n} — slowest rep I've ever WITNESSED! Now double it!`,
  (n: string) => `${n}, you're rattling round like a BUS SHELTER in a storm!`,
  (n: string) => `Come on, ${n}! GLACIERS retreat with more urgency!`,
];

// Evil-mode jabs — properly acerbic. ONLY reachable when the nasty dial is
// maxed (EVIL MODE); jab() must never draw these otherwise.
export const EVIL_JABS = [
  (n: string) => `${n}! The floor is filing a COMPLAINT about the load-bearing work!`,
  (n: string) => `Move, ${n}! That belly arrived at the exercise BEFORE you did!`,
  (n: string) => `${n}, you're not big-boned — you're LAZY with a PADDED EXCUSE!`,
  (n: string) => `Is that a physique, ${n}, or a CRY FOR HELP in a t-shirt?`,
  (n: string) => `${n}! Your idea of cardio is REACHING for the BISCUIT TIN!`,
  (n: string) => `Gravity works overtime on you, ${n} — give it a HAND for once!`,
  (n: string) => `${n}, you've got the work ethic of a DRAUGHT EXCLUDER!`,
  (n: string) => `The sofa has a RESTRAINING ORDER out on you, ${n} — it needs SPACE!`,
  (n: string) => `${n}! You didn't earn that body, you ORDERED IT IN!`,
  (n: string) => `Sweat is just fat CRYING, ${n} — so make it WEEP!`,
  (n: string) => `${n}, your muscles filed a MISSING PERSONS report YEARS ago!`,
  (n: string) => `Lazy? ${n}, you'd outsource BREATHING if there was an app!`,
  (n: string) => `${n}! Every takeaway in town knows your order — let's make them FORGET!`,
  (n: string) => `That waistline is a MONUMENT to sitting down, ${n} — DEMOLISH it!`,
  (n: string) => `${n}, you burn fewer calories than the FRIDGE LIGHT you keep triggering!`,
  (n: string) => `Run, ${n}! Pretend the ICE CREAM VAN is leaving!`,
] as const;

// Stand-in targets when no roster name is available (solo mode).
export const VOCATIVES = ['sunshine', 'princess', 'champ', 'sleeping beauty', 'your majesty', 'buttercup'];

// No jab repeats — regardless of who it's aimed at — until its whole pool has
// been heard: shuffled-deck draw, one deck per pool, refilled only on exhaustion.
const jabDecks = new Map<readonly ((n: string) => string)[], ((n: string) => string)[]>();
function drawJab(pool: readonly ((n: string) => string)[]): (n: string) => string {
  let deck = jabDecks.get(pool);
  if (!deck || deck.length === 0) {
    deck = [...pool];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    jabDecks.set(pool, deck);
  }
  return deck.pop()!;
}

/** A playful insult aimed at a named person (or a cheeky stand-in). Never
 * repeats a line — even at a different person — until the pool is exhausted.
 * `evil` switches to the acerbic pool — pass true ONLY in EVIL MODE (nasty === 1). */
export function jab(name?: string, evil = false): string {
  const n = name ?? VOCATIVES[Math.floor(Math.random() * VOCATIVES.length)];
  return drawJab(evil ? EVIL_JABS : JABS)(n);
}

// Mid-set halfway shouts — pure enthusiasm, no name needed (solo mode).
const HALFWAY_SHOUTS = [
  "HALFWAY! You are ON FIRE — light it up!",
  "Yes! Halfway down and you look UNSTOPPABLE!",
  "Halfway! This is YOUR moment — take it!",
  "Boom — halfway! You're stronger than you know — prove it!",
  "Halfway there and you are CRUSHING it — keep flying!",
  "Halfway! I love what I'm seeing — give me MORE!",
  "You're over the top — this back half belongs to YOU!",
  "Halfway home — you were BUILT for this — unleash it!",
  "Second half, best half — show me something LEGENDARY!",
  "HALFWAY! Every repetition from here makes you a champion — GO!",
];

/** A random high-energy halfway shout for solo mode. */
export function halfwayShout(): string {
  return HALFWAY_SHOUTS[Math.floor(Math.random() * HALFWAY_SHOUTS.length)];
}

// Equipment-keyed shout-outs — the coach reacting to what's actually being
// done. Optional trailing name, no vocative comma (see ENCOURAGEMENTS).
const ACTIVITY_SHOUTS: Record<Equipment, ((n?: string) => string)[]> = {
  dumbbells: [
    (n) => `Keep pushing that weight${n ? ' ' + n : ''}!`,
    (n) => `Make those dumbbells earn their keep${n ? ' ' + n : ''}!`,
    (n) => `Heavy is the point — move it${n ? ' ' + n : ''}!`,
    (n) => `Grip it and rip it${n ? ' ' + n : ''}!`,
    (n) => `That iron doesn't lift itself${n ? ' ' + n : ''}!`,
    (n) => `Squeeze the handles and drive${n ? ' ' + n : ''}!`,
    (n) => `Own every rep of that weight${n ? ' ' + n : ''}!`,
    (n) => `Push that weight like it owes you money${n ? ' ' + n : ''}!`,
  ],
  'medicine ball': [
    (n) => `Attack that ball${n ? ' ' + n : ''}!`,
    (n) => `Control the ball — don't let it control you${n ? ' ' + n : ''}!`,
    (n) => `Make that ball work${n ? ' ' + n : ''}!`,
    (n) => `Squeeze that ball like it insulted you${n ? ' ' + n : ''}!`,
    (n) => `Every rep sharper than the last${n ? ' ' + n : ''}!`,
    (n) => `That ball is your engine — rev it${n ? ' ' + n : ''}!`,
  ],
  bodyweight: [
    (n) => `Just you and gravity — beat it${n ? ' ' + n : ''}!`,
    (n) => `No kit, no excuses${n ? ' ' + n : ''}!`,
    (n) => `Your body is the machine — run it hot${n ? ' ' + n : ''}!`,
    (n) => `Nothing to blame but gravity${n ? ' ' + n : ''}!`,
    (n) => `Move that body like you mean it${n ? ' ' + n : ''}!`,
    (n) => `You carry the load — carry it proud${n ? ' ' + n : ''}!`,
  ],
};

/** A random shout keyed to the exercise's equipment; optional trailing name. */
export function activityShout(equipment: Equipment, name?: string): string {
  const pool = ACTIVITY_SHOUTS[equipment];
  return pool[Math.floor(Math.random() * pool.length)](name);
}

/** A mid-set form callout: one of the exercise's cues, shouted. Names the
 * exercise (not a person) so partners on different stations know who it's for. */
export function formShout(cues: string[], exercise?: string): string {
  const c = cues[Math.floor(Math.random() * cues.length)];
  const cue = `${c.charAt(0).toUpperCase()}${c.slice(1)}!`;
  return exercise ? `On the ${exercise.toLowerCase()} — ${cue}` : cue;
}

// Collective terms — the coach addressing the whole session rather than one
// person. Kept separate from ENCOURAGEMENTS because those require a name.
const TEAM_NAMES = ['team', 'everyone', 'all of you', 'you lot'];

// Trailing collective flows without a vocative comma, same as ENCOURAGEMENTS.
const TEAM_SHOUTS: ((t: string) => string)[] = [
  (t) => `Go ${t}!`,
  (t) => `Come on ${t} — we've got this!`,
  (t) => `Together now ${t} — drive!`,
  (t) => `That's it ${t} — keep it moving!`,
  (t) => `All in ${t} — no passengers!`,
  (t) => `Push as one ${t}!`,
  (t) => `Stronger together ${t} — go!`,
  (t) => `Keep each other honest ${t}!`,
  (t) => `One pace ${t} — full gas!`,
  (t) => `Carry each other ${t} — big effort!`,
  (t) => `Make some noise ${t}!`,
  (t) => `Finish this together ${t}!`,
];

/** A random collective shout. Pass a label to address a specific group. */
export function teamShout(label?: string): string {
  const t = label ?? TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)];
  return TEAM_SHOUTS[Math.floor(Math.random() * TEAM_SHOUTS.length)](t);
}

// Generic mid-set push shouts — no positional wording, fire anywhere in a set.
const PUSH_SHOUTS = [
  "Keep that pace UP!",
  "Strong! Stay strong!",
  "Drive! Drive! Drive!",
  "Don't you dare slow down!",
  "Big effort — right NOW!",
  "Push! You've got plenty left!",
  "Faster! Harder! GO!",
  "That's it — keep it burning!",
  "Attack it! ATTACK it!",
  "Full gas — no coasting!",
  "Squeeze every second!",
  "Finish STRONG!",
];

/** A random position-agnostic push shout. */
export function pushShout(): string {
  return PUSH_SHOUTS[Math.floor(Math.random() * PUSH_SHOUTS.length)];
}

// Witty warm-up jibes — one per warm-up move, promising pain to come.
const WARMUP_JIBES = [
  "Enjoy this bit — it's the last easy thing happening today!",
  "Limber up, I have PLANS for you lot!",
  "This is the calm before MY storm!",
  "Loosen those limbs — I intend to USE them!",
  "Savour it — in ten minutes you'll be dreaming of warm-ups!",
  "I hope you had your porridge, you're going to need it!",
  "Warm muscles, zero excuses — that's the deal!",
  "Get that blood moving — where you're going, you'll want it!",
];

export type CalloutSlot = 'early' | 'halfway' | 'late';
const CALLOUT_SLOTS: CalloutSlot[] = ['early', 'halfway', 'late'];

/**
 * Which moments of a work set get a shout-out. All three turns the coach into a
 * running commentary, so a set gets one — two once it's long enough to carry it
 * — drawn at random so no single moment is always the one that speaks.
 */
export function pickCalloutSlots(secs: number, rand: () => number = Math.random): CalloutSlot[] {
  const a = [...CALLOUT_SLOTS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, secs >= 40 ? 2 : 1);
}

/** A random warm-up jibe about the hard work coming. */
export function warmupJibe(): string {
  return WARMUP_JIBES[Math.floor(Math.random() * WARMUP_JIBES.length)];
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
