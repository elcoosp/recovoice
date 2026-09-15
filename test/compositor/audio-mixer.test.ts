import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mixVoiceovers } from '../../src/compositor/audio-mixer.js';

function hasFfmpeg(): boolean {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

const ffmpegAvailable = hasFfmpeg();

describe('mixVoiceovers', () => {
  it('throws when a voiceover file does not exist', async () => {
    await expect(
      mixVoiceovers(
        [{ path: '/nonexistent/vo.mp3', startMs: 0 }],
        '/tmp/out.m4a',
      ),
    ).rejects.toThrow(/not found|Failed to launch/);
  });

  describe.skipIf(!ffmpegAvailable)('with ffmpeg', () => {
    let workDir: string;
    let vo1: string;
    let vo2: string;

    beforeAll(() => {
      workDir = mkdtempSync(join(tmpdir(), 'recovoice-mix-'));
      vo1 = join(workDir, 'vo1.wav');
      vo2 = join(workDir, 'vo2.wav');
      for (const [path, freq] of [[vo1, 440], [vo2, 880]] as const) {
        const r = spawnSync('ffmpeg', [
          '-y', '-f', 'lavfi',
          '-i', `sine=frequency=${freq}:duration=0.4`,
          '-c:a', 'pcm_s16le',
          path,
        ], { stdio: 'ignore' });
        if (r.status !== 0) throw new Error(`Failed to generate ${path}`);
      }
    });

    it('produces an audio file when given zero inputs', async () => {
      const out = join(workDir, 'silent.m4a');
      await mixVoiceovers([], out, { totalDurationMs: 1000 });
      expect(existsSync(out)).toBe(true);
      expect(statSync(out).size).toBeGreaterThan(0);
    }, 20000);

    it('produces an audio file when given one input', async () => {
      const out = join(workDir, 'one.m4a');
      await mixVoiceovers([{ path: vo1, startMs: 0 }], out);
      expect(existsSync(out)).toBe(true);
      expect(statSync(out).size).toBeGreaterThan(0);
    }, 20000);

    it('produces an audio file when given multiple offset inputs', async () => {
      const out = join(workDir, 'multi.m4a');
      await mixVoiceovers(
        [
          { path: vo1, startMs: 0 },
          { path: vo2, startMs: 500 },
        ],
        out,
        { totalDurationMs: 1500 },
      );
      expect(existsSync(out)).toBe(true);
      const probe = spawnSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        out,
      ], { encoding: 'utf-8' });
      const duration = Number.parseFloat(probe.stdout.trim());
      expect(duration).toBeGreaterThan(0.4);
    }, 30000);

    it('cleans up after tests', () => {
      rmSync(workDir, { recursive: true, force: true });
      expect(true).toBe(true);
    });
  });
});
