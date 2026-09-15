import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function runCli(args: string[], cwd: string) {
  return spawnSync(
    'pnpm',
    ['exec', 'tsx', 'src/cli.ts', ...args],
    { cwd, encoding: 'utf-8', env: { ...process.env } },
  );
}

describe('CLI', () => {
  it('prints help with --help', () => {
    const work = mkdtempSync(join(tmpdir(), 'recovoice-cli-'));
    try {
      const result = runCli(['--help'], repoRoot);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recovoice');
      expect(result.stdout).toContain('--check');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('prints version with --version', () => {
    const result = runCli(['--version'], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('returns non-zero for --check on invalid script', () => {
    const work = mkdtempSync(join(tmpdir(), 'recovoice-cli-'));
    try {
      const scriptPath = join(work, 'bad.demo.md');
      writeFileSync(scriptPath, '`bad action here`\nprose\n');
      const result = runCli(['--check', scriptPath], repoRoot);
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/Malformed action|error/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('returns 0 for --check on valid script', () => {
    const work = mkdtempSync(join(tmpdir(), 'recovoice-cli-'));
    try {
      const scriptPath = join(work, 'ok.demo.md');
      writeFileSync(
        scriptPath,
        '---\nvoiceover:\n  provider: mock\n  voiceId: v\n---\n\n`visit("x")`\nHello.\n',
      );
      const result = runCli(['--check', scriptPath], repoRoot);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/valid|ok/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
