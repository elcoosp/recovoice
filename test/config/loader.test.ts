import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, mergeConfig } from '../../src/config/loader.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-config-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns empty config when no file is present', async () => {
    const { config, path } = await loadConfig(workDir);
    expect(config).toEqual({});
    expect(path).toBeUndefined();
  });

  it('loads recovoice.config.mjs', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 30, voiceover: { provider: "mock", voiceId: "v" } };\n',
    );
    const { config, path } = await loadConfig(workDir);
    expect(path).toContain('recovoice.config.mjs');
    expect(config.fps).toBe(30);
    expect(config.voiceover?.provider).toBe('mock');
  });

  it('loads an explicit config path', async () => {
    writeFileSync(
      join(workDir, 'custom.mjs'),
      'export default { fps: 45 };\n',
    );
    const { config } = await loadConfig(workDir, 'custom.mjs');
    expect(config.fps).toBe(45);
  });

  it('throws when explicit config file does not exist', async () => {
    await expect(loadConfig(workDir, 'missing.mjs')).rejects.toThrow(
      /not found/,
    );
  });

  it('throws when config is not a plain object', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default "not an object";\n',
    );
    await expect(loadConfig(workDir)).rejects.toThrow(/plain object/);
  });
});

describe('mergeConfig', () => {
  it('uses frontmatter when no other sources are provided', () => {
    const merged = mergeConfig({ frontmatter: { fps: 60 } });
    expect(merged.fps).toBe(60);
  });

  it('file overrides frontmatter', () => {
    const merged = mergeConfig({
      frontmatter: { fps: 60 },
      file: { fps: 30 },
    });
    expect(merged.fps).toBe(30);
  });

  it('CLI overrides file', () => {
    const merged = mergeConfig({
      frontmatter: { fps: 60 },
      file: { fps: 30 },
      cli: { fps: 15 },
    });
    expect(merged.fps).toBe(15);
  });

  it('deep-merges nested objects', () => {
    const merged = mergeConfig({
      frontmatter: {
        voiceover: { provider: 'kokoro', voiceId: 'a' },
      },
      file: {
        voiceover: { provider: 'edge', voiceId: 'b' },
      },
    });
    expect(merged.voiceover?.provider).toBe('edge');
    expect(merged.voiceover?.voiceId).toBe('b');
  });

  it('deep-merges partial overrides preserving other keys', () => {
    const merged = mergeConfig({
      frontmatter: {
        voiceover: { provider: 'kokoro', voiceId: 'a', modelId: 'm' },
        fps: 60,
      },
      file: { voiceover: { voiceId: 'b' } },
    });
    expect(merged.voiceover?.provider).toBe('kokoro');
    expect(merged.voiceover?.voiceId).toBe('b');
    expect(merged.voiceover?.modelId).toBe('m');
    expect(merged.fps).toBe(60);
  });
});
