import type { WordTiming } from '../types/recording.js';

export interface CaptionCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface GenerateCuesOptions {
  maxCueDurationMs?: number;
  maxCharsPerCue?: number;
}

const DEFAULT_MAX_CUE_DURATION_MS = 7000;
const DEFAULT_MAX_CHARS_PER_CUE = 84;

export function generateCues(
  timings: WordTiming[],
  options: GenerateCuesOptions = {},
): CaptionCue[] {
  const maxDuration = options.maxCueDurationMs ?? DEFAULT_MAX_CUE_DURATION_MS;
  const maxChars = options.maxCharsPerCue ?? DEFAULT_MAX_CHARS_PER_CUE;

  if (timings.length === 0) return [];

  const cues: CaptionCue[] = [];
  let currentWords: WordTiming[] = [];
  let currentChars = 0;

  const flush = (): void => {
    if (currentWords.length === 0) return;
    const first = currentWords[0]!;
    const last = currentWords[currentWords.length - 1]!;
    cues.push({
      index: cues.length + 1,
      startMs: first.startMs,
      endMs: last.endMs,
      text: currentWords.map((w) => w.word).join(' '),
    });
    currentWords = [];
    currentChars = 0;
  };

  for (const word of timings) {
    const isSentenceEnd = /[.!?]$/.test(word.word);
    const projectedChars =
      currentChars + (currentWords.length > 0 ? 1 : 0) + word.word.length;
    const projectedDuration =
      currentWords.length > 0
        ? word.endMs - currentWords[0]!.startMs
        : word.endMs - word.startMs;

    if (
      currentWords.length > 0 &&
      (projectedDuration > maxDuration || projectedChars > maxChars)
    ) {
      flush();
    }

    currentWords.push(word);
    currentChars = currentWords.reduce(
      (acc, w, i) => acc + w.word.length + (i > 0 ? 1 : 0),
      0,
    );

    if (isSentenceEnd) flush();
  }

  flush();
  return cues;
}

export function cuesToSrt(cues: CaptionCue[]): string {
  const blocks = cues.map((cue) => {
    return [
      String(cue.index),
      `${formatTimestampSrt(cue.startMs)} --> ${formatTimestampSrt(cue.endMs)}`,
      cue.text,
      '',
    ].join('\n');
  });
  return blocks.join('\n').replace(/\n+$/, '\n');
}

export function cuesToVtt(cues: CaptionCue[]): string {
  const header = 'WEBVTT\n\n';
  const blocks = cues.map((cue) => {
    return [
      String(cue.index),
      `${formatTimestampVtt(cue.startMs)} --> ${formatTimestampVtt(cue.endMs)}`,
      cue.text,
      '',
    ].join('\n');
  });
  return header + blocks.join('\n');
}

function formatTimestampSrt(ms: number): string {
  const { h, m, s, ms: millis } = splitMs(ms);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(millis, 3)}`;
}

function formatTimestampVtt(ms: number): string {
  const { h, m, s, ms: millis } = splitMs(ms);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(millis, 3)}`;
}

function splitMs(ms: number): { h: number; m: number; s: number; ms: number } {
  const totalMs = Math.max(0, Math.round(ms));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return { h, m, s, ms: millis };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export interface SegmentCaptionInput {
  timings: WordTiming[];
  startOffsetMs: number;
  overrideText?: string;
}

/**
 * Generate caption cues across multiple segments, honoring per-segment
 * caption overrides. When an override is present, one cue is emitted for
 * the whole segment (using the override text) rather than word-derived cues.
 */
export function generateCuesFromSegments(
  segments: SegmentCaptionInput[],
  options: GenerateCuesOptions = {},
): CaptionCue[] {
  const all: CaptionCue[] = [];
  let nextIndex = 1;

  for (const seg of segments) {
    if (seg.timings.length === 0 && !seg.overrideText) continue;

    const startOffset = seg.startOffsetMs;
    const segEndMs =
      seg.timings.length > 0
        ? seg.timings[seg.timings.length - 1]!.endMs
        : startOffset;
    const segStartMs =
      seg.timings.length > 0 ? seg.timings[0]!.startMs : startOffset;

    if (seg.overrideText) {
      all.push({
        index: nextIndex++,
        startMs: startOffset + segStartMs,
        endMs: startOffset + segEndMs,
        text: seg.overrideText,
      });
      continue;
    }

    const cues = generateCues(seg.timings, options);
    for (const cue of cues) {
      all.push({
        index: nextIndex++,
        startMs: cue.startMs + startOffset,
        endMs: cue.endMs + startOffset,
        text: cue.text,
      });
    }
  }

  return all;
}
