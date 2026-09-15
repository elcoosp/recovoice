import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPolishCompositor } from '../../src/compositor/polish-compositor.js';
import { isNapiCanvasAvailable } from '../../src/compositor/napi-canvas.js';

function hasFfmpeg(): boolean {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

const ffmpegAvailable = hasFfmpeg();
const canvasAvailable = isNapiCanvasAvailable();

describe.skipIf(!ffmpegAvailable || !canvasAvailable)(
  'polish compositor end-to-end',
  () => {
    let workDir: string;
    let sourceVideo: string;

    beforeAll(() => {
      workDir = mkdtempSync(join(tmpdir(), 'recovoice-polish-e2e-'));
      sourceVideo = join(workDir, 'source.mp4');
      const result = spawnSync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=size=1280x800:rate=30:duration=1',
        '-pix_fmt', 'yuv420p',
        sourceVideo,
      ], { stdio: 'ignore' });
      if (result.status !== 0) {
        throw new Error('Failed to generate test video');
      }
    });

    it('produces a valid MP4 from a raw video with no polish', async () => {
      const output = join(workDir, 'output-plain.mp4');
      const compositor = createPolishCompositor({
        durationMs: 1000,
        fps: 30,
        outputSize: { width: 640, height: 360 },
        telemetry: {
          events: [],
          timebaseOrigin: 0,
          viewport: { width: 1280, height: 800 },
        },
        usePolish: false,
      });

      await compositor.compose({
        rawVideo: sourceVideo,
        voiceovers: [],
        output,
      });

      expect(existsSync(output)).toBe(true);
      expect(statSync(output).size).toBeGreaterThan(1000);

      const probe = spawnSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0',
        output,
      ], { encoding: 'utf-8' });
      expect(probe.stdout.trim()).toBe('640,360');
    }, 30000);

    it('applies camera zoom when telemetry contains a dwell', async () => {
      const output = join(workDir, 'output-zoom.mp4');
      const compositor = createPolishCompositor({
        durationMs: 1000,
        fps: 30,
        outputSize: { width: 640, height: 360 },
        telemetry: {
          events: [
            { t: 0, x: 300, y: 300, type: 'move' },
            { t: 300, x: 300, y: 300, type: 'move' },
            { t: 700, x: 300, y: 300, type: 'move' },
            { t: 900, x: 300, y: 300, type: 'move' },
          ],
          timebaseOrigin: 0,
          viewport: { width: 1280, height: 800 },
        },
        usePolish: true,
      });

      await compositor.compose({
        rawVideo: sourceVideo,
        voiceovers: [],
        output,
      });

      expect(existsSync(output)).toBe(true);
      expect(statSync(output).size).toBeGreaterThan(1000);
    }, 30000);

    it('cleans up work directory', () => {
      rmSync(workDir, { recursive: true, force: true });
      expect(true).toBe(true);
    });
  },
);

describe.skipIf(ffmpegAvailable && canvasAvailable)(
  'polish compositor end-to-end (skipped)',
  () => {
    it('requires ffmpeg and @napi-rs/canvas', () => {
      const missing: string[] = [];
      if (!ffmpegAvailable) missing.push('ffmpeg');
      if (!canvasAvailable) missing.push('@napi-rs/canvas');
      console.warn(
        `Skipping polish compositor e2e tests. Missing: ${missing.join(', ')}`,
      );
      expect(true).toBe(true);
    });
  },
);
