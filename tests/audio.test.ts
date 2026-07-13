import { describe, expect, it } from 'vitest';
import { encouragement, pickVoice } from '../src/audio';

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
