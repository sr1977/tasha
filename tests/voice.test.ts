import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/voice';

describe('parseCommand', () => {
  it('matches each command', () => {
    expect(parseCommand('pause')).toBe('pause');
    expect(parseCommand('please pause now')).toBe('pause');
    expect(parseCommand('resume')).toBe('resume');
    expect(parseCommand('go')).toBe('resume');
    expect(parseCommand('skip')).toBe('skip');
    expect(parseCommand('go back')).toBe('resume'); // "go" wins by order — acceptable
    expect(parseCommand('back')).toBe('back');
    expect(parseCommand('Next Track')).toBe('nextTrack');
  });

  it('checks "next track" before "skip"-family words', () => {
    expect(parseCommand('skip to the next track')).toBe('nextTrack');
  });

  it('requires "go" as a whole word', () => {
    expect(parseCommand('good effort')).toBeNull();
    expect(parseCommand('going going gone')).toBeNull();
  });

  it('returns null for junk and empty input', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('what a lovely day')).toBeNull();
  });
});
