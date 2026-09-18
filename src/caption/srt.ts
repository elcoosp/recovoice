import { readFileSync } from 'node:fs';

export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

const TIME_RE = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;

/**
 * Parses an SRT file into time-coded cues. Returns an empty array for files
 * that cannot be parsed instead of throwing, so caption burn-in degrades
 * gracefully.
 */
export function parseSrt(filePath: string): SrtCue[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const cues: SrtCue[] = [];
  const blocks = content.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    if (lines.length < 2) continue;

    const index = Number.parseInt(lines[0]!, 10);
    if (!Number.isInteger(index)) continue;

    const timing = lines[1]!;
    const match = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/.exec(
      timing,
    );
    if (!match) continue;

    const startMs = parseTimestamp(match[1]!);
    const endMs = parseTimestamp(match[2]!);
    const text = lines.slice(2).join('\n');

    cues.push({ index, startMs, endMs, text });
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

function parseTimestamp(ts: string): number {
  const m = TIME_RE.exec(ts);
  if (!m) return 0;
  const h = Number.parseInt(m[1]!, 10);
  const min = Number.parseInt(m[2]!, 10);
  const s = Number.parseInt(m[3]!, 10);
  const ms = Number.parseInt(m[4]!, 10);
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}