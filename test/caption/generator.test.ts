import { describe, it, expect } from 'vitest';
import {
  generateCues,
  cuesToSrt,
  cuesToVtt,
} from '../../src/caption/generator.js';
import type { WordTiming } from '../../src/types/recording.js';

const timings: WordTiming[] = [
  { word: 'Welcome', startMs: 0, endMs: 400 },
  { word: 'to', startMs: 400, endMs: 500 },
  { word: 'Acme.', startMs: 500, endMs: 900 },
  { word: 'This', startMs: 1000, endMs: 1200 },
  { word: 'is', startMs: 1200, endMs: 1300 },
  { word: 'the', startMs: 1300, endMs: 1400 },
  { word: 'demo.', startMs: 1400, endMs: 1800 },
];

describe('generateCues', () => {
  it('groups words into sentence-bounded cues', () => {
    const cues = generateCues(timings);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('Welcome to Acme.');
    expect(cues[1]!.text).toBe('This is the demo.');
  });

  it('assigns cue timings from the underlying word boundaries', () => {
    const cues = generateCues(timings);
    expect(cues[0]!.startMs).toBe(0);
    expect(cues[0]!.endMs).toBe(900);
    expect(cues[1]!.startMs).toBe(1000);
    expect(cues[1]!.endMs).toBe(1800);
  });

  it('splits long sentences at maxCueDurationMs', () => {
    const long: WordTiming[] = [];
    for (let i = 0; i < 100; i++) {
      long.push({ word: `w${i}`, startMs: i * 200, endMs: (i + 1) * 200 });
    }
    const cues = generateCues(long, { maxCueDurationMs: 2000 });
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      expect(cue.endMs - cue.startMs).toBeLessThanOrEqual(2000);
    }
  });

  it('splits at maxCharsPerCue when a sentence is long', () => {
    const long: WordTiming[] = [];
    for (let i = 0; i < 50; i++) {
      long.push({ word: 'x'.repeat(20), startMs: i * 100, endMs: (i + 1) * 100 });
    }
    const cues = generateCues(long, { maxCharsPerCue: 60 });
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      expect(cue.text.length).toBeLessThanOrEqual(80);
    }
  });

  it('returns empty array for empty input', () => {
    expect(generateCues([])).toEqual([]);
  });
});

describe('cuesToSrt', () => {
  it('emits SRT with sequential indices and formatted timestamps', () => {
    const cues = generateCues(timings);
    const srt = cuesToSrt(cues);
    expect(srt).toMatch(/^1\r?\n/);
    expect(srt).toContain('00:00:00,000 --> 00:00:00,900');
    expect(srt).toContain('Welcome to Acme.');
    expect(srt).toContain('\n2\n');
  });

  it('produces a trailing newline', () => {
    const cues = generateCues(timings);
    const srt = cuesToSrt(cues);
    expect(srt.endsWith('\n')).toBe(true);
  });
});

describe('cuesToVtt', () => {
  it('emits WebVTT with header and dotted timestamps', () => {
    const cues = generateCues(timings);
    const vtt = cuesToVtt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:00.900');
    expect(vtt).toContain('Welcome to Acme.');
  });
});
