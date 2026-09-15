import type { RecordingSession } from './types.js';
import type { Segment } from '../types/script.js';
import type { WordTiming } from '../types/recording.js';
import { scheduleActions } from './timing.js';

export interface TimedExecutorOptions {
  session: RecordingSession;
  segments: Segment[];
  voiceoverTimings: WordTiming[][];
  /**
   * Extra gap to add after each segment beyond the last word's endMs,
   * matching the audio track composition (default 200ms).
   */
  interSegmentGapMs?: number;
  /**
   * Inject a clock for testing. Defaults to setTimeout-based sleep.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Directory for failure screenshots. If omitted, no screenshot is taken.
   */
  screenshotDir?: string;
}

/**
 * Executes actions against a recording session, timing them to the position
 * of their anchors within the corresponding segment's voiceover.
 *
 * Segments are played back in order. Within a segment, actions fire when the
 * wall clock reaches their computed offset from segment start.
 */
export async function executeTimedActions(
  options: TimedExecutorOptions,
): Promise<void> {
  const {
    session,
    segments,
    voiceoverTimings,
    interSegmentGapMs = 200,
    sleep = defaultSleep,
    screenshotDir,
  } = options;

  const scheduled = scheduleActions(segments, voiceoverTimings);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const segSchedule = scheduled[i]!;
    const sortedActions = [...segSchedule.scheduledActions].sort(
      (a, b) => a.offsetMs - b.offsetMs,
    );

    let cursorMs = 0;
    for (const sa of sortedActions) {
      const wait = Math.max(0, sa.offsetMs - cursorMs);
      if (wait > 0) await sleep(wait);
      cursorMs = sa.offsetMs;
      const action = segment.actions[sa.actionIndex]!;
      try {
        await session.executeAction(action);
      } catch (err) {
        if (screenshotDir && session.screenshot) {
          const { mkdirSync } = await import('node:fs');
          const { join } = await import('node:path');
          try {
            mkdirSync(screenshotDir, { recursive: true });
            const shotPath = join(
              screenshotDir,
              `failure-seg${i + 1}-action${sa.actionIndex + 1}.png`,
            );
            await session.screenshot(shotPath);
          } catch {
            // Screenshot is best-effort; ignore secondary failures.
          }
        }
        throw new Error(
          `Action "${action.name}" failed in segment ${i + 1}: ${(err as Error).message}`,
        );
      }
    }

    // Wait out the remainder of the segment, plus the inter-segment gap
    const segmentEndMs =
      voiceoverTimings[i] && voiceoverTimings[i]!.length > 0
        ? voiceoverTimings[i]![voiceoverTimings[i]!.length - 1]!.endMs
        : 0;
    const trailing = segmentEndMs + interSegmentGapMs - cursorMs;
    if (trailing > 0) await sleep(trailing);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
