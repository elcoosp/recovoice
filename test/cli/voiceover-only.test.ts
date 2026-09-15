import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recovoice } from '../../src/recovoice.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import {
  StubRecordingAdapter,
  StubCompositor,
} from '../../src/recording/stub-adapter.js';

const SCRIPT = `---
voiceover:
  provider: mock
  voiceId: v
captions:
  format: both
---

\`visit("https://example.com")\`
Hello world from the demo.

\`click("#start")\`
Let's begin the tour.
`;

const noopSleep = async (): Promise<void> => undefined;

let workDir: string;
let scriptPath: string;
let outputDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-vo-'));
  scriptPath = join(workDir, 'demo.demo.md');
  outputDir = join(workDir, 'output');
  writeFileSync(scriptPath, SCRIPT);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('voiceoverOnly mode', () => {
  it('produces captions and voiceover assets but no recording', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });
    const compositor = new StubCompositor();
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor,
      voiceoverOnly: true,
    });
    const result = await recovoice.run();

    expect(adapter.sessions).toHaveLength(0);
    expect(compositor.calls).toHaveLength(0);
    expect(result.finalVideo).toBe('');
    expect(result.rawVideo).toBe('');
    expect(result.durationMs).toBe(0);
    expect(result.voiceovers.length).toBe(2);
    for (const vo of result.voiceovers) {
      expect(existsSync(vo)).toBe(true);
    }
    expect(existsSync(join(outputDir, 'captions.srt'))).toBe(true);
    expect(existsSync(join(outputDir, 'captions.vtt'))).toBe(true);
  });

  it('remaps voiceover paths into the published assets directory', async () => {
    const adapter = new StubRecordingAdapter({
      rawVideoPath: join(workDir, 'raw.mp4'),
    });
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      voiceoverOnly: true,
    });
    const result = await recovoice.run();
    expect(result.voiceovers[0]).toContain('/assets/');
    expect(result.voiceovers[0]).not.toContain('/.tmp/');
  });

  it('caches voiceovers across voiceoverOnly runs', async () => {
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
      sleep: noopSleep,
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: wrappedTts,
      compositor: new StubCompositor(),
      voiceoverOnly: true,
    });
    await recovoice1.run();
    const callsAfterFirst = calls;

    const recovoice2 = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: outputDir,
      recordingAdapter: adapter,
      ttsProvider: wrappedTts,
      compositor: new StubCompositor(),
      voiceoverOnly: true,
    });
    await recovoice2.run();
    expect(calls).toBe(callsAfterFirst);
  });
});
