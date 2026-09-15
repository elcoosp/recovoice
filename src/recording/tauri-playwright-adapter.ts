import type { Action } from '../types/script.js';
import type { CursorTelemetry } from '../types/recording.js';
import type {
  RecordingAdapter,
  RecordingSession,
} from './types.js';

interface TauriPlaywrightPage {
  startRecording(options: { path: string; fps: number }): Promise<void>;
  stopRecording(): Promise<{ video: string }>;
  evaluate<T>(fn: () => T): Promise<T>;
  addInitScript(fn: () => void): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  goto(url: string): Promise<void>;
  waitForSelector(selector: string, options?: unknown): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  [key: string]: unknown;
}

interface TauriPlaywrightModule {
  launch(options?: { viewport?: { width: number; height: number } }): Promise<TauriPlaywrightPage>;
}

const TELEMETRY_INIT = function (): void {
  const w = window as unknown as { __cursorTelemetry?: unknown[] };
  if (!w.__cursorTelemetry) {
    w.__cursorTelemetry = [];
    const push = (type: string, e: MouseEvent | WheelEvent) => {
      w.__cursorTelemetry!.push({
        t: performance.now(),
        x: (e as MouseEvent).clientX ?? 0,
        y: (e as MouseEvent).clientY ?? 0,
        type,
      });
    };
    window.addEventListener('mousemove', (e: MouseEvent) => push('move', e));
    window.addEventListener('mousedown', (e: MouseEvent) => push('click', e));
    window.addEventListener('wheel', (e: WheelEvent) => push('scroll', e));
  }
};

export function createTauriPlaywrightAdapter(
  moduleOverride?: TauriPlaywrightModule,
): RecordingAdapter {
  return {
    async launch(options): Promise<RecordingSession> {
      const module =
        moduleOverride ??
        ((await import('@srsholmes/tauri-playwright')) as unknown as TauriPlaywrightModule);
      const page = await module.launch(
        options.viewport ? { viewport: options.viewport } : {},
      );
      await page.addInitScript(TELEMETRY_INIT);
      return new TauriPlaywrightSession(page);
    },
  };
}

class TauriPlaywrightSession implements RecordingSession {
  constructor(private readonly page: TauriPlaywrightPage) {}

  async startRecording(options: { path: string; fps: number }): Promise<void> {
    await this.page.startRecording(options);
  }

  async stopRecording(): Promise<{ video: string }> {
    return this.page.stopRecording();
  }

  async executeAction(action: Action): Promise<void> {
    const method = (this.page as Record<string, unknown>)[action.name];
    if (typeof method !== 'function') {
      throw new Error(`Unknown action: ${action.name}`);
    }
    await (method as (...args: unknown[]) => Promise<void>).apply(
      this.page,
      action.args,
    );
  }

  async collectTelemetry(): Promise<CursorTelemetry> {
    const events = await this.page.evaluate(() => {
      const w = window as unknown as { __cursorTelemetry?: unknown[] };
      return (w.__cursorTelemetry ?? []) as Array<{
        t: number;
        x: number;
        y: number;
        type: string;
      }>;
    });
    return {
      events: events.map((e) => ({
        t: e.t,
        x: e.x,
        y: e.y,
        type: e.type as 'move' | 'click' | 'scroll',
      })),
      timebaseOrigin: 0,
      viewport: { width: 1280, height: 800 },
    };
  }

  async close(): Promise<void> {
    const close = (this.page as Record<string, unknown>)['close'];
    if (typeof close === 'function') {
      await (close as () => Promise<void>).call(this.page);
    }
  }
}
