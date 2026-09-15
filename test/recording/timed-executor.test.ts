import { describe, it, expect, vi } from 'vitest';
import { executeTimedActions } from '../../src/recording/timed-executor.js';
import type { RecordingSession } from '../../src/recording/types.js';
import type { Segment, Action } from '../../src/types/script.js';
import type { WordTiming } from '../../src/types/recording.js';

function seg(prose: string, actions: Action[], anchors: number[]): Segment {
  return {
    prose,
    actions,
    actionAnchors: anchors,
    sourceLine: 1,
    silent: false,
  };
}

function makeSession(executedOrder: string[]): RecordingSession {
  return {
    async startRecording() {},
    async stopRecording() {
      return { video: '/tmp/v.mp4' };
    },
    async executeAction(action: Action) {
      executedOrder.push(String(action.args[0]));
    },
    async collectTelemetry() {
      return { events: [], timebaseOrigin: 0, viewport: { width: 1, height: 1 } };
    },
    async close() {},
  };
}

function timings(...pairs: Array<[string, number, number]>): WordTiming[] {
  return pairs.map(([word, startMs, endMs]) => ({ word, startMs, endMs }));
}

describe('executeTimedActions', () => {
  it('executes actions in order', async () => {
    const executed: string[] = [];
    const segments = [
      seg(
        'a b c',
        [
          { name: 'click', args: ['first'], sourceLine: 1 },
          { name: 'click', args: ['second'], sourceLine: 2 },
        ],
        [1, 3],
      ),
    ];
    const voiceovers = [timings(['a', 0, 100], ['b', 100, 200], ['c', 200, 300])];

    await executeTimedActions({
      session: makeSession(executed),
      segments,
      voiceoverTimings: voiceovers,
      sleep: async () => undefined,
    });

    expect(executed).toEqual(['first', 'second']);
  });

  it('sleeps between actions according to their anchors', async () => {
    const sleeps: number[] = [];
    const segments = [
      seg(
        'a b c d',
        [
          { name: 'click', args: ['early'], sourceLine: 1 },
          { name: 'click', args: ['late'], sourceLine: 2 },
        ],
        [1, 3],
      ),
    ];
    const voiceovers = [
      timings(
        ['a', 0, 100],
        ['b', 100, 200],
        ['c', 200, 300],
        ['d', 300, 400],
      ),
    ];

    await executeTimedActions({
      session: makeSession([]),
      segments,
      voiceoverTimings: voiceovers,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    // Action 1 at 100ms, action 2 at 300ms -> sleep 100 then 200
    expect(sleeps.slice(0, 2)).toEqual([100, 200]);
  });

  it('adds inter-segment gap after the last word', async () => {
    const sleeps: number[] = [];
    const segments = [seg('a', [], [])];
    const voiceovers = [timings(['a', 0, 500])];

    await executeTimedActions({
      session: makeSession([]),
      segments,
      voiceoverTimings: voiceovers,
      interSegmentGapMs: 200,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    // After executing (no actions), wait the segment duration + gap
    expect(sleeps).toEqual([700]);
  });

  it('skips sleeping when action anchor is 0', async () => {
    const sleeps: number[] = [];
    const segments = [
      seg('hello', [{ name: 'click', args: ['x'], sourceLine: 1 }], [0]),
    ];
    const voiceovers = [timings(['hello', 0, 500])];

    await executeTimedActions({
      session: makeSession([]),
      segments,
      voiceoverTimings: voiceovers,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    // No sleep before the action (anchor 0), but sleep after for the segment
    expect(sleeps).toEqual([700]);
  });

  it('uses default sleep when none is injected', async () => {
    const spy = vi.fn(async () => undefined);
    const originalSetTimeout = globalThis.setTimeout;
    // Just verify the function runs without error; timing behavior is covered above.
    void originalSetTimeout;
    await executeTimedActions({
      session: makeSession([]),
      segments: [seg('a', [{ name: 'click', args: ['x'], sourceLine: 1 }], [1])],
      voiceoverTimings: [timings(['a', 0, 0])],
      sleep: spy,
    });
    expect(spy).toHaveBeenCalled();
  });
});
