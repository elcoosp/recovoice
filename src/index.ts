export { parseScript, parseScriptFromString } from './parser/parser.js';
export { ParseError } from './parser/errors.js';
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
