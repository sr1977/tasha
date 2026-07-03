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

export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const gen = ++utteranceGen;
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => {
      if (gen === utteranceGen) speechListener?.(true);
    };
    u.onend = () => {
      if (gen === utteranceGen) speechListener?.(false);
    };
    u.onerror = () => {
      if (gen === utteranceGen) speechListener?.(false);
    };
    window.speechSynthesis.speak(u);
  } catch {
    // voice unavailable -> beeps only
  }
}

export function cancelSpeech(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}
