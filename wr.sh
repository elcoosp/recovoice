#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Writing src/compositor/polish-compositor.ts"
cat > src/compositor/polish-compositor.ts << 'EOF'
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
EOF

echo "Writing src/tts/factory.ts"
cat > src/tts/factory.ts << 'EOF'
import type { TTSProvider } from '../types/recording.js';
import { MockTTSProvider } from './providers/mock.js';
import { KokoroTTSProvider } from './providers/kokoro.js';
import { EdgeTTSProvider } from './providers/edge.js';

export interface TTSFactoryOptions {
  provider: 'mock' | 'kokoro' | 'edge';
  kokoroUrl?: string;
  edgeBinaryPath?: string;
}

export function createTTSProvider(options: TTSFactoryOptions): TTSProvider {
  switch (options.provider) {
    case 'kokoro': {
      const opts = options.kokoroUrl ? { baseUrl: options.kokoroUrl } : {};
      return new KokoroTTSProvider(opts);
    }
    case 'edge': {
      const opts = options.edgeBinaryPath
        ? { binaryPath: options.edgeBinaryPath }
        : {};
      return new EdgeTTSProvider(opts);
    }
    case 'mock':
    default:
      return new MockTTSProvider();
  }
}
EOF

echo "Writing test/compositor/polish-compositor.test.ts"
cat > test/compositor/polish-compositor.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { createPolishCompositor } from '../../src/compositor/polish-compositor.js';

describe('createPolishCompositor', () => {
  it('returns a compositor instance', () => {
    const compositor = createPolishCompositor({
      durationMs: 1000,
      fps: 30,
      telemetry: {
        events: [],
        timebaseOrigin: 0,
        viewport: { width: 1280, height: 800 },
      },
    });
    expect(compositor).toBeDefined();
    expect(typeof compositor.compose).toBe('function');
  });

  it('rejects when the raw video is missing', async () => {
    const compositor = createPolishCompositor({
      durationMs: 1000,
      fps: 30,
      telemetry: {
        events: [],
        timebaseOrigin: 0,
        viewport: { width: 1280, height: 800 },
      },
    });
    await expect(
      compositor.compose({
        rawVideo: '/nonexistent/raw.mp4',
        voiceovers: [],
        output: '/tmp/out.mp4',
      }),
    ).rejects.toThrow(/Raw video not found/);
  });
});
EOF

echo "Writing test/tts/factory.test.ts"
cat > test/tts/factory.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { createTTSProvider } from '../../src/tts/factory.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import { KokoroTTSProvider } from '../../src/tts/providers/kokoro.js';
import { EdgeTTSProvider } from '../../src/tts/providers/edge.js';

describe('createTTSProvider', () => {
  it('creates a mock provider', () => {
    const provider = createTTSProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockTTSProvider);
  });

  it('creates a kokoro provider', () => {
    const provider = createTTSProvider({ provider: 'kokoro' });
    expect(provider).toBeInstanceOf(KokoroTTSProvider);
  });

  it('creates an edge provider', () => {
    const provider = createTTSProvider({ provider: 'edge' });
    expect(provider).toBeInstanceOf(EdgeTTSProvider);
  });

  it('passes kokoro base url', () => {
    const provider = createTTSProvider({
      provider: 'kokoro',
      kokoroUrl: 'http://custom:9999',
    });
    expect(provider).toBeInstanceOf(KokoroTTSProvider);
  });

  it('falls back to mock for unknown provider', () => {
    // @ts-expect-error deliberate invalid value
    const provider = createTTSProvider({ provider: 'unknown' });
    expect(provider).toBeInstanceOf(MockTTSProvider);
  });
});
EOF

echo "Updating CLI to use TTS factory and polish compositor"
cat > src/cli.ts << 'EOF'
#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Recovoice } from './recovoice.js';
import { createTTSProvider } from './tts/factory.js';
import { createTauriPlaywrightAdapter } from './recording/tauri-playwright-adapter.js';
import { createPolishCompositor } from './compositor/polish-compositor.js';

const pkg = { version: '0.1.0' };

const program = new Command();

