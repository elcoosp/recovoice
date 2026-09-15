import { describe, it, expect } from 'vitest';
import { createTauriPlaywrightAdapter } from '../../src/recording/tauri-playwright-adapter.js';

interface FakePage {
  startRecording(opts: { path: string; fps: number }): Promise<void>;
  stopRecording(): Promise<{ video: string }>;
  addInitScript(fn: () => void): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  close(): Promise<void>;
  calls: Array<{ method: string; args: unknown[] }>;
}

function makeFakePage(): FakePage {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    async startRecording(opts) {
      calls.push({ method: 'startRecording', args: [opts] });
    },
    async stopRecording() {
      calls.push({ method: 'stopRecording', args: [] });
      return { video: '/tmp/raw/video.mp4' };
    },
    async addInitScript(fn) {
      calls.push({ method: 'addInitScript', args: [fn] });
    },
    async evaluate<T>(_fn: () => T) {
      calls.push({ method: 'evaluate', args: [_fn] });
      return [
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 500, x: 200, y: 150, type: 'click' },
      ] as unknown as T;
    },
    async click(selector) {
      calls.push({ method: 'click', args: [selector] });
    },
    async fill(selector, value) {
      calls.push({ method: 'fill', args: [selector, value] });
    },
    async close() {
      calls.push({ method: 'close', args: [] });
    },
  };
}

describe('createTauriPlaywrightAdapter', () => {
  it('launches a page and installs the telemetry init script', async () => {
    const page = makeFakePage();
    const adapter = createTauriPlaywrightAdapter({
      launch: async () => page,
    });
    const session = await adapter.launch({ viewport: { width: 800, height: 600 } });
    const initCall = page.calls.find((c) => c.method === 'addInitScript');
    expect(initCall).toBeDefined();
    expect(session).toBeDefined();
  });

  it('starts and stops recording', async () => {
    const page = makeFakePage();
    const adapter = createTauriPlaywrightAdapter({ launch: async () => page });
    const session = await adapter.launch({});
    await session.startRecording({ path: '/tmp/raw', fps: 30 });
    const result = await session.stopRecording();
    expect(result.video).toBe('/tmp/raw/video.mp4');
    expect(page.calls.some((c) => c.method === 'startRecording')).toBe(true);
    expect(page.calls.some((c) => c.method === 'stopRecording')).toBe(true);
  });

  it('dispatches actions to the corresponding page method', async () => {
    const page = makeFakePage();
    const adapter = createTauriPlaywrightAdapter({ launch: async () => page });
    const session = await adapter.launch({});
    await session.executeAction({ name: 'click', args: ['#submit'], sourceLine: 1 });
    await session.executeAction({ name: 'fill', args: ['#email', 'a@b.c'], sourceLine: 2 });
    expect(page.calls.find((c) => c.method === 'click')!.args).toEqual(['#submit']);
    expect(page.calls.find((c) => c.method === 'fill')!.args).toEqual(['#email', 'a@b.c']);
  });

  it('throws on unknown action', async () => {
    const page = makeFakePage();
    const adapter = createTauriPlaywrightAdapter({ launch: async () => page });
    const session = await adapter.launch({});
    await expect(
      session.executeAction({ name: 'flyToMars', args: [], sourceLine: 1 }),
    ).rejects.toThrow('Unknown action: flyToMars');
  });

  it('collects telemetry from the page', async () => {
    const page = makeFakePage();
    const adapter = createTauriPlaywrightAdapter({ launch: async () => page });
    const session = await adapter.launch({});
    const telemetry = await session.collectTelemetry();
    expect(telemetry.events).toHaveLength(2);
    expect(telemetry.events[1]!.type).toBe('click');
  });
});
