import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface KokoroOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface KokoroTimestamp {
  word: string;
  start_time: number;
  end_time: number;
}

interface KokoroResponse {
  audio: string;
  timestamps: KokoroTimestamp[];
}

export class KokoroTTSProvider implements TTSProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KokoroOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:8880';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async synthesize(text: string, config: VoiceConfig): Promise<TTSResult> {
    const url = `${this.baseUrl}/v1/audio/speech/with-timestamps`;
    const body = {
      model: 'kokoro',
      input: text,
      voice: config.voiceId,
      response_format: 'mp3',
    };

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '(unreadable)');
      throw new Error(
        `Kokoro synthesis failed (${response.status}): ${errorText}`,
      );
    }

    const json = (await response.json()) as KokoroResponse;
    if (!json.audio) {
      throw new Error('Kokoro response missing audio field');
    }

    const audio = Buffer.from(json.audio, 'base64');
    const timings: WordTiming[] = (json.timestamps ?? []).map((t) => ({
      word: t.word,
      startMs: Math.round(t.start_time * 1000),
      endMs: Math.round(t.end_time * 1000),
    }));

    return { audio, format: 'mp3', timings };
  }
}
