import { offSpeaking, onSpeaking } from './audio';

export type VoiceCommand = 'pause' | 'resume' | 'skip' | 'back' | 'nextTrack';

export function parseCommand(transcript: string): VoiceCommand | null {
  const t = transcript.toLowerCase();
  if (t.includes('next track')) return 'nextTrack';
  if (t.includes('pause')) return 'pause';
  if (t.includes('resume') || /\bgo\b/.test(t)) return 'resume';
  if (t.includes('skip')) return 'skip';
  if (t.includes('back')) return 'back';
  return null;
}

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function voiceSupported(): boolean {
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

export function createVoiceControl(
  onCommand: (cmd: VoiceCommand) => void,
): { stop(): void } | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;

  let stopped = false;
  let muted = false; // while our own announcements are speaking
  let errors = 0;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = 'en-GB';

  const tryStart = () => {
    try {
      rec.start();
    } catch {
      // already started -> fine
    }
  };

  rec.onresult = (e) => {
    if (muted || stopped) return;
    const last = e.results[e.results.length - 1]?.[0]?.transcript ?? '';
    const cmd = parseCommand(last);
    if (cmd) onCommand(cmd);
  };
  // Chrome ends continuous sessions periodically -> restart until stopped.
  rec.onend = () => {
    if (!stopped && !muted) tryStart();
  };
  rec.onerror = (e) => {
    // 'aborted' = our own self-mute; 'no-speech' = routine silence timeout.
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    console.warn('[tasha] voice recognition error:', e.error);
    // ponytail: two real strikes (mic denied etc.) -> voice stays off this workout
    if (++errors >= 2) stopped = true;
  };

  const speakingListener = (speaking: boolean) => {
    muted = speaking;
    if (speaking) {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    } else if (!stopped) {
      tryStart();
    }
  };
  onSpeaking(speakingListener);
  tryStart();

  return {
    stop() {
      stopped = true;
      offSpeaking(speakingListener);
      try {
        rec.abort();
      } catch {
        // ignore
      }
    },
  };
}
