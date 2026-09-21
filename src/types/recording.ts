import type { CaptionStyle } from './script.js';

export interface CursorEvent {
  t: number;
  x: number;
  y: number;
  type: 'move' | 'click' | 'scroll';
}

export interface CursorTelemetry {
  events: CursorEvent[];
  timebaseOrigin: number;
  viewport: { width: number; height: number };
  /**
   * Epoch milliseconds (Date.now) captured at the same instant the telemetry
   * timebase was established. Lets consumers convert event `t` values to a
   * wall clock so they can be aligned to frame capture timestamps.
   */
  wallBaseMs?: number;
}

export interface ZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  focus: { cx: number; cy: number };
  depth: number;
}

export interface ConnectedTransition {
  fromRegion: ZoomRegion;
  toRegion: ZoomRegion;
  panStartMs: number;
  panEndMs: number;
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface VoiceConfig {
  voiceId: string;
  modelId?: string;
  language?: string;
}

export interface TTSResult {
  audio: Buffer;
  format: 'mp3' | 'wav';
  timings: WordTiming[];
}

export interface TTSProvider {
  synthesize(text: string, config: VoiceConfig): Promise<TTSResult>;
}

export interface PolishConfig {
  autoZoom?: boolean | AutoZoomConfig;
  cursorSmoothing?: boolean | number;
  cursorSway?: boolean | number;
  cursorMotionBlur?: boolean | number;
  zoomMotionBlur?: boolean | number;
  connectedTransitions?: boolean;
  background?: BackgroundConfig;
  frame?: FrameConfig;
  captionStyle?: CaptionStyle;
  /**
   * Output canvas size. A number scales the source viewport; an object sets
   * the exact dimensions. Defaults to the recorded viewport size.
   */
  output?: number | { width: number; height: number };
  /**
   * Video encoder for polished output. Defaults to h264_videotoolbox when
   * available, falling back to libx264.
   */
  encoder?: 'auto' | 'videotoolbox' | 'libx264';
}

export interface AutoZoomConfig {
  minDwellMs?: number;
  dwellRadiusPx?: number;
  minClickCluster?: number;
  clickClusterTimeMs?: number;
  minClickRegionMs?: number;
  maxDwellMs?: number;
  minRegionStartMs?: number;
  maxRegionMs?: number;
  minGapBetweenRegionsMs?: number;
  defaultDepth?: number;
}

export interface BackgroundConfig {
  type: 'gradient' | 'solid' | 'wallpaper' | 'blur';
  value?: string;
}

export interface FrameConfig {
  padding?: number;
  borderRadius?: number;
  shadow?: boolean;
}
