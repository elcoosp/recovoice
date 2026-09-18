import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Compositor, CompositorOptions } from '../recording/types.js';
import { resolveFFmpegPath } from '../config/env.js';

export interface PassthroughCompositorOptions {
  ffmpegPath?: string;
}

function runFFmpeg(
  ffmpegPath: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

export function createPassthroughCompositor(
  options: PassthroughCompositorOptions = {},
): Compositor {
  const ffmpegPath = options.ffmpegPath ?? resolveFFmpegPath();

  return {
    async compose(opts: CompositorOptions): Promise<void> {
      if (!existsSync(opts.rawVideo)) {
        throw new Error(`Raw video not found: ${opts.rawVideo}`);
      }
      mkdirSync(dirname(opts.output), { recursive: true });

      const args = ['-y'];

      args.push('-i', opts.rawVideo);

      const audio = opts.audioTrackPath && existsSync(opts.audioTrackPath)
        ? opts.audioTrackPath
        : opts.voiceovers[0]?.path;
      if (audio && existsSync(audio)) {
        args.push('-i', audio);
      }

      args.push('-map', '0:v:0');
      if (audio && existsSync(audio)) {
        args.push('-map', '1:a:0', '-c:a', 'aac');
      } else {
        args.push('-an');
      }
      args.push('-c:v', 'copy', '-movflags', '+faststart', opts.output);

      if (opts.captionsPath && existsSync(opts.captionsPath)) {
        process.stderr.write(
          'recovoice: passthrough compositor skips caption burn-in; ' +
            'SRT/VTT sidecars are emitted alongside final.mp4\n',
        );
      }

      await runFFmpeg(ffmpegPath, args);
    },
  };
}