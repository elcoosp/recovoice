export { parseScript, parseScriptFromString } from './parser/parser.js';
export { ParseError } from './parser/errors.js';
export {
  cubicBezier,
  linear,
  easeConnectedPan,
  easeOutScreenStudio,
  easeInOutCubic,
  easeOutCubic,
} from './polish/easing.js';
export type { EasingFunction } from './polish/easing.js';
export {
  analyzeZoomRegions,
  DEFAULT_AUTO_ZOOM_CONFIG,
} from './polish/auto-zoom.js';
export type { AutoZoomConfig } from './polish/auto-zoom.js';
export {
  findConnectedTransitions,
  CHAINED_ZOOM_PAN_GAP_MS,
  CONNECTED_ZOOM_PAN_DURATION_MS,
} from './polish/connected-transitions.js';
export {
  computeCursorGhostCount,
  computeCursorGhostAlpha,
  computeZoomBlurRadius,
  MAX_CURSOR_GHOSTS,
  MAX_ZOOM_BLUR_PX,
} from './polish/motion-blur.js';
export {
  Spring1D,
  springConfigFromSmoothingFactor,
  DEFAULT_SPRING_CONFIG,
  SwaySpringConfig,
} from './polish/spring.js';
export type { SpringConfig } from './polish/spring.js';
export {
  computeSwayAngle,
  MAX_ROTATION,
  SPEED_REFERENCE,
  VERTICAL_WEIGHT,
  INTENSITY_SCALE,
} from './polish/cursor-sway.js';
export { MockTTSProvider } from './tts/providers/mock.js';
export type { MockTTSOptions } from './tts/providers/mock.js';
export { withRetry } from './tts/retry.js';
export type { RetryOptions } from './tts/retry.js';
export {
  generateCues,
  cuesToSrt,
  cuesToVtt,
} from './caption/generator.js';
export type { CaptionCue, GenerateCuesOptions } from './caption/generator.js';
export type {
  Script,
  Segment,
  Action,
  Frontmatter,
  VoiceoverConfig,
  CaptionConfig,
  VariableMap,
  CaptionOverride,
} from './types/script.js';
export type {
  CursorTelemetry,
  CursorEvent,
  ZoomRegion,
  ConnectedTransition,
  WordTiming,
  TTSProvider,
  TTSResult,
  VoiceConfig,
  PolishConfig,
} from './types/recording.js';
