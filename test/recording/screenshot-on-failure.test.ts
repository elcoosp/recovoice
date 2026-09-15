import { describe, it, expect } from 'vitest';
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

interface FailSession extends RecordingSession {
  screenshots: string[];
}

function makeFailingSession(failAt: number): FailSession {
  const screenshots: string[] = [];
  let calls = 0;
  return {
    screenshots,
    async startRecording() {},
    async stopRecording() {
      return { video: '/tmp/v.mp4' };
    },
    async executeAction() {
      calls++;
      if (calls === failAt) throw new Error('click failed');
    },
    async collectTelemetry() {
      return {
        events: [],
        timebaseOrigin: 0,
        viewport: { width: 1, height: 1 },
      };
    },
    async screenshot(path: string) {
      screenshots.push(path);
    },
    async close() {},
  };
}

function timings(...pairs: Array<[string, number, number]>): WordTiming[] {
  return pairs.map(([word, startMs, endMs]) => ({ word, startMs, endMs }));
}

describe('screenshot on action failure', () => {
  it('captures a screenshot when an action fails', async () => {
    const session = makeFailingSession(2);
    const segments = [
      seg(
        'click it now',
        [
          { name: 'click', args: ['#a'], sourceLine: 1 },
          { name: 'click', args: ['#b'], sourceLine: 2 },
        ],
        [1, 3],
      ),
    ];
    const voiceovers = [
      timings(['click', 0, 100], ['it', 100, 200], ['now', 200, 300]),
    ];

    await expect(
      executeTimedActions({
        session,
        segments,
        voiceoverTimings: voiceovers,
        sleep: async () => undefined,
        screenshotDir: '/tmp/failure-shots',
      }),
    ).rejects.toThrow(/Action "click" failed in segment 1/);

    expect(session.screenshots).toHaveLength(1);
    expect(session.screenshots[0]).toContain('failure-seg1-action2.png');
  });

  it('does not take a screenshot when screenshotDir is omitted', async () => {
    const session = makeFailingSession(1);
    const segments = [
      seg('go', [{ name: 'click', args: ['#a'], sourceLine: 1 }], [0]),
    ];
    const voiceovers = [timings(['go', 0, 100])];

    await expect(
      executeTimedActions({
        session,
        segments,
        voiceoverTimings: voiceovers,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow();
    expect(session.screenshots).toHaveLength(0);
  });

  it('preserves the original error message', async () => {
    const session = makeFailingSession(1);
    const segments = [
      seg('go', [{ name: 'click', args: ['#a'], sourceLine: 1 }], [0]),
    ];
    const voiceovers = [timings(['go', 0, 100])];
    try {
      await executeTimedActions({
        session,
        segments,
        voiceoverTimings: voiceovers,
        sleep: async () => undefined,
        screenshotDir: '/tmp/x',
      });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toContain('click failed');
    }
  });
});
