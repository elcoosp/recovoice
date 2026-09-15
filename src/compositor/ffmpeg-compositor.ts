import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import type { Compositor, CompositorOptions } from '../recording/types.js';

export interface FfmpegCompositorOptions {
  ffmpegPath?: string;
  dryRun?: boolean;
}

export function createFfmpegCompositor(
  options: FfmpegCompositorOptions = {},
): Compositor {
  return new FfmpegCompositor(options);
}

class FfmpegCompositor implements Compositor {
  private readonly ffmpegPath: string;
  private readonly dryRun: boolean;

  constructor(options: FfmpegCompositorOptions) {
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    this.dryRun = options.dryRun ?? false;
  }

  async compose(opts: CompositorOptions): Promise<void> {
    if (!existsSync(opts.rawVideo)) {
      throw new Error(`Raw video not found: ${opts.rawVideo}`);
    }

    mkdirSync(dirname(opts.output), { recursive: true });

    if (this.dryRun) {
      writeFileSync(opts.output, Buffer.alloc(0));
      return;
    }

    const args = this.buildArgs(opts);
    await this.runFfmpeg(args);
  }

  private buildArgs(opts: CompositorOptions): string[] {
    const args: string[] = ['-y', '-i', opts.rawVideo];

    // Audio mixing: overlay voiceovers sequentially starting at their offsets
    if (opts.voiceovers.length > 0) {
      for (const vo of opts.voiceovers) {
        args.push('-i', vo.path);
      }
    }

    const videoFilters: string[] = [];
    if (opts.captionsPath && existsSync(opts.captionsPath)) {
      const escaped = opts.captionsPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
      videoFilters.push(
        `subtitles='${escaped}':force_style='FontName=Inter,FontSize=22,PrimaryColour=&HFFFFFF,BackColour=&HB3000000,BorderStyle=4'`,
      );
    }

    if (videoFilters.length > 0) {
      args.push('-vf', videoFilters.join(','));
    }

    if (opts.voiceovers.length > 0) {
      args.push('-map', '0:v');
      args.push('-map', '1:a');
      args.push('-c:v', 'libx264');
      args.push('-c:a', 'aac');
      args.push('-shortest');
    } else {
      args.push('-c:v', 'libx264');
      args.push('-an');
    }

    args.push(opts.output);
    return args;
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const proc = spawn(this.ffmpegPath, args, { stdio: 'inherit' });
      proc.on('error', (err) => {
        reject(
          new Error(
            `Failed to launch ffmpeg (${this.ffmpegPath}): ${err.message}`,
          ),
        );
      });
      proc.on('exit', (code) => {
        if (code === 0) resolvePromise();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }
}
