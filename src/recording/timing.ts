import type { Segment } from '../types/script.js';
import type { WordTiming } from '../types/recording.js';

export interface ScheduledAction {
  actionIndex: number;
  segmentIndex: number;
  /** Milliseconds from the start of the segment's voiceover. */
  offsetMs: number;
}

export interface SegmentTimings {
  segmentIndex: number;
  wordTimings: WordTiming[];
  scheduledActions: ScheduledAction[];
}

/**
 * For each segment, compute the time offset at which each action should fire
 * based on its anchor (word position in the prose).
 *
 * Anchor `a` means: fire after word index `a - 1` finishes. Anchor 0 means
 * fire immediately (before any word). If the anchor is beyond the last word,
 * fire at the end of the segment.
 */
export function scheduleActions(
  segments: Segment[],
  voiceoverTimings: WordTiming[][],
): SegmentTimings[] {
  const result: SegmentTimings[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const timings = voiceoverTimings[i] ?? [];
    const scheduled: ScheduledAction[] = [];

    for (let a = 0; a < segment.actions.length; a++) {
      const anchor = segment.actionAnchors[a] ?? 0;
      const offsetMs = anchorToOffsetMs(anchor, timings);
      scheduled.push({
        actionIndex: a,
        segmentIndex: i,
        offsetMs,
      });
    }

    result.push({
      segmentIndex: i,
      wordTimings: timings,
      scheduledActions: scheduled,
    });
  }

  return result;
}

function anchorToOffsetMs(anchor: number, timings: WordTiming[]): number {
  if (timings.length === 0) return 0;
  if (anchor <= 0) return 0;
  // Anchor N means fire after word index N-1 finishes.
  const wordIndex = anchor - 1;
  if (wordIndex >= timings.length) {
    return timings[timings.length - 1]!.endMs;
  }
  return timings[wordIndex]!.endMs;
}

export interface SegmentAudioTiming {
  /** Absolute start of the segment within the composed video, in ms. */
  startMs: number;
  /** Duration of the segment in ms (voiceover length + gap). */
  durationMs: number;
}

/**
 * Given the segment audio timings (the same values used when composing the
 * audio track), produce absolute action times in the video timeline.
 */
export function absoluteActionTimes(
  segmentTimings: SegmentTimings[],
  audioTimings: SegmentAudioTiming[],
): Array<{ segmentIndex: number; actionIndex: number; absoluteMs: number }> {
  const out: Array<{
    segmentIndex: number;
    actionIndex: number;
    absoluteMs: number;
  }> = [];

  for (const st of segmentTimings) {
    const audio = audioTimings[st.segmentIndex];
    if (!audio) continue;
    for (const sa of st.scheduledActions) {
      out.push({
        segmentIndex: sa.segmentIndex,
        actionIndex: sa.actionIndex,
        absoluteMs: audio.startMs + sa.offsetMs,
      });
    }
  }

  return out;
}
