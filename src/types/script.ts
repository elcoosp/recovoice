export interface Frontmatter {
  viewport?: { width: number; height: number };
  typingSpeed?: number;
  fps?: number;
  voiceover?: VoiceoverConfig;
  captions?: CaptionConfig;
  variables?: VariableMap;
}

export interface VoiceoverConfig {
  provider: string;
  voiceId: string;
  modelId?: string;
  language?: string;
}

export interface CaptionConfig {
  format?: 'srt' | 'vtt' | 'both';
  burn?: boolean;
  source?: 'spoken' | 'explicit' | 'both';
  style?: CaptionStyle;
}

export interface CaptionStyle {
  font?: string;
  size?: number;
  color?: string;
  background?: string;
  position?: 'top' | 'bottom' | 'center';
}

export type VariableMap = Record<string, string>;

export interface Action {
  name: string;
  args: unknown[];
  sourceLine: number;
}

export interface CaptionOverride {
  text: string;
  sourceLine: number;
}

export interface Segment {
  prose: string;
  actions: Action[];
  captionOverride?: CaptionOverride;
  sourceLine: number;
  silent: boolean;
}

export interface Script {
  frontmatter: Frontmatter;
  segments: Segment[];
  filePath: string;
}
