import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recovoice } from '../../src/recovoice.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import {
  StubRecordingAdapter,
  StubCompositor,
} from '../../src/recording/stub-adapter.js';

const noopSleep = async (): Promise<void> => undefined;

const VALID_SCRIPT = `---
fps: 30
---

\`visit("x")\`
Hello.
`;

let workDir: string;
let scriptPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-check-cfg-'));
  scriptPath = join(workDir, 'demo.demo.md');
  writeFileSync(scriptPath, VALID_SCRIPT);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Recovoice.check with config file', () => {
  it('passes when config file is valid', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 60 };\n',
    );
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: join(workDir, 'out'),
      recordingAdapter: new StubRecordingAdapter({
        rawVideoPath: join(workDir, 'raw.mp4'),
      }),
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      config: { configCwd: workDir },
    });
    const result = await recovoice.check();
    expect(result.valid).toBe(true);
  });

  it('fails when config file has invalid values', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 9999 };\n',
    );
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: join(workDir, 'out'),
      recordingAdapter: new StubRecordingAdapter({
        rawVideoPath: join(workDir, 'raw.mp4'),
      }),
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      config: { configCwd: workDir },
    });
    const result = await recovoice.check();
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toMatch(/fps/);
  });

  it('fails when config file is not a plain object', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default "nope";\n',
    );
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: join(workDir, 'out'),
      recordingAdapter: new StubRecordingAdapter({
        rawVideoPath: join(workDir, 'raw.mp4'),
      }),
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      config: { configCwd: workDir },
    });
    const result = await recovoice.check();
    expect(result.valid).toBe(false);
  });
});
