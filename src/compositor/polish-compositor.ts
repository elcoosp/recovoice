import { spawn, execFileSync } from 'node:child_process';
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

    if (process.env.RECOVOICE_DEBUG) {
      try {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(
          '/tmp/recovoice-analysis.json',
          JSON.stringify({ zoomRegions: analysis.zoomRegions, transitions: analysis.transitions }, null, 2),
        );
      } catch {
        /* best-effort analysis dump */
      }
    }

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

    if (process.env.RECOVOICE_DEBUG) {
      console.error(
        `[polish] durationMs=${this.opts.durationMs} fps=${this.opts.fps} schedules=${schedules.length} frameTimes=${opts.frameTimesMs ? opts.frameTimesMs.length : 'none'}`,
      );
    }

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

    // When per-frame display times are supplied (narration-normalized
    // recording), each output frame reuses a source frame rather than being
    // a one-to-one copy: advance the source only while its own video time has
    // passed. This stretches/compresses the capture onto the schedule.
    const frameTimes = opts.frameTimesMs && opts.frameTimesMs.length >= 2
      ? opts.frameTimesMs
      : null;
    let sourceBuf: Buffer | null = null;
    let sourceIndex = 0;

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
let written = 0;
      for (const schedule of schedules) {
        let frameBuf: Buffer | null;
        if (frameTimes) {
          while (
            sourceIndex < frameTimes.length &&
            frameTimes[sourceIndex]! <= schedule.tMs
          ) {
            const nextBuf = await decoder.nextFrame();
            if (nextBuf) {
              sourceBuf = nextBuf;
              sourceIndex++;
            } else {
              sourceIndex = frameTimes.length;
            }
          }
          frameBuf = sourceBuf;
        } else {
          frameBuf = await decoder.nextFrame();
        }
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
        if (
          process.env.RECOVOICE_DEBUG &&
          schedule.tMs >= 55000 &&
          schedule.tMs <= 70000 &&
          schedule.tMs % 250 < 16
        ) {
          console.error(
            `[polish:wf] t=${schedule.tMs.toFixed(0)} camera=${JSON.stringify(schedule.camera)} cursor=${JSON.stringify({ x: schedule.cursor.x, y: schedule.cursor.y, visible: schedule.cursor.visible, clickX: schedule.cursor.clickX, clickY: schedule.cursor.clickY, ripple: schedule.cursor.clickRipple })}`,
          );
        }
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
        written++;
      }
      if (process.env.RECOVOICE_DEBUG) {
        console.error(`[polish] wrote ${written} frames`);
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

    // Bound decoder buffering so a slow consumer (e.g. the encoder pipe) can
    // never flood Node's memory and stall the event loop. This mirrors the
    // backpressure between streaming and rendering that keeps long runs alive.
    const maxBuffered = frameSize * 8;
    const resume = (): void => {
      if (
        !ended &&
        proc.stdout.readable &&
        proc.stdout.isPaused() &&
        buffer.length < maxBuffered
      ) {
        proc.stdout.resume();
      }
    };

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length >= maxBuffered) proc.stdout.pause();
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
          resume();
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

  /**
   * Stream RGBA frames directly into an ffmpeg encoder's stdin. No frames are
   * staged on disk, so memory use stays at one frame and there is no unbounded
   * `.raw` temp file to fill the disk.
   */
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

    const codec = this.pickVideoCodec(this.opts.polish);
    args.push('-c:v', codec, '-pix_fmt', 'yuv420p');

    if (hasAudio) {
      args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest');
    } else {
      args.push('-an');
    }

    args.push(opts.output);

    const proc = spawn(this.ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'inherit'],
    });

    let exitCode: number | null = null;
    const exitWaiters: Array<() => void> = [];
    let launchError: Error | undefined;
    proc.on('error', (err) => {
      launchError = err;
    });
    proc.on('exit', (code) => {
      exitCode = code;
      while (exitWaiters.length > 0) exitWaiters.shift()!();
    });

    const settle = (
      resolve: () => void,
      reject: (err: Error) => void,
      label: string,
    ): void => {
      if (launchError) {
        reject(
          new Error(
            `Failed to launch ffmpeg encoder (${this.ffmpegPath}): ${launchError.message}`,
          ),
        );
      } else if (exitCode === 0) {
        resolve();
      } else if (exitCode !== null) {
        reject(
          new Error(`ffmpeg encoder exited with code ${exitCode} (${label})`),
        );
      } else {
        reject(new Error(`ffmpeg encoder ${label}: encoder state unknown`));
      }
    };

    const stdinReady = (): boolean =>
      !launchError && exitCode === null && !proc.stdin.destroyed;

    // Streaming frames one at a time and awaiting `drain` after every write
    // throttles ffmpeg's rawvideo pipe demuxer and stalls long runs. Instead,
    // keep the pipe continuously fed and only back off once Node has buffered
    // a full high-water mark; resume the moment it drains back down.
    const maxBuffered = 128 * 1024 * 1024;
    return {
      writeFrame(buf: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
          if (!stdinReady()) {
            settle(resolve, reject, 'writeFrame');
            return;
          }
          let ok: boolean;
          try {
            ok = proc.stdin.write(buf);
          } catch (err) {
            reject(err as Error);
            return;
          }
          if (!ok || proc.stdin.writableLength > maxBuffered) {
            const onDrain = (): void => {
              if (!stdinReady()) {
                proc.stdin.removeListener('drain', onDrain);
                settle(resolve, reject, 'writeFrame-drain');
                return;
              }
              if (proc.stdin.writableLength <= maxBuffered / 2) {
                proc.stdin.removeListener('drain', onDrain);
                resolve();
              }
            };
            proc.stdin.on('drain', onDrain);
          } else {
            resolve();
          }
        });
      },
      finish(): Promise<void> {
        return new Promise((resolve, reject) => {
          if (!stdinReady()) {
            settle(resolve, reject, 'finish');
            return;
          }
          proc.stdin.end(() => {
            if (stdinReady()) {
              exitWaiters.push(() => settle(resolve, reject, 'finish-exit'));
            } else {
              settle(resolve, reject, 'finish-end');
            }
          });
        });
      },
      kill(): void {
        try {
          proc.stdin.destroy();
        } catch {
          /* ignore */
        }
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      },
    };
  }
}


