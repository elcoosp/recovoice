import { describe, it, expect } from 'vitest';
import {
  scheduleActions,
  absoluteActionTimes,
} from '../../src/recording/timing.js';
import type { Segment } from '../../src/types/script.js';
import type { WordTiming } from '../../src/types/recording.js';

function segment(
  prose: string,
  actionCount: number,
  anchors: number[],
): Segment {
  return {
    prose,
    actions: Array.from({ length: actionCount }, (_, i) => ({
      name: 'click',
      args: [`#s${i}`],
      sourceLine: 1,
    })),
    actionAnchors: anchors,
    sourceLine: 1,
    silent: false,
  };
}

function timings(...words: Array<[string, number, number]>): WordTiming[] {
  return words.map(([word, startMs, endMs]) => ({ word, startMs, endMs }));
}

describe('scheduleActions', () => {
  it('returns zero offset for anchor 0 (action before any word)', () => {
    const segments = [segment('Hello world.', 1, [0])];
    const voiceovers = [timings(['Hello', 0, 400], ['world.', 400, 900])];
    const result = scheduleActions(segments, voiceovers);
    expect(result[0]!.scheduledActions[0]!.offsetMs).toBe(0);
  });

  it('returns the end time of word N-1 for anchor N', () => {
    const segments = [segment('Hello brave world.', 1, [2])];
    const voiceovers = [
      timings(['Hello', 0, 400], ['brave', 400, 800], ['world.', 800, 1200]),
    ];
    const result = scheduleActions(segments, voiceovers);
    // Anchor 2 -> after word index 1 ("brave") -> 800 ms
    expect(result[0]!.scheduledActions[0]!.offsetMs).toBe(800);
  });

  it('returns the end of the last word when anchor exceeds word count', () => {
    const segments = [segment('Hi.', 1, [99])];
    const voiceovers = [timings(['Hi.', 0, 500])];
    const result = scheduleActions(segments, voiceovers);
    expect(result[0]!.scheduledActions[0]!.offsetMs).toBe(500);
  });

  it('handles multiple actions with different anchors', () => {
    const segments = [segment('a b c d', 2, [1, 3])];
    const voiceovers = [
      timings(
        ['a', 0, 100],
        ['b', 100, 200],
        ['c', 200, 300],
        ['d', 300, 400],
      ),
    ];
    const result = scheduleActions(segments, voiceovers);
    // Anchor 1 -> after word 0 ("a") -> 100 ms
    // Anchor 3 -> after word 2 ("c") -> 300 ms
    expect(result[0]!.scheduledActions.map((s) => s.offsetMs)).toEqual([
      100, 300,
    ]);
  });

  it('returns zero offsets when there are no word timings', () => {
    const segments = [segment('Hello.', 1, [1])];
    const voiceovers: WordTiming[][] = [[]];
    const result = scheduleActions(segments, voiceovers);
    expect(result[0]!.scheduledActions[0]!.offsetMs).toBe(0);
  });

  it('handles segments with no actions', () => {
    const segments = [segment('Just prose.', 0, [])];
    const voiceovers = [timings(['Just', 0, 200], ['prose.', 200, 500])];
    const result = scheduleActions(segments, voiceovers);
    expect(result[0]!.scheduledActions).toEqual([]);
  });
});

describe('absoluteActionTimes', () => {
  it('adds the segment start offset to each action time', () => {
    const segments = [
      segment('First segment.', 1, [1]),
      segment('Second segment.', 1, [1]),
    ];
    const voiceovers = [
      timings(['First', 0, 400], ['segment.', 400, 900]),
      timings(['Second', 0, 400], ['segment.', 400, 900]),
    ];
    const scheduled = scheduleActions(segments, voiceovers);
    // Segment 0 starts at 0, segment 1 starts at 1000ms
    const absolute = absoluteActionTimes(scheduled, [
      { startMs: 0, durationMs: 900 },
      { startMs: 1000, durationMs: 900 },
    ]);
    expect(absolute).toHaveLength(2);
    expect(absolute[0]!.absoluteMs).toBe(400);
    expect(absolute[1]!.absoluteMs).toBe(1400);
  });

  it('returns an empty list for empty input', () => {
    expect(absoluteActionTimes([], [])).toEqual([]);
  });
});
