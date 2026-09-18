/**
 * Environment-resolved paths for external tools. Every ffmpeg/ffprobe call
 * site should go through these helpers so users can point recovoice at a
 * specific build (e.g. one with extra libraries) via environment variables
 * without touching the system PATH.
 */

export function resolveFFmpegPath(): string {
  return process.env.RECOVOICE_FFMPEG ?? 'ffmpeg';
}

export function resolveFFProbePath(): string {
  return process.env.RECOVOICE_FFPROBE ?? resolveFFmpegPath().replace(/ffmpeg$/, 'ffprobe');
}