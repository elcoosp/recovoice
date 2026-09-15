import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Compositor, CompositorOptions } from '../recording/types.js';
import type { CursorTelemetry, PolishConfig } from '../types/recording.js';
import { analyzePolishing } from '../polish/pipeline.js';
import { scheduleFrames } from '../polish/frame-scheduler.js';
import {
  renderFrame,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_FRAME_CONFIG,
} from './frame-renderer.js';
import {
  createNapiCanvas,
  isNapiCanvasAvailable,
} from './napi-canvas.js';
import { computeZoomBlurRadius } from '../polish/motion-blur.js';
import type { CanvasLike, ImageDataLike } from './canvas-types.js';

export interface PolishCompositorOptions {
  ffmpegPath?: string;
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
    const viewport = this.opts.telemetry.viewport;

    const analysis = shouldPolish
      ? analyzePolishing(this.opts.telemetry, this.opts.polish ?? {})
      : { zoomRegions: [], transitions: [] };

    const polish = this.opts.polish ?? {};
    const scheduleInput: Parameters<typeof scheduleFrames>[0] = {
      durationMs: this.opts.durationMs,
      fps: this.opts.fps,
      viewport,
      telemetry: this.opts.telemetry,
      zoomRegions: analysis.zoomRegions,
      transitions: analysis.transitions,
      smoothingFactor:
        typeof polish.cursorSmoothing === 'number'
          ? polish.cursorSmoothing
          : this.opts.smoothingFactor ?? 0.3,
    };
    if (polish.cursorSway === false) scheduleInput.disableSway = true;
    if (polish.cursorMotionBlur === false)
      scheduleInput.disableCursorMotionBlur = true;
    if (polish.zoomMotionBlur === false)
      scheduleInput.disableZoomMotionBlur = true;

    const schedules = Array.from(scheduleFrames(scheduleInput));

    if (schedules.length === 0) {
      throw new Error('Polish compositor produced zero frames to render');
    }

    const decoder = this.startFrameDecoder(
      opts.rawVideo,
      viewport,
      this.opts.fps,
    );
    const encoder = this.startFrameEncoder(opts, outputSize, this.opts.fps);

    const canvas = createNapiCanvas(outputSize.width, outputSize.height);
    const scratchCanvas = createNapiCanvas(viewport.width, viewport.height);
    const scratchCtx = scratchCanvas.getContext('2d');
    const canvasCtx = canvas.getContext('2d');

    const bg = this.opts.polish?.background ?? { type: 'gradient' as const };
    const frameCfg = {
      ...DEFAULT_FRAME_CONFIG,
      ...(this.opts.polish?.frame ?? {}),
    };

    try {
      for (const schedule of schedules) {
        const frameBuf = await decoder.nextFrame();
        if (!frameBuf) break;

        this.blitRgbaToCanvas(
          scratchCanvas,
          scratchCtx,
          frameBuf,
          viewport.width,
          viewport.height,
        );

        const zoomBlurEnabled = polish.zoomMotionBlur !== false;
        const zoomBlurRadius = zoomBlurEnabled
          ? computeZoomBlurRadius(schedule.cameraVelocity)
          : 0;
        renderFrame(canvas, {
          video: scratchCanvas,
          videoWidth: viewport.width,
          videoHeight: viewport.height,
          camera: schedule.camera,
          cursor: schedule.cursor,
          background: bg,
          frame: frameCfg,
          cursorStyle: DEFAULT_CURSOR_STYLE,
          zoomBlurRadius,
        });

        const rgba = this.readRgbaFromCanvas(
          canvasCtx,
          outputSize.width,
          outputSize.height,
        );
        await encoder.writeFrame(rgba);
      }
      await encoder.finish();
      decoder.close();
    } catch (err) {
      decoder.close();
      encoder.kill();
      throw err;
    }
  }

  private blitRgbaToCanvas(
    _canvas: CanvasLike,
    ctx: ReturnType<CanvasLike['getContext']>,
    rgba: Buffer,
    width: number,
    height: number,
  ): void {
    if (!ctx.createImageData || !ctx.putImageData) {
      throw new Error(
        'Canvas context does not support createImageData/putImageData',
      );
    }
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(new Uint8ClampedArray(rgba));
    ctx.putImageData(imageData, 0, 0);
  }

  private readRgbaFromCanvas(
    ctx: ReturnType<CanvasLike['getContext']>,
    width: number,
    height: number,
  ): Buffer {
    if (!ctx.getImageData) {
      throw new Error('Canvas context does not support getImageData');
    }
    const imageData = ctx.getImageData(0, 0, width, height);
    return Buffer.from(imageData.data);
  }

  private startFrameDecoder(
    inputPath: string,
    viewport: { width: number; height: number },
    fps: number,
  ): { nextFrame: () => Promise<Buffer | null>; close: () => void } {
    const proc = spawn(
      this.ffmpegPath,
      [
        '-i', inputPath,
        '-vf', `scale=${viewport.width}:${viewport.height},fps=${fps}`,
        '-f', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    const frameSize = viewport.width * viewport.height * 4;
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
  ): {
    writeFrame: (buf: Buffer) => Promise<void>;
    finish: () => Promise<void>;
    kill: () => void;
  } {
    const args: string[] = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${size.width}x${size.height}`,
      '-r', String(fps),
      '-i', '-',
    ];

    const hasAudio = opts.audioTrackPath
      ? true
      : opts.voiceovers.length > 0;
    if (opts.audioTrackPath) {
      args.push('-i', opts.audioTrackPath);
    } else if (opts.voiceovers.length > 0) {
      for (const vo of opts.voiceovers) {
        args.push('-i', vo.path);
      }
    }

    if (opts.captionsPath && existsSync(opts.captionsPath)) {
      const escaped = opts.captionsPath
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:');
      args.push(
        '-vf',
        `subtitles='${escaped}':force_style='FontName=Inter,FontSize=22,PrimaryColour=&HFFFFFF,BackColour=&HB3000000,BorderStyle=4'`,
      );
    }

    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');

    if (hasAudio) {
      args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest');
    } else {
      args.push('-an');
    }

    args.push(opts.output);

    const proc = spawn(this.ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'inherit'],
    });

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

export type { ImageDataLike };
