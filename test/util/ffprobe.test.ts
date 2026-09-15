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
