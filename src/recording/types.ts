import type { Action } from '../types/script.js';
import type { CursorTelemetry } from '../types/recording.js';

export interface RecordingSession {
  startRecording(options: { path: string; fps: number }): Promise<void>;
  stopRecording(): Promise<{ video: string }>;
  executeAction(action: Action): Promise<void>;
  collectTelemetry(): Promise<CursorTelemetry>;
  /**
   * Ease the pointer to the visual center of a selector before an action.
   * Optional: implementations that cannot synthesize cursor motion may omit
   * it, and the timed executor will skip the sweep.
   */
  moveCursorTo?(selector: string): Promise<void>;
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
  /**
   * Video time (ms) at which each captured source frame should be displayed.
   * When present, the compositor lays the source frames onto this timeline
   * (i.e. it does not consume one frame per output frame) so the rendered video
   * can span a different duration than the raw capture, e.g. the narration.
   */
  frameTimesMs?: number[];
  polish?: unknown;
  output: string;
}

export interface Compositor {
  compose(options: CompositorOptions): Promise<void>;
}
