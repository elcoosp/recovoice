import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';

export interface VoiceoverInput {
  path: string;
  startMs: number;
}

export interface MixOptions {
  ffmpegPath?: string;
  totalDurationMs?: number;
}

/**
 * Mixes N voiceover files into a single audio track, delaying each one to
 * its start offset. Output is an M4A file (AAC).
 */
export async function mixVoiceovers(
  inputs: VoiceoverInput[],
  outputPath: string,
  options: MixOptions = {},
): Promise<void> {
  const ffmpeg = options.ffmpegPath ?? 'ffmpeg';
  mkdirSync(dirname(outputPath), { recursive: true });

  const validated = inputs.filter((vo) => {
    if (!existsSync(vo.path)) {
      throw new Error(`Voiceover file not found: ${vo.path}`);
    }
    const size = readFileSync(vo.path).length;
    if (size < 100) {
      // Too small to be valid audio; skip rather than fail.
      return false;
    }
    return true;
  });

  const args = buildArgs(validated, outputPath, options);
  await runFfmpeg(ffmpeg, args);
}

function buildArgs(
  inputs: VoiceoverInput[],
  outputPath: string,
  options: MixOptions,
): string[] {
  const args: string[] = ['-y'];

  if (inputs.length === 0) {
    const durationSec = Math.max(1, (options.totalDurationMs ?? 1000) / 1000);
    args.push(
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=stereo:d=${durationSec}`,
      '-c:a', 'aac', '-b:a', '128k',
      outputPath,
    );
    return args;
  }

  for (const vo of inputs) {
    args.push('-i', vo.path);
  }

  const filterParts: string[] = [];
  const mixInputs: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const delayMs = Math.max(0, Math.round(inputs[i]!.startMs));
    filterParts.push(
      `[${i}:a]adelay=${delayMs}|${delayMs},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[v${i}]`,
    );
    mixInputs.push(`[v${i}]`);
  }

  let amix = `${mixInputs.join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0`;
  if (options.totalDurationMs && options.totalDurationMs > 0) {
    const totalSec = options.totalDurationMs / 1000;
    amix += `,apad=whole_dur=${totalSec}`;
  }

  const filterComplex = `${filterParts.join(';')};${amix}[aout]`;

  args.push(
    '-filter_complex', filterComplex,
    '-map', '[aout]',
    '-c:a', 'aac', '-b:a', '192k',
  );

  if (options.totalDurationMs && options.totalDurationMs > 0) {
    args.push('-t', (options.totalDurationMs / 1000).toFixed(3));
  }

  args.push(outputPath);
  return args;
}

export function _extname(filePath: string): string {
  return extname(filePath);
}

function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) =>
      reject(new Error(`Failed to launch ${ffmpeg}: ${err.message}`)),
    );
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg audio mixer exited with code ${code}: ${stderr.slice(-500)}`,
          ),
        );
    });
  });
}
