import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recovoice } from '../../src/recovoice.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import {
  StubCompositor,
  StubRecordingAdapter,
} from '../../src/recording/stub-adapter.js';

const SCRIPT = `---
fps: 30
voiceover:
  provider: mock
  voiceId: test-voice
captions:
  format: srt
---

\`visit("https://example.com")\`
Welcome to the demo.

\`click("#start")\`
Click the start button.
`;

let workDir: string;
let scriptPath: string;
let outputDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-test-'));
  scriptPath = join(workDir, 'demo.demo.md');
  outputDir = join(workDir, 'output');
  writeFileSync(scriptPath, SCRIPT);
});

describe('Recovoice.check', () => {
  it('returns valid for a well-formed script', async () => {
    const recovoice = new Recovoice({ script: scriptPath });
    const result = await recovoice.check();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports errors for a malformed script', async () => {
    writeFileSync(scriptPath, '`bad action here`\nprose\n');
    const recovoice = new Recovoice({ script: scriptPath });
    const result = await recovoice.check();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('does not invoke the recording adapter or TTS provider', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });
    const tts = new MockTTSProvider();
    let ttsCalls = 0;
    const wrappedTts = {
      synthesize: async (...args: Parameters<typeof tts.synthesize>) => {
        ttsCalls++;
        return tts.synthesize(...args);
      },
    };
    const recovoice = new Recovoice({
      script: scriptPath,
      recordingAdapter: adapter,
      ttsProvider: wrappedTts,
    });
    await recovoice.check();
    expect(adapter.sessions).toHaveLength(0);
    expect(ttsCalls).toBe(0);
  });
});

describe('Recovoice.run', () => {
  it('executes all actions in order', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
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

    expect(adapter.sessions).toHaveLength(1);
    const session = adapter.sessions[0]!;
    const actions = session.calls.filter((c) => c.method === 'executeAction');
    expect(actions).toHaveLength(2);
    const visited = (actions[0]!.args as { name: string }).name;
    const clicked = (actions[1]!.args as { name: string }).name;
    expect(visited).toBe('visit');
    expect(clicked).toBe('click');

    expect(result.finalVideo).toBeDefined();
    expect(compositor.calls).toHaveLength(1);
  });

  it('starts and stops recording around action execution', async () => {
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
    const methods = session.calls.map((c) => c.method);
    expect(methods[0]).toBe('startRecording');
    expect(methods).toContain('executeAction');
    expect(methods).toContain('stopRecording');
  });

  it('synthesizes voiceover for non-silent segments only', async () => {
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
    const result = await recovoice.run();
    expect(result.voiceovers.length).toBe(2);
  });

  it('writes captions.srt to the output directory', async () => {
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
    expect(existsSync(join(outputDir, 'captions.srt'))).toBe(true);
  });

  it('reuses cached voiceover audio on subsequent runs', async () => {
    const tts = new MockTTSProvider();
    let calls = 0;
    const wrappedTts = {
      synthesize: async (...args: Parameters<typeof tts.synthesize>) => {
        calls++;
        return tts.synthesize(...args);
      },
    };
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });

    const recovoice1 = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: wrappedTts,
      compositor: new StubCompositor(),
    });
    await recovoice1.run();
    const callsAfterFirst = calls;

    const recovoice2 = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: wrappedTts,
      compositor: new StubCompositor(),
    });
    await recovoice2.run();

    expect(calls).toBe(callsAfterFirst);
  });

  it('calls collectTelemetry and passes telemetry to compositor', async () => {
    const telemetryEvents = [
      { t: 0, x: 100, y: 100, type: 'move' as const },
      { t: 1000, x: 100, y: 100, type: 'move' as const },
    ];
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
      telemetry: {
        events: telemetryEvents,
        timebaseOrigin: 0,
        viewport: { width: 1280, height: 800 },
      },
    });
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
    });
    const result = await recovoice.run();
    expect(result.telemetry.events).toEqual(telemetryEvents);
  });

  it('cleans up partial output on failure', async () => {
    const failingAdapter = {
      launch: async () => {
        throw new Error('launch failed');
      },
    };
    const recovoice = new Recovoice({
      script: scriptPath,
      output: outputDir,
      recordingAdapter: failingAdapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
    });
    await expect(recovoice.run()).rejects.toThrow('launch failed');
    // Final output directory should not contain a final.mp4
    expect(existsSync(join(outputDir, 'final.mp4'))).toBe(false);
  });
});

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
  it('uses default fps of 60 when not specified', async () => {
    writeFileSync(
      scriptPath,
      '---\nvoiceover:\n  provider: mock\n  voiceId: v\n---\n\n`visit("x")`\nHello.\n',
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
    const startCall = adapter.sessions[0]!.calls.find(
      (c) => c.method === 'startRecording',
    );
    expect((startCall!.args as { fps: number }).fps).toBe(60);
  });

  it('respects fps from frontmatter', async () => {
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
    const startCall = adapter.sessions[0]!.calls.find(
      (c) => c.method === 'startRecording',
    );
    expect((startCall!.args as { fps: number }).fps).toBe(30);
  });
});
