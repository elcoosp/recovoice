import type { Action } from '../types/script.js';
import type { CursorTelemetry } from '../types/recording.js';

export interface RecordingSession {
  startRecording(options: { path: string; fps: number }): Promise<void>;
  stopRecording(): Promise<{ video: string }>;
  executeAction(action: Action): Promise<void>;
  collectTelemetry(): Promise<CursorTelemetry>;
  /**
   * Capture a screenshot to the given path. Used to preserve diagnostic
   * context when an action fails. Implementations may no-op if unsupported.
   */
  screenshot?(path: string): Promise<void>;
  close(): Promise<void>;
}

export interface RecordingAdapter {
  launch(options: { viewport?: { width: number; height: number } }): Promise<RecordingSession>;
}

export interface CompositorOptions {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  /**
   * Optional pre-mixed audio track (single file). When present, the compositor
   * uses this as the single audio input rather than mixing the individual
   * voiceovers itself.
   */
  audioTrackPath?: string;
  captionsPath?: string;
  polish?: unknown;
  output: string;
}

export interface Compositor {
  compose(options: CompositorOptions): Promise<void>;
}
