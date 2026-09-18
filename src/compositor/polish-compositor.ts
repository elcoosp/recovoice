import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { openSync, writeSync, closeSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
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
import { parseSrt, type SrtCue } from '../caption/srt.js';
import {
  runAnalyzeHooks,
  runTransformHooks,
  type PolishPlugin,
} from '../polish/plugin.js';
import type { CanvasLike } from './canvas-types.js';
import { resolveFFmpegPath } from '../config/env.js';

export interface PolishCompositorOptions {
  ffmpegPath?: string;
  outputSize?: { width: number; height: number };
  durationMs: number;
  fps: number;
  telemetry: CursorTelemetry;
  polish?: PolishConfig;
  smoothingFactor?: number;
  usePolish?: boolean;
  /**
   * Burn captions onto the video via the canvas renderer. Defaults to true.
   */
  burn?: boolean;
  /** Optional polish plugins applied before rendering each frame. */
  plugins?: PolishPlugin[];
}

export interface PolishCompositorOptions {
  ffmpegPath?: string;
  outputSize?: { width: number; height: number };
  durationMs: number;
  fps: number;
  telemetry: CursorTelemetry;
  polish?: PolishConfig;
  smoothingFactor?: number;
  usePolish?: boolean;
  /** Optional polish plugins applied before rendering each frame. */
  plugins?: PolishPlugin[];
}

export function createPolishCompositor(
  options: PolishCompositorOptions,
): Compositor {
  return new PolishCompositor(options);
}

function captionForTime(cues: SrtCue[], tMs: number): SrtCue | null {
  for (const cue of cues) {
    if (tMs < cue.startMs) break;
    if (tMs <= cue.endMs) return cue;
  }
  return null;
}

class PolishCompositor implements Compositor {
  private readonly opts: PolishCompositorOptions;
  private readonly ffmpegPath: string;

  constructor(options: PolishCompositorOptions) {
    this.opts = options;
    this.ffmpegPath = options.ffmpegPath ?? resolveFFmpegPath();
  }

  private cachedEncoders: string[] | null = null;

  private hasFFmpegEncoder(name: string): boolean {
    if (this.cachedEncoders === null) {
      let encoders: string[];
      try {
        const out = execFileSync(
          this.ffmpegPath,
          ['-hide_banner', '-encoders'],
          { encoding: 'utf8' },
        );
        encoders = out.split('\n');
      } catch {
        encoders = [];
      }
      this.cachedEncoders = encoders;
    }
    return this.cachedEncoders.some((line) => {
      const idx = line.indexOf(name);
      return idx !== -1 && /^\s{2}/.test(line.slice(0, idx));
    });
  }

  private pickVideoCodec(polish: PolishConfig | undefined): string {
    const want = polish?.encoder ?? 'auto';
    if (want === 'libx264') return 'libx264';
    if (want === 'videotoolbox') return 'h264_videotoolbox';
    return this.hasFFmpegEncoder('h264_videotoolbox')
      ? 'h264_videotoolbox'
      : 'libx264';
  }

  private deriveOutputSize(viewport: {
    width: number;
    height: number;
  }): { width: number; height: number } {
    const out = this.opts.polish?.output;
    if (out && typeof out === 'object') {
      return {
        width: Math.max(2, Math.round(out.width)),
        height: Math.max(2, Math.round(out.height)),
      };
    }
    const scale = typeof out === 'number' && out > 0 ? out : 1;
    return {
      width: Math.max(2, Math.round(viewport.width * scale)),
      height: Math.max(2, Math.round(viewport.height * scale)),
    };
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
    const viewport = this.opts.telemetry.viewport;
    const outputSize = this.opts.outputSize ?? this.deriveOutputSize(viewport);

    const baseAnalysis = shouldPolish
      ? analyzePolishing(this.opts.telemetry, this.opts.polish ?? {})
      : { zoomRegions: [], transitions: [] };

    const plugins = this.opts.plugins ?? [];
    const analysis =
      plugins.length > 0
        ? runAnalyzeHooks(plugins, {
            telemetry: this.opts.telemetry,
            zoomRegions: baseAnalysis.zoomRegions,
            transitions: baseAnalysis.transitions,
          })
        : baseAnalysis;

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
    if (polish.cursorSmoothing === false)
      scheduleInput.disableSmoothing = true;

    const schedules = Array.from(scheduleFrames(scheduleInput));

    if (schedules.length === 0) {
      throw new Error('Polish compositor produced zero frames to render');
    }

    const burn = this.opts.burn !== false;
    let cues: SrtCue[] = [];
    if (burn && opts.captionsPath && existsSync(opts.captionsPath)) {
      cues = parseSrt(opts.captionsPath);
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

    let wallpaper: unknown | undefined;
    if (
      (bg.type === 'wallpaper' || bg.type === 'blur') &&
      bg.value &&
      existsSync(bg.value)
    ) {
      const { loadImage } = await import('./napi-canvas.js');
      const { readFileSync } = await import('node:fs');
      wallpaper = await loadImage(readFileSync(bg.value));
    }

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

        if (plugins.length > 0) {
          runTransformHooks(plugins, {
            tMs: schedule.tMs,
            camera: schedule.camera,
            cursor: schedule.cursor,
          });
        }

        const zoomBlurEnabled = polish.zoomMotionBlur !== false;
        const zoomBlurRadius = zoomBlurEnabled
          ? computeZoomBlurRadius(schedule.cameraVelocity)
          : 0;
        const renderInput: Parameters<typeof renderFrame>[1] = {
          video: scratchCanvas,
          videoWidth: viewport.width,
          videoHeight: viewport.height,
          camera: schedule.camera,
          cursor: schedule.cursor,
          background: bg,
          frame: frameCfg,
          cursorStyle: DEFAULT_CURSOR_STYLE,
          zoomBlurRadius,
        };
        if (cues.length > 0) {
          const cue = captionForTime(cues, schedule.tMs);
          renderInput.caption = cue
            ? { text: cue.text, style: this.opts.polish?.captionStyle }
            : null;
        } else {
          renderInput.caption = null;
        }
        if (wallpaper) renderInput.wallpaper = wallpaper;
        renderFrame(canvas, renderInput);
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
    const tmpVideo = join(
      tmpdir(),
      `recovoice-polish-${process.pid}-${Date.now()}.raw`,
    );
    const fd = openSync(tmpVideo, 'w');
    const self = this;
    return {
      writeFrame(buf: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
          try {
            writeSync(fd, buf);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      },
      finish(): Promise<void> {
        return new Promise((resolve, reject) => {
          try {
            closeSync(fd);
          } catch {
            /* ignore */
          }
          self
            .encodeRawFile(opts, size, fps, tmpVideo)
            .then(() => {
              try {
                rmSync(tmpVideo, { force: true });
              } catch {
                /* ignore */
              }
              resolve();
            })
            .catch((err) => {
              try {
                rmSync(tmpVideo, { force: true });
              } catch {
                /* ignore */
              }
              reject(err);
            });
        });
      },
      kill(): void {
        try {
          closeSync(fd);
        } catch {
          /* ignore */
        }
        try {
          rmSync(tmpVideo, { force: true });
        } catch {
          /* ignore */
        }
      },
    };
  }

  private encodeRawFile(
    opts: CompositorOptions,
    size: { width: number; height: number },
    fps: number,
    rawPath: string,
  ): Promise<void> {
    const args: string[] = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${size.width}x${size.height}`,
      '-r', String(fps),
      '-i', rawPath,
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

    const codec = this.pickVideoCodec(this.opts.polish);
    args.push('-c:v', codec, '-pix_fmt', 'yuv420p');

    if (hasAudio) {
      args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest');
    } else {
      args.push('-an');
    }

    args.push(opts.output);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      proc.on('error', (err) => reject(err));
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg encoder exited with code ${code}`));
      });
    });
  }
}