program
  .name('recovoice')
  .description(
    'Produce narrated, captioned, polished demo videos from a single .demo.md file',
  )
  .version(pkg.version)
  .argument('<script>', 'Path to the .demo.md script')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--fps <number>', 'Recording frame rate', '60')
  .option('--check', 'Validate the script only; no execution')
  .option('--dry-run', 'Show planned actions without executing')
  .option('--voiceover-only', 'Only regenerate voiceover and captions')
  .option('--tts <provider>', 'TTS provider (mock|kokoro|edge)', 'kokoro')
  .option('--kokoro-url <url>', 'Kokoro server URL', 'http://localhost:8880')
  .option('--no-polish', 'Disable all polish effects')
  .action(async (scriptPath: string, opts: Record<string, unknown>) => {
    const absoluteScript = resolve(scriptPath);
    if (!existsSync(absoluteScript)) {
      process.stderr.write(`Script not found: ${absoluteScript}\n`);
      process.exit(2);
    }

    const ttsProvider = createTTSProvider({
      provider: opts.tts as 'mock' | 'kokoro' | 'edge',
      kokoroUrl: String(opts.kokoroUrl),
    });

    const recordingAdapter = createTauriPlaywrightAdapter();

    const recovoice = new Recovoice({
      script: absoluteScript,
      output: String(opts.output),
      recordingAdapter,
      ttsProvider,
      compositorFactory: (result) =>
        createPolishCompositor({
          durationMs: estimateDurationMs(result.telemetry),
          fps: Number(opts.fps),
          telemetry: result.telemetry,
          viewport: result.telemetry.viewport,
          smoothingFactor: 0.3,
          usePolish: opts.polish !== false,
        }),
    });

    if (opts.check) {
      const result = await recovoice.check();
      if (result.valid) {
        process.stdout.write(`Script is valid: ${absoluteScript}\n`);
        process.exit(0);
      }
      for (const err of result.errors) {
        const suffix = err.line !== undefined ? ` (line ${err.line})` : '';
        process.stderr.write(`error: ${err.message}${suffix}\n`);
      }
      process.exit(1);
    }

    if (opts.dryRun) {
      const result = await recovoice.check();
      if (!result.valid) {
        for (const err of result.errors) {
          process.stderr.write(`error: ${err.message}\n`);
        }
        process.exit(1);
      }
      process.stdout.write(`Would record and compose: ${absoluteScript}\n`);
      process.exit(0);
    }

    try {
      const result = await recovoice.run();
      process.stdout.write(`Final video: ${result.finalVideo}\n`);
      if (result.captions.srt) {
        process.stdout.write(`Captions (SRT): ${result.captions.srt}\n`);
      }
      if (result.captions.vtt) {
        process.stdout.write(`Captions (VTT): ${result.captions.vtt}\n`);
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

function estimateDurationMs(telemetry: { events: Array<{ t: number }> }): number {
  if (telemetry.events.length === 0) return 5000;
  const last = telemetry.events[telemetry.events.length - 1]!;
  return Math.ceil(last.t + 1000);
}

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
});
EOF

echo "Updating Recovoice to accept a compositorFactory"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export interface RecovoiceOptions {
  script: string;
  output?: string;
  recordingAdapter: RecordingAdapter;
  ttsProvider: TTSProvider;
  compositor: Compositor;
}
EOF
cat > "$NEW_TMP" << 'EOF'
export interface RecovoiceCompositorResult {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  captionsPath?: string;
  telemetry: CursorTelemetry;
}

export interface RecovoiceOptions {
  script: string;
  output?: string;
  recordingAdapter: RecordingAdapter;
  ttsProvider: TTSProvider;
  compositor?: Compositor;
  compositorFactory?: (result: RecovoiceCompositorResult) => Compositor;
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: RecovoiceOptions block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 1 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 1 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Updating Recovoice.run to resolve the compositor"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
      const voiceoverInputs = voiceovers.map((v) => ({
        path: v.path,
        startMs: v.startMs,
      }));

      await this.opts.compositor.compose({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        polish: undefined,
        output: finalVideoPath,
      });
EOF
cat > "$NEW_TMP" << 'EOF'
      const voiceoverInputs = voiceovers.map((v) => ({
        path: v.path,
        startMs: v.startMs,
      }));

      const compositor = this.resolveCompositor({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        telemetry,
      });

      await compositor.compose({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        output: finalVideoPath,
      });
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: compositor compose block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 2 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 2 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Adding resolveCompositor method to Recovoice"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  private async synthesizeVoiceovers(
EOF
cat > "$NEW_TMP" << 'EOF'
  private resolveCompositor(result: RecovoiceCompositorResult): Compositor {
    if (this.opts.compositor) return this.opts.compositor;
    if (this.opts.compositorFactory) return this.opts.compositorFactory(result);
    throw new Error(
      'Recovoice requires either a `compositor` or `compositorFactory` option',
    );
  }

  private async synthesizeVoiceovers(
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: synthesizeVoiceovers block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 3 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 3 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Updating Recovoice exports"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export type {
  RecovoiceOptions,
  RecovoiceResult,
  CheckResult,
} from './recovoice.js';
EOF
cat > "$NEW_TMP" << 'EOF'
export type {
  RecovoiceOptions,
  RecovoiceResult,
  CheckResult,
  RecovoiceCompositorResult,
} from './recovoice.js';
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/index.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: Recovoice options export block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 4 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 4 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Adding polish-compositor and factory exports to index"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export { createFfmpegCompositor } from './compositor/ffmpeg-compositor.js';
export type { FfmpegCompositorOptions } from './compositor/ffmpeg-compositor.js';
EOF
cat > "$NEW_TMP" << 'EOF'
export { createFfmpegCompositor } from './compositor/ffmpeg-compositor.js';
export type { FfmpegCompositorOptions } from './compositor/ffmpeg-compositor.js';
export { createPolishCompositor } from './compositor/polish-compositor.js';
export type { PolishCompositorOptions } from './compositor/polish-compositor.js';
export { createTTSProvider } from './tts/factory.js';
export type { TTSFactoryOptions } from './tts/factory.js';
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/index.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: ffmpeg-compositor export block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 5 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 5 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running tests"
if pnpm exec vitest run 2>&1; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "feat(compositor,tts,cli): polish compositor pipes ffmpeg frames through napi-canvas; TTS factory; CLI uses new providers"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
