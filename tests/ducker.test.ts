import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDucker, WORK_VOLUME } from '../src/spotify';

describe('createDucker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const volumes: number[] = [];
    return { volumes, d: createDucker((v) => volumes.push(v)) };
  };

  it('restores the base volume after a timed dip', () => {
    const { volumes, d } = setup();
    d.duck(0.5, 1300);
    expect(volumes.at(-1)).toBe(0.5);
    vi.advanceTimersByTime(1300);
    expect(volumes.at(-1)).toBe(WORK_VOLUME);
  });

  it('keeps the music down for the whole utterance, ignoring dips', () => {
    const { volumes, d } = setup();
    d.holdForSpeech();
    const held = volumes.at(-1)!;
    d.duck(0.5, 1300); // countdown beep landing mid-sentence
    vi.advanceTimersByTime(5000); // longer than any timed dip
    expect(volumes.at(-1)).toBe(held);
    expect(held).toBeLessThan(0.1);
    d.releaseSpeech();
    expect(volumes.at(-1)).toBe(WORK_VOLUME);
  });

  it('releases the hold if the speech-end event never arrives', () => {
    const { volumes, d } = setup();
    d.holdForSpeech();
    vi.advanceTimersByTime(30_000);
    expect(volumes.at(-1)).toBe(WORK_VOLUME);
  });

  it('a base change mid-hold applies when speech ends, not during it', () => {
    const { volumes, d } = setup();
    d.holdForSpeech();
    d.setBase(0.35);
    expect(volumes.at(-1)).toBeLessThan(0.1);
    d.releaseSpeech();
    expect(volumes.at(-1)).toBe(0.35);
  });
});
