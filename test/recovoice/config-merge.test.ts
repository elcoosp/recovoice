import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recovoice } from '../../src/recovoice.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import {
  StubRecordingAdapter,
  StubCompositor,
} from '../../src/recording/stub-adapter.js';

const SCRIPT = `---
fps: 15
voiceover:
  provider: mock
  voiceId: script-voice
---

\`visit("https://example.com")\`
Hello world.
`;

const noopSleep = async (): Promise<void> => undefined;

let workDir: string;
let scriptPath: string;
let outputDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-config-merge-'));
  scriptPath = join(workDir, 'demo.demo.md');
  outputDir = join(workDir, 'output');
  writeFileSync(scriptPath, SCRIPT);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Recovoice config merge', () => {
  it('uses frontmatter when no config is provided', async () => {
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
    });
    await recovoice.run();
    const startCall = adapter.sessions[0]!.calls.find(
      (c) => c.method === 'startRecording',
    );
    expect((startCall!.args as { fps: number }).fps).toBe(15);
  });

  it('config file overrides frontmatter', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 24 };\n',
    );
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
      config: { configCwd: workDir },
    });
    await recovoice.run();
    const startCall = adapter.sessions[0]!.calls.find(
      (c) => c.method === 'startRecording',
    );
    expect((startCall!.args as { fps: number }).fps).toBe(24);
  });

  it('CLI overrides take precedence over config file', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 24 };\n',
    );
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
      config: { configCwd: workDir, cliOverrides: { fps: 48 } },
    });
    await recovoice.run();
    const startCall = adapter.sessions[0]!.calls.find(
      (c) => c.method === 'startRecording',
    );
    expect((startCall!.args as { fps: number }).fps).toBe(48);
  });

  it('deep-merges voiceover config', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { voiceover: { provider: "mock", voiceId: "config-voice" } };\n',
    );
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
      config: { configCwd: workDir },
    });
    const result = await recovoice.run();
    // The voiceover file should exist (proving synthesis happened)
    expect(result.voiceovers.length).toBeGreaterThan(0);
    expect(existsSync(result.voiceovers[0]!)).toBe(true);
  });

  it('still writes captions with merged config', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { captions: { format: "both" } };\n',
    );
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
      config: { configCwd: workDir },
    });
    await recovoice.run();
    expect(existsSync(join(outputDir, 'captions.srt'))).toBe(true);
    expect(existsSync(join(outputDir, 'captions.vtt'))).toBe(true);
  });
});
