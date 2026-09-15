import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Compositor, CompositorOptions } from '../recording/types.js';
import type { CursorTelemetry, PolishConfig } from '../types/recording.js';
import { analyzePolishing } from '../polish/pipeline.js';
import { scheduleFrames } from '../polish/frame-scheduler.js';
import { renderFrame, DEFAULT_CURSOR_STYLE, DEFAULT_FRAME_CONFIG } from './frame-renderer.js';
import { createNapiCanvas, loadImage, isNapiCanvasAvailable } from './napi-canvas.js';

export interface PolishCompositorOptions {
  ffmpegPath?: string;
  viewport?: { width: number; height: number };
  outputSize?: { width: number; height: number };
  durationMs: number;
  fps: number;
  telemetry: CursorTelemetry;
  polish?: PolishConfig;
  smoothingFactor?: number;
  usePolish?: boolean;
}

export function createPolishCompositor(
  options: PolishCompositorOptions,
): Compositor {
  return new PolishCompositor(options);
}

class PolishCompositor implements Compositor {
  private readonly opts: PolishCompositorOptions;
  private readonly ffmpegPath: string;

  constructor(options: PolishCompositorOptions) {
    this.opts = options;
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
  }

  async compose(opts: CompositorOptions): Promise<void> {
    if (!existsSync(opts.rawVideo)) {
      throw new Error(`Raw video not found: ${opts.rawVideo}`);
    }
    mkdirSync(dirname(opts.output), { recursive: true });

    if (!isNapiCanvasAvailable()) {
      throw new Error(
        'Polish compositor requires @napi-rs/canvas. Install it with: pnpm add @napi-rs/canvas',
      );
    }

    const shouldPolish = this.opts.usePolish !== false;
    const outputSize = this.opts.outputSize ?? { width: 1920, height: 1080 };

    const analysis = shouldPolish
      ? analyzePolishing(this.opts.telemetry, this.opts.polish ?? {})
      : { zoomRegions: [], transitions: [] };

    const schedules = Array.from(
      scheduleFrames({
        durationMs: this.opts.durationMs,
        fps: this.opts.fps,
        viewport: this.opts.telemetry.viewport,
        telemetry: this.opts.telemetry,
        zoomRegions: analysis.zoomRegions,
        transitions: analysis.transitions,
        smoothingFactor: this.opts.smoothingFactor ?? 0.3,
      }),
    );

    if (schedules.length === 0) {
      throw new Error('Polish compositor produced zero frames to render');
    }

    const decode = this.startFrameDecoder(opts.rawVideo, outputSize, this.opts.fps);
    const encode = this.startFrameEncoder(opts, outputSize, this.opts.fps);

    const canvas = createNapiCanvas(outputSize.width, outputSize.height);
    const bg = this.opts.polish?.background ?? { type: 'gradient' as const };
    const frameCfg = { ...DEFAULT_FRAME_CONFIG, ...(this.opts.polish?.frame ?? {}) };

    try {
      for (const schedule of schedules) {
        const frameBuf = await decode.nextFrame();
        if (!frameBuf) break;
        const image = await loadImage(frameBuf);
        renderFrame(canvas, {
          video: image,
          videoWidth: this.opts.telemetry.viewport.width,
          videoHeight: this.opts.telemetry.viewport.height,
          camera: schedule.camera,
          cursor: schedule.cursor,
          background: bg,
          frame: frameCfg,
          cursorStyle: DEFAULT_CURSOR_STYLE,
        });
        const raw = await (canvas as unknown as { encode: (fmt: string) => Promise<Buffer> }).encode('raw');
        await encode.writeFrame(raw);
      }
      await encode.finish();
      decode.close();
    } catch (err) {
      decode.close();
      encode.kill();
      throw err;
    }
  }

  private startFrameDecoder(
    inputPath: string,
    size: { width: number; height: number },
    fps: number,
  ): { nextFrame: () => Promise<Buffer | null>; close: () => void } {
    const proc = spawn(this.ffmpegPath, [
      '-i', inputPath,
      '-vf', `scale=${size.width}:${size.height},fps=${fps}`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const frameSize = size.width * size.height * 4;
    let buffer = Buffer.alloc(0);
    let ended = false;
    const waiters: Array<(b: Buffer | null) => void> = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= frameSize && waiters.length > 0) {
        const frame = buffer.subarray(0, frameSize);
        buffer = buffer.subarray(frameSize);
        const w = waiters.shift();
        if (w) w(Buffer.from(frame));
      }
    });

    proc.on('exit', () => {
      ended = true;
      while (waiters.length > 0) {
        const w = waiters.shift();
        if (w) w(null);
      }
    });

    return {
      nextFrame(): Promise<Buffer | null> {
        if (buffer.length >= frameSize) {
          const frame = buffer.subarray(0, frameSize);
          buffer = buffer.subarray(frameSize);
          return Promise.resolve(Buffer.from(frame));
        }
        if (ended) return Promise.resolve(null);
        return new Promise((resolve) => waiters.push(resolve));
      },
      close(): void {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      },
    };
  }

  private startFrameEncoder(
    opts: CompositorOptions,
    size: { width: number; height: number },
    fps: number,
  ): { writeFrame: (buf: Buffer) => Promise<void>; finish: () => Promise<void>; kill: () => void } {
    const args: string[] = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${size.width}x${size.height}`,
      '-r', String(fps),
      '-i', '-',
    ];

    if (opts.voiceovers.length > 0) {
      for (const vo of opts.voiceovers) {
        args.push('-i', vo.path);
      }
    }

    if (opts.captionsPath && existsSync(opts.captionsPath)) {
      const escaped = opts.captionsPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
      args.push(
        '-vf',
        `subtitles='${escaped}':force_style='FontName=Inter,FontSize=22,PrimaryColour=&HFFFFFF,BackColour=&HB3000000,BorderStyle=4'`,
      );
    }

    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');

    if (opts.voiceovers.length > 0) {
      args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest');
    } else {
      args.push('-an');
    }

    args.push(opts.output);

    const proc = spawn(this.ffmpegPath, args, { stdio: ['pipe', 'ignore', 'inherit'] });

    return {
      writeFrame(buf: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
          const ok = proc.stdin.write(buf, (err) => {
            if (err) reject(err);
            else resolve();
          });
          if (!ok) proc.stdin.once('drain', () => undefined);
        });
      },
      finish(): Promise<void> {
        return new Promise((resolve, reject) => {
          proc.stdin.end();
          proc.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg encoder exited with code ${code}`));
          });
        });
      },
      kill(): void {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      },
    };
  }
}
