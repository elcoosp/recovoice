import { describe, it, expect } from 'vitest';
import {
  generateCuesFromSegments,
  cuesToSrt,
} from '../../src/caption/generator.js';
import type { WordTiming } from '../../src/types/recording.js';

function timings(...pairs: Array<[string, number, number]>): WordTiming[] {
  return pairs.map(([word, startMs, endMs]) => ({ word, startMs, endMs }));
}

describe('generateCuesFromSegments', () => {
  it('offsets cues from the segment start', () => {
    const cues = generateCuesFromSegments([
      {
        timings: timings(['Hello', 0, 400], ['world.', 400, 900]),
        startOffsetMs: 1000,
      },
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.startMs).toBe(1000);
    expect(cues[0]!.endMs).toBe(1900);
    expect(cues[0]!.text).toBe('Hello world.');
  });

  it('uses override text when present, spanning the whole segment', () => {
    const cues = generateCuesFromSegments([
      {
        timings: timings(['This', 0, 100], ['is', 100, 200], ['spoken.', 200, 500]),
        startOffsetMs: 0,
        overrideText: 'Short on screen.',
      },
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Short on screen.');
    expect(cues[0]!.startMs).toBe(0);
    expect(cues[0]!.endMs).toBe(500);
  });

  it('handles mixed override and non-override segments in one stream', () => {
    const cues = generateCuesFromSegments([
      {
        timings: timings(['First', 0, 300], ['line.', 300, 700]),
        startOffsetMs: 0,
      },
      {
        timings: timings(['Spoken', 0, 200], ['text.', 200, 500]),
        startOffsetMs: 900,
        overrideText: 'On screen.',
      },
      {
        timings: timings(['Final', 0, 300], ['line.', 300, 700]),
        startOffsetMs: 1600,
      },
    ]);
    expect(cues).toHaveLength(3);
    expect(cues[0]!.text).toBe('First line.');
    expect(cues[0]!.startMs).toBe(0);
    expect(cues[1]!.text).toBe('On screen.');
    expect(cues[1]!.startMs).toBe(900);
    expect(cues[1]!.endMs).toBe(1400);
    expect(cues[2]!.text).toBe('Final line.');
    expect(cues[2]!.startMs).toBe(1600);
  });

  it('assigns monotonically increasing indices across all cues', () => {
    const cues = generateCuesFromSegments([
      { timings: timings(['A.', 0, 100]), startOffsetMs: 0 },
      { timings: timings(['B.', 0, 100]), startOffsetMs: 200 },
    ]);
    expect(cues.map((c) => c.index)).toEqual([1, 2]);
  });

  it('skips segments with no timings and no override', () => {
    const cues = generateCuesFromSegments([
      { timings: [], startOffsetMs: 0 },
      { timings: timings(['Real.', 0, 100]), startOffsetMs: 500 },
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Real.');
  });

  it('produces SRT that round-trips correctly', () => {
    const cues = generateCuesFromSegments([
      {
        timings: timings(['Narrated.', 0, 500]),
        startOffsetMs: 0,
        overrideText: 'On screen.',
      },
    ]);
    const srt = cuesToSrt(cues);
    expect(srt).toContain('On screen.');
    expect(srt).toContain('00:00:00,000 --> 00:00:00,500');
  });
});
