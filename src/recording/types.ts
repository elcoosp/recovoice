import type { Action } from '../types/script.js';
import type { CursorTelemetry } from '../types/recording.js';

export interface RecordingSession {
  startRecording(options: { path: string; fps: number }): Promise<void>;
  stopRecording(): Promise<{ video: string }>;
  executeAction(action: Action): Promise<void>;
  collectTelemetry(): Promise<CursorTelemetry>;
  close(): Promise<void>;
}

export interface RecordingAdapter {
  launch(options: { viewport?: { width: number; height: number } }): Promise<RecordingSession>;
}

export interface CompositorOptions {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  captionsPath?: string;
  polish?: unknown;
  output: string;
}

export interface Compositor {
  compose(options: CompositorOptions): Promise<void>;
}
