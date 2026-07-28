import { describe, expect, it } from 'vitest';
import { encouragement, pickCalloutSlots, pickVoice } from '../src/audio';

describe('pickCalloutSlots', () => {
  it('gives a short set one shout-out and a long set two', () => {
    expect(pickCalloutSlots(30)).toHaveLength(1);
    expect(pickCalloutSlots(39)).toHaveLength(1);
    expect(pickCalloutSlots(40)).toHaveLength(2);
    expect(pickCalloutSlots(60)).toHaveLength(2);
  });

  it('never exceeds two, and never repeats a moment', () => {
    for (let secs = 5; secs <= 120; secs += 5) {
      for (let i = 0; i < 50; i++) {
        const slots = pickCalloutSlots(secs);
        expect(slots.length).toBeLessThanOrEqual(2);
        expect(new Set(slots).size).toBe(slots.length);
        expect(slots.every((s) => ['early', 'halfway', 'late'].includes(s))).toBe(true);
      }
    }
  });

  it('varies which moment speaks rather than always picking the same one', () => {
    const seen = new Set(Array.from({ length: 200 }, () => pickCalloutSlots(30)[0]));
    expect(seen.size).toBe(3);
  });
});

const v = (name: string, lang = 'en-GB') => ({ name, lang });

describe('pickVoice', () => {
  const voices = [
    v('Daniel'),
    v('Google UK English Male'),
    v('Google UK English Female'),
    v('Google US English', 'en-US'),
    v('Samantha', 'en-US'),
    v('Amélie', 'fr-CA'),
  ];

  it('returns the exact saved voice when present', () => {
    expect(pickVoice(voices, 'Daniel')!.name).toBe('Daniel');
  });

  it('falls back to auto preference when the saved name is gone', () => {
    expect(pickVoice(voices, 'Departed Voice')!.name).toBe('Google UK English Female');
  });

  it('prefers Google UK English Female', () => {
    expect(pickVoice(voices, null)!.name).toBe('Google UK English Female');
  });

  it('falls back to other Google female English voices', () => {
    const noUk = voices.filter((x) => x.name !== 'Google UK English Female');
    expect(pickVoice([...noUk, v('Google Australian English Female', 'en-AU')], null)!.name).toBe(
      'Google Australian English Female',
    );
  });

  it('falls back to known female system voices', () => {
    expect(pickVoice([v('Daniel'), v('Samantha', 'en-US')], null)!.name).toBe('Samantha');
  });

  it('returns null when nothing matches or list is empty', () => {
    expect(pickVoice([v('Daniel')], null)).toBeNull();
    expect(pickVoice([], null)).toBeNull();
  });
});

describe('encouragement', () => {
  it('always names the person', () => {
    for (let i = 0; i < 50; i++) expect(encouragement('Steve')).toContain('Steve');
  });
});
