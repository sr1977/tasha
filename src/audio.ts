let ctx: AudioContext | null = null;

export function initAudio(): void {
  try {
    ctx = ctx ?? new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
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
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // voice unavailable -> beeps only
  }
}
