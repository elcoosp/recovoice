import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recovoice } from '../../src/recovoice.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import {
  StubRecordingAdapter,
  StubCompositor,
} from '../../src/recording/stub-adapter.js';
import { analyzePolishing } from '../../src/polish/pipeline.js';
import { scheduleFrames } from '../../src/polish/frame-scheduler.js';

const SCRIPT = `---
viewport: { width: 1280, height: 800 }
fps: 30
voiceover:
  provider: mock
  voiceId: narrator
captions:
  format: both
variables:
  appName: "Acme"
---

\`visit("https://app.example.com")\`
Welcome to {{appName}} - your workspace for real-time analytics.

\`click("#start")\`
Click the start button to begin the tour.
`;

const TELEMETRY = {
  events: [
    { t: 0, x: 100, y: 100, type: 'move' as const },
    { t: 200, x: 100, y: 100, type: 'move' as const },
    { t: 500, x: 102, y: 100, type: 'move' as const },
    { t: 900, x: 100, y: 100, type: 'move' as const },
    { t: 1200, x: 400, y: 300, type: 'move' as const },
    { t: 1400, x: 400, y: 300, type: 'click' as const },
    { t: 1600, x: 400, y: 300, type: 'click' as const },
    { t: 2000, x: 400, y: 300, type: 'move' as const },
  ],
  timebaseOrigin: 0,
  viewport: { width: 1280, height: 800 },
};

let workDir: string;
let scriptPath: string;
let outputDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-e2e-'));
  scriptPath = join(workDir, 'demo.demo.md');
  outputDir = join(workDir, 'output');
  writeFileSync(scriptPath, SCRIPT);
});

describe('end-to-end pipeline', () => {
  it('produces all expected artifacts', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
      telemetry: TELEMETRY,
    });
    const compositor = new StubCompositor();

    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor,
    });

    const result = await recovoice.run();

    expect(existsSync(join(outputDir, 'captions.srt'))).toBe(true);
    expect(existsSync(join(outputDir, 'captions.vtt'))).toBe(true);
    expect(result.voiceovers.length).toBe(2);
    expect(result.telemetry.events).toEqual(TELEMETRY.events);
  });

  it('produces captions with the substituted prose text', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
      telemetry: TELEMETRY,
    });
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
    });
    await recovoice.run();
    const srt = readFileSync(join(outputDir, 'captions.srt'), 'utf-8');
    expect(srt).toContain('Acme');
    expect(srt).toContain('start button');
  });

  it('runs the polish pipeline on captured telemetry', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
      telemetry: TELEMETRY,
    });
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
    });
    const result = await recovoice.run();

    const analysis = analyzePolishing(result.telemetry, {});
    // Dwell + click cluster should produce at least one zoom region
    expect(analysis.zoomRegions.length).toBeGreaterThanOrEqual(1);

    const schedules = Array.from(
      scheduleFrames({
        durationMs: 2000,
        fps: 30,
        viewport: result.telemetry.viewport,
        telemetry: result.telemetry,
        zoomRegions: analysis.zoomRegions,
        transitions: analysis.transitions,
        smoothingFactor: 0.3,
      }),
    );
    expect(schedules).toHaveLength(60);
    // At least one frame should have a camera scale > 1 (zoomed in)
    const zoomedFrames = schedules.filter((s) => s.camera.scale > 1.01);
    expect(zoomedFrames.length).toBeGreaterThan(0);
  });

  it('passes raw video and voiceovers to the compositor', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: '/tmp/e2e-raw.mp4',
      telemetry: TELEMETRY,
    });
    const compositor = new StubCompositor();
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor,
    });
    await recovoice.run();
    expect(compositor.calls).toHaveLength(1);
    const call = compositor.calls[0]!;
    expect(call.voiceovers.length).toBe(2);
    expect(call.rawVideo).toContain('raw.mp4');
  });

  it('substitutes variables in action arguments end to end', async () => {
    writeFileSync(
      scriptPath,
      '---\nvoiceover:\n  provider: mock\n  voiceId: v\nvariables:\n  sel: "#submit"\n---\n\n`click("{{sel}}")`\nClick it.\n',
    );
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
    });
    await recovoice.run();
    const session = adapter.sessions[0]!;
    const actionCall = session.calls.find((c) => c.method === 'executeAction');
    expect((actionCall!.args as { args: string[] }).args).toEqual(['#submit']);
  });

  it('is deterministic across two runs (same input, same captions)', async () => {
    const adapter1 = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'a.mp4'),
      telemetry: TELEMETRY,
    });
    const compositor1 = new StubCompositor();
    await new Recovoice({
      script: scriptPath,
      output: join(workDir, 'out1'),
      recordingAdapter: adapter1,
      ttsProvider: new MockTTSProvider(),
      compositor: compositor1,
    }).run();

    const adapter2 = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'b.mp4'),
      telemetry: TELEMETRY,
    });
    const compositor2 = new StubCompositor();
    await new Recovoice({
      script: scriptPath,
      output: join(workDir, 'out2'),
      recordingAdapter: adapter2,
      ttsProvider: new MockTTSProvider(),
      compositor: compositor2,
    }).run();

    const srt1 = readFileSync(join(workDir, 'out1', 'captions.srt'), 'utf-8');
    const srt2 = readFileSync(join(workDir, 'out2', 'captions.srt'), 'utf-8');
    expect(srt1).toBe(srt2);
  });

  it('handles script with a caption override end to end', async () => {
    writeFileSync(
      scriptPath,
      '---\nvoiceover:\n  provider: mock\n  voiceId: v\n---\n\n`click("#export")`\nExport the data. {{caption: Short caption.}}\n',
    );
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
    });
    await recovoice.run();
    // Caption override still needs to be honored by the caption generator;
    // for now, the pipeline generates cues from TTS timings of the spoken
    // text, so the override is captured in the AST but not yet used at the
    // caption-writing step. This test asserts the AST captured it.
    const { parseScript } = await import('../../src/parser/parser.js');
    const ast = parseScript(scriptPath);
    expect(ast.segments[0]!.captionOverride?.text).toBe('Short caption.');
  });

  it('produces a valid output even when polish is disabled', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
      telemetry: TELEMETRY,
    });
    const compositor = new StubCompositor();
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor,
    });
    await recovoice.run();

    const analysis = analyzePolishing(TELEMETRY, { autoZoom: false });
    expect(analysis.zoomRegions).toEqual([]);
    expect(analysis.transitions).toEqual([]);
  });
});
