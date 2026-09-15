import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface ElevenLabsOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  modelId?: string;
}

interface ElevenLabsTimestampsResponse {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  normalized_alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export class ElevenLabsTTSProvider implements TTSProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultModelId: string;

  constructor(options: ElevenLabsOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.elevenlabs.io';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultModelId = options.modelId ?? 'eleven_multilingual_v2';
  }

  async synthesize(text: string, config: VoiceConfig): Promise<TTSResult> {
    const modelId = config.modelId ?? this.defaultModelId;
    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/with-timestamps`;

    const body: Record<string, unknown> = {
      text,
      model_id: modelId,
    };
    if (config.language) body.language_code = config.language;

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await readErrorBody(response);
      throw new Error(
        `ElevenLabs synthesis failed (${response.status}): ${errorText}`,
      );
    }

    const json = (await response.json()) as ElevenLabsTimestampsResponse;
    if (!json.audio_base64) {
      throw new Error('ElevenLabs response missing audio_base64');
    }

    const audio = Buffer.from(json.audio_base64, 'base64');
    const alignment = json.normalized_alignment ?? json.alignment;
    const timings = alignment
      ? timingsFromAlignment(alignment)
      : approximateTimings(text);

    return { audio, format: 'mp3', timings };
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '(unreadable error body)';
  }
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

function timingsFromAlignment(alignment: Alignment): WordTiming[] {
  const timings: WordTiming[] = [];
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  let currentWord = '';
  let wordStart: number | null = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const isSpace = /\s/.test(ch);

    if (isSpace) {
      if (currentWord.length > 0 && wordStart !== null) {
        timings.push({
          word: currentWord,
          startMs: Math.round(wordStart * 1000),
          endMs: Math.round((ends[i - 1] ?? wordStart) * 1000),
        });
        currentWord = '';
        wordStart = null;
      }
      continue;
    }

    if (wordStart === null) wordStart = starts[i] ?? 0;
    currentWord += ch;
  }

  if (currentWord.length > 0 && wordStart !== null) {
    timings.push({
      word: currentWord,
      startMs: Math.round(wordStart * 1000),
      endMs: Math.round((ends[chars.length - 1] ?? wordStart) * 1000),
    });
  }

  return timings;
}

export function approximateTimings(
  text: string,
  wpm = 150,
): WordTiming[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const msPerWord = 60_000 / wpm;
  const timings: WordTiming[] = [];
  let t = 0;
  for (const word of words) {
    const duration = Math.max(50, Math.round(msPerWord));
    timings.push({ word, startMs: t, endMs: t + duration });
    t += duration;
  }
  return timings;
}
