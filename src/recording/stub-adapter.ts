import type { Action } from '../types/script.js';
import type { CursorTelemetry } from '../types/recording.js';
import type {
  Compositor,
  CompositorOptions,
  RecordingAdapter,
  RecordingSession,
} from './types.js';

export interface StubCall {
  method:
    | 'startRecording'
    | 'stopRecording'
    | 'executeAction'
    | 'collectTelemetry'
    | 'screenshot';
  args?: unknown;
}

export class StubRecordingSession implements RecordingSession {
  readonly calls: StubCall[] = [];
  private readonly telemetry: CursorTelemetry;
  private readonly rawVideoPath: string;

  constructor(rawVideoPath: string, telemetry: CursorTelemetry) {
    this.rawVideoPath = rawVideoPath;
    this.telemetry = telemetry;
  }

  async startRecording(options: { path: string; fps: number }): Promise<void> {
    this.calls.push({ method: 'startRecording', args: options });
  }

  async stopRecording(): Promise<{ video: string }> {
    this.calls.push({ method: 'stopRecording' });
    return { video: this.rawVideoPath };
  }

  async executeAction(action: Action): Promise<void> {
    this.calls.push({ method: 'executeAction', args: action });
  }

  async collectTelemetry(): Promise<CursorTelemetry> {
    this.calls.push({ method: 'collectTelemetry' });
    return this.telemetry;
  }

  async screenshot(path: string): Promise<void> {
    this.calls.push({ method: 'screenshot', args: path });
  }

  async close(): Promise<void> {
    /* no-op */
  }
}

export class StubRecordingAdapter implements RecordingAdapter {
  readonly sessions: StubRecordingSession[] = [];
  private readonly rawVideoPath: string;
  private readonly telemetry: CursorTelemetry;

  constructor(options: {
    rawVideoPath: string;
    telemetry?: CursorTelemetry;
  }) {
    this.rawVideoPath = options.rawVideoPath;
    this.telemetry = options.telemetry ?? {
      events: [],
      timebaseOrigin: 0,
      viewport: { width: 1280, height: 800 },
    };
  }

  async launch(_options: {
    viewport?: { width: number; height: number };
  }): Promise<RecordingSession> {
    const session = new StubRecordingSession(
      this.rawVideoPath,
      this.telemetry,
    );
    this.sessions.push(session);
    return session;
  }
}

export class StubCompositor implements Compositor {
  readonly calls: CompositorOptions[] = [];

  async compose(options: CompositorOptions): Promise<void> {
    this.calls.push(options);
  }
}
