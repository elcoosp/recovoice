#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Writing src/util/ffprobe.ts"
mkdir -p src/util
cat > src/util/ffprobe.ts << 'EOF'
import { spawn } from 'node:child_process';

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
}

export interface ProbeOptions {
  ffprobePath?: string;
}

export async function probeVideo(
  filePath: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const ffprobe = options.ffprobePath ?? 'ffprobe';
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration',
    '-show_entries', 'format=duration',
    '-of', 'json',
    filePath,
  ];

  const raw = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffprobe, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) =>
      reject(new Error(`Failed to launch ${ffprobe}: ${err.message}`)),
    );
    proc.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
    });
  });

  let parsed: {
    streams?: Array<{
      width?: number;
      height?: number;
      r_frame_rate?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
  };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ffprobe output: ${(err as Error).message}`);
  }

  const stream = parsed.streams?.[0];
  if (!stream) {
    throw new Error(`No video stream found in ${filePath}`);
  }

  const durationStr = stream.duration ?? parsed.format?.duration ?? '0';
  const durationSec = Number.parseFloat(durationStr);
  if (!Number.isFinite(durationSec)) {
    throw new Error(`Could not determine duration of ${filePath}`);
  }

  const fps = parseFrameRate(stream.r_frame_rate ?? '0/1');

  return {
    durationMs: Math.round(durationSec * 1000),
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps,
  };
}

function parseFrameRate(rate: string): number {
  const [numStr, denStr] = rate.split('/');
  const num = Number.parseFloat(numStr ?? '0');
  const den = Number.parseFloat(denStr ?? '1');
  if (den === 0) return 0;
  return num / den;
}
EOF

echo "Writing test/util/ffprobe.test.ts"
mkdir -p test/util
cat > test/util/ffprobe.test.ts << 'EOF'
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeVideo } from '../../src/util/ffprobe.js';

function hasFfprobe(): boolean {
  const r = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

const ffprobeAvailable = hasFfprobe();

describe('probeVideo', () => {
  it.skipIf(!ffprobeAvailable)(
    'returns duration, dimensions, and fps for a real video',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'recovoice-probe-'));
      const video = join(dir, 'test.mp4');
      const gen = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-f', 'lavfi',
          '-i', 'testsrc=size=640x360:rate=30:duration=2',
          '-pix_fmt', 'yuv420p',
          video,
        ],
        { stdio: 'ignore' },
      );
      if (gen.status !== 0) {
        rmSync(dir, { recursive: true, force: true });
        throw new Error('Failed to generate test video');
      }

      const result = await probeVideo(video);
      expect(result.width).toBe(640);
      expect(result.height).toBe(360);
      expect(result.fps).toBeCloseTo(30, 0);
      expect(result.durationMs).toBeGreaterThan(1800);
      expect(result.durationMs).toBeLessThan(2200);

      rmSync(dir, { recursive: true, force: true });
    },
    20000,
  );

  it('rejects for a nonexistent file', async () => {
    if (!ffprobeAvailable) return;
    await expect(probeVideo('/nonexistent/does-not-exist.mp4')).rejects.toThrow();
  });
});
EOF

echo "Adding --voiceover-only and duration tracking to Recovoice"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export interface RecovoiceOptions {
  script: string;
  output?: string;
  recordingAdapter: RecordingAdapter;
  ttsProvider: TTSProvider;
  compositor?: Compositor;
  compositorFactory?: (result: RecovoiceCompositorResult) => Compositor;
}
EOF
cat > "$NEW_TMP" << 'EOF'
export interface RecovoiceOptions {
  script: string;
  output?: string;
  recordingAdapter: RecordingAdapter;
  ttsProvider: TTSProvider;
  compositor?: Compositor;
  compositorFactory?: (result: RecovoiceCompositorResult) => Compositor;
  voiceoverOnly?: boolean;
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

echo "Adding RecovoiceResult.durationMs field"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export interface RecovoiceResult {
  finalVideo: string;
  rawVideo: string;
  captions: { srt?: string; vtt?: string };
  voiceovers: string[];
  telemetry: CursorTelemetry;
}
EOF
cat > "$NEW_TMP" << 'EOF'
export interface RecovoiceResult {
  finalVideo: string;
  rawVideo: string;
  captions: { srt?: string; vtt?: string };
  voiceovers: string[];
  telemetry: CursorTelemetry;
  durationMs: number;
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: RecovoiceResult block not found")
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

echo "Adding RecovoiceCompositorResult.durationMs and voiceoverOnly early-return"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export interface RecovoiceCompositorResult {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  captionsPath?: string;
  telemetry: CursorTelemetry;
}
EOF
cat > "$NEW_TMP" << 'EOF'
export interface RecovoiceCompositorResult {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  captionsPath?: string;
  telemetry: CursorTelemetry;
  durationMs: number;
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: RecovoiceCompositorResult block not found")
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

echo "Rewriting Recovoice.run to support voiceoverOnly and duration tracking"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  async run(): Promise<RecovoiceResult> {
    const script = parseScript(this.opts.script);
    const outputDir = this.opts.output ?? './output';
    const stagingDir = join(outputDir, '.tmp');
    const rawDir = join(stagingDir, 'raw');
    const assetsDir = join(stagingDir, 'assets');
    const cacheDir = join(outputDir, '.cache', 'audio');

    const finalVideoPath = join(outputDir, 'final.mp4');
    const rawVideoPath = join(rawDir, 'video.mp4');
    const srtPath = join(outputDir, 'captions.srt');
    const vttPath = join(outputDir, 'captions.vtt');

    try {
      mkdirSync(rawDir, { recursive: true });
      mkdirSync(assetsDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });

      const { voiceovers, allTimings } = await this.synthesizeVoiceovers(
        script,
        assetsDir,
        cacheDir,
      );

      const session = await this.opts.recordingAdapter.launch({
        viewport: script.frontmatter.viewport ?? DEFAULT_VIEWPORT,
      });

      const fps = script.frontmatter.fps ?? DEFAULT_FPS;
      await session.startRecording({ path: rawDir, fps });

      await this.executeAllActions(session, script);

      const { video } = await session.stopRecording();
      const telemetry = await session.collectTelemetry();
      await session.close();

      const captions = this.writeCaptions(script, allTimings, srtPath, vttPath);

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

      // Atomic publish: move staged raw + assets into final location
      this.publishStaging(stagingDir, outputDir, rawVideoPath);

      const result: RecovoiceResult = {
        finalVideo: finalVideoPath,
        rawVideo: rawVideoPath,
        captions,
        voiceovers: voiceovers.map((v) => v.path),
        telemetry,
      };
      return result;
    } catch (err) {
      // Clean up staging on failure; leave output dir without a final.mp4
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
      throw err;
    }
  }
EOF
cat > "$NEW_TMP" << 'EOF'
  async run(): Promise<RecovoiceResult> {
    const script = parseScript(this.opts.script);
    const outputDir = this.opts.output ?? './output';
    const stagingDir = join(outputDir, '.tmp');
    const rawDir = join(stagingDir, 'raw');
    const assetsDir = join(stagingDir, 'assets');
    const cacheDir = join(outputDir, '.cache', 'audio');

    const finalVideoPath = join(outputDir, 'final.mp4');
    const rawVideoPath = join(rawDir, 'video.mp4');
    const srtPath = join(outputDir, 'captions.srt');
    const vttPath = join(outputDir, 'captions.vtt');

    try {
      mkdirSync(rawDir, { recursive: true });
      mkdirSync(assetsDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });

      const { voiceovers, allTimings } = await this.synthesizeVoiceovers(
        script,
        assetsDir,
        cacheDir,
      );

      const captions = this.writeCaptions(script, allTimings, srtPath, vttPath);

      if (this.opts.voiceoverOnly) {
        // Publish assets and captions without recording or compositing.
        this.publishStaging(stagingDir, outputDir, rawVideoPath);
        return {
          finalVideo: '',
          rawVideo: '',
          captions,
          voiceovers: voiceovers.map((v) => v.path),
          telemetry: {
            events: [],
            timebaseOrigin: 0,
            viewport: script.frontmatter.viewport ?? DEFAULT_VIEWPORT,
          },
          durationMs: 0,
        };
      }

      const session = await this.opts.recordingAdapter.launch({
        viewport: script.frontmatter.viewport ?? DEFAULT_VIEWPORT,
      });

      const fps = script.frontmatter.fps ?? DEFAULT_FPS;
      await session.startRecording({ path: rawDir, fps });

      await this.executeAllActions(session, script);

      const { video } = await session.stopRecording();
      const telemetry = await session.collectTelemetry();
      await session.close();

      const voiceoverInputs = voiceovers.map((v) => ({
        path: v.path,
        startMs: v.startMs,
      }));

      const durationMs = await this.resolveDurationMs(video, telemetry);

      const compositor = this.resolveCompositor({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        telemetry,
        durationMs,
      });

      await compositor.compose({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        output: finalVideoPath,
      });

      // Atomic publish: move staged raw + assets into final location
      this.publishStaging(stagingDir, outputDir, rawVideoPath);

      const result: RecovoiceResult = {
        finalVideo: finalVideoPath,
        rawVideo: rawVideoPath,
        captions,
        voiceovers: voiceovers.map((v) => v.path),
        telemetry,
        durationMs,
      };
      return result;
    } catch (err) {
      // Clean up staging on failure; leave output dir without a final.mp4
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
      throw err;
    }
  }

  private async resolveDurationMs(
    videoPath: string,
    telemetry: CursorTelemetry,
  ): Promise<number> {
    // Try ffprobe first; fall back to last telemetry event + buffer
    try {
      const { probeVideo } = await import('./util/ffprobe.js');
      const probe = await probeVideo(videoPath);
      if (probe.durationMs > 0) return probe.durationMs;
    } catch {
      // ignore probe failure and fall back
    }
    if (telemetry.events.length > 0) {
      const last = telemetry.events[telemetry.events.length - 1]!;
      return Math.ceil(last.t + 1000);
    }
    return 5000;
  }
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: run() block not found")
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

echo "Updating CLI: pass voiceoverOnly and use real duration"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
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
          smoothingFactor: 0.3,
          usePolish: opts.polish !== false,
        }),
    });
EOF
cat > "$NEW_TMP" << 'EOF'
    const recovoice = new Recovoice({
      script: absoluteScript,
      output: String(opts.output),
      recordingAdapter,
      ttsProvider,
      voiceoverOnly: Boolean(opts.voiceoverOnly),
      compositorFactory: (result) =>
        createPolishCompositor({
          durationMs: result.durationMs,
          fps: Number(opts.fps),
          telemetry: result.telemetry,
          smoothingFactor: 0.3,
          usePolish: opts.polish !== false,
        }),
    });
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/cli.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: Recovoice constructor block not found")
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

echo "Removing obsolete estimateDurationMs from CLI"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
function estimateDurationMs(telemetry: { events: Array<{ t: number }> }): number {
  if (telemetry.events.length === 0) return 5000;
  const last = telemetry.events[telemetry.events.length - 1]!;
  return Math.ceil(last.t + 1000);
}

EOF
cat > "$NEW_TMP" << 'EOF'
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/cli.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("WARNING: estimateDurationMs block not found (may already be removed)")
else:
    content = content.replace(old, new, 1)
    with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "CLI cleanup succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: CLI cleanup failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Updating --voiceover-only flag description"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  .option('--voiceover-only', 'Only regenerate voiceover and captions')
EOF
cat > "$NEW_TMP" << 'EOF'
  .option('--voiceover-only', 'Only regenerate voiceover and captions (skip recording)')
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/cli.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: voiceover-only option not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 6 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 6 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Adding voiceoverOnly test to orchestrator"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
describe('Recovoice options', () => {
EOF
cat > "$NEW_TMP" << 'EOF'
describe('Recovoice.run with voiceoverOnly', () => {
  it('skips recording and produces only voiceover and captions', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      voiceoverOnly: true,
    });
    const result = await recovoice.run();
    expect(adapter.sessions).toHaveLength(0);
    expect(result.finalVideo).toBe('');
    expect(result.rawVideo).toBe('');
    expect(result.durationMs).toBe(0);
    expect(result.voiceovers.length).toBeGreaterThan(0);
    expect(existsSync(join(outputDir, 'captions.srt'))).toBe(true);
  });
});

describe('Recovoice options', () => {
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" test/recording/orchestrator.test.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: 'Recovoice options' describe block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 7 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 7 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Adding util exports to src/index.ts"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export { runDoctor, formatDoctorReport } from './doctor.js';
export type { Check, DoctorReport } from './doctor.js';
EOF
cat > "$NEW_TMP" << 'EOF'
export { runDoctor, formatDoctorReport } from './doctor.js';
export type { Check, DoctorReport } from './doctor.js';
export { probeVideo } from './util/ffprobe.js';
export type { ProbeResult, ProbeOptions } from './util/ffprobe.js';
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/index.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: doctor export block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 8 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 8 failed"
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
  git commit -m "feat(orchestrator,cli): ffprobe duration detection; --voiceover-only mode; real duration passed to compositor"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
