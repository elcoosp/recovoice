#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Writing src/tts/providers/elevenlabs.ts"
cat > src/tts/providers/elevenlabs.ts << 'EOF'
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
EOF

echo "Writing test/tts/elevenlabs.test.ts"
cat > test/tts/elevenlabs.test.ts << 'EOF'
import { describe, it, expect, vi } from 'vitest';
import {
  ElevenLabsTTSProvider,
  approximateTimings,
} from '../../src/tts/providers/elevenlabs.js';

describe('approximateTimings', () => {
  it('produces sequential timings for each word', () => {
    const timings = approximateTimings('Hello brave world', 60);
    expect(timings).toHaveLength(3);
    expect(timings[0]!.word).toBe('Hello');
    expect(timings[0]!.endMs).toBeLessThanOrEqual(timings[1]!.startMs);
    expect(timings[1]!.endMs).toBeLessThanOrEqual(timings[2]!.startMs);
  });

  it('uses wpm to determine duration', () => {
    const timings = approximateTimings('a b c', 60);
    expect(timings[2]!.endMs).toBeCloseTo(3000, -2);
  });
});

describe('ElevenLabsTTSProvider', () => {
  it('sends a request with the voice id, model, and text', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('audio').toString('base64'),
          alignment: {
            characters: ['H', 'i'],
            character_start_times_seconds: [0, 0.1],
            character_end_times_seconds: [0.1, 0.2],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.synthesize('Hi', {
      voiceId: 'voice-123',
      modelId: 'eleven_multilingual_v2',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v1/text-to-speech/voice-123/with-timestamps');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('test-key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toBe('Hi');
    expect(body.model_id).toBe('eleven_multilingual_v2');

    expect(result.audio.toString()).toBe('audio');
    expect(result.format).toBe('mp3');
    expect(result.timings).toEqual([{ word: 'Hi', startMs: 0, endMs: 200 }]);
  });

  it('groups characters into words using alignment data', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('a').toString('base64'),
          alignment: {
            characters: ['H', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd'],
            character_start_times_seconds: [
              0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
            ],
            character_end_times_seconds: [
              0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55,
            ],
          },
        }),
        { status: 200 },
      );
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.synthesize('Hello world', {
      voiceId: 'v',
    });

    expect(result.timings).toHaveLength(2);
    expect(result.timings[0]!.word).toBe('Hello');
    expect(result.timings[0]!.startMs).toBe(0);
    expect(result.timings[0]!.endMs).toBe(250);
    expect(result.timings[1]!.word).toBe('world');
    expect(result.timings[1]!.startMs).toBe(300);
    expect(result.timings[1]!.endMs).toBe(550);
  });

  it('falls back to approximate timings when no alignment is provided', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('a').toString('base64'),
        }),
        { status: 200 },
      );
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.synthesize('one two', { voiceId: 'v' });
    expect(result.timings).toHaveLength(2);
  });

  it('throws an informative error when the API responds non-200', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('invalid api key', { status: 401 });
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'bad',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize('hi', { voiceId: 'v' }),
    ).rejects.toThrow(/401/);
  });

  it('throws when the response body is missing audio_base64', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    });
    const provider = new ElevenLabsTTSProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize('hi', { voiceId: 'v' }),
    ).rejects.toThrow(/audio_base64/);
  });
});
EOF

echo "Writing test/compositor/napi-canvas.test.ts"
cat > test/compositor/napi-canvas.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import {
  createNapiCanvas,
  isNapiCanvasAvailable,
} from '../../src/compositor/napi-canvas.js';

describe('napi-canvas availability', () => {
  it('reports availability without throwing', () => {
    const available = isNapiCanvasAvailable();
    expect(typeof available).toBe('boolean');
  });
});

describe('createNapiCanvas', () => {
  it('creates a canvas with the requested dimensions when available', () => {
    if (!isNapiCanvasAvailable()) return;
    const canvas = createNapiCanvas(320, 240);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
  });
});
EOF

echo "Writing src/compositor/napi-canvas.ts"
cat > src/compositor/napi-canvas.ts << 'EOF'
import type { CanvasLike } from './canvas-types.js';

let cachedModule: unknown = null;
let cachedError: Error | null = null;

function loadModule(): unknown {
  if (cachedModule) return cachedModule;
  if (cachedError) throw cachedError;
  try {
    const req = require('node:module').createRequire(import.meta.url);
    cachedModule = req('@napi-rs/canvas');
    return cachedModule;
  } catch (err) {
    cachedError = new Error(
      `@napi-rs/canvas is required for real compositing. Install it with: pnpm add @napi-rs/canvas. Underlying error: ${(err as Error).message}`,
    );
    throw cachedError;
  }
}

export function isNapiCanvasAvailable(): boolean {
  try {
    loadModule();
    return true;
  } catch {
    return false;
  }
}

interface NapiCanvasModule {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(source: Buffer | Uint8Array): Promise<unknown>;
}

export function createNapiCanvas(width: number, height: number): CanvasLike {
  const mod = loadModule() as NapiCanvasModule;
  return mod.createCanvas(width, height);
}

export async function loadImage(
  source: Buffer | Uint8Array,
): Promise<unknown> {
  const mod = loadModule() as NapiCanvasModule;
  return mod.loadImage(source);
}
EOF

echo "Adding @napi-rs/canvas as an optional dependency"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  "peerDependencies": {
    "@srsholmes/tauri-playwright": ">=0.1.0"
  },
  "peerDependenciesMeta": {
    "@srsholmes/tauri-playwright": {
      "optional": true
    }
  }
EOF
cat > "$NEW_TMP" << 'EOF'
  "peerDependencies": {
    "@srsholmes/tauri-playwright": ">=0.1.0"
  },
  "peerDependenciesMeta": {
    "@srsholmes/tauri-playwright": {
      "optional": true
    }
  },
  "optionalDependencies": {
    "@napi-rs/canvas": "^0.1.65"
  }
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" package.json << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: peerDependencies block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for package.json"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Installing optional dependency"
if ! pnpm install 2>&1; then
  echo "pnpm install failed"
  exit 1
fi

echo "Updating src/index.ts to export elevenlabs and napi canvas"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export { MockTTSProvider } from './tts/providers/mock.js';
export type { MockTTSOptions } from './tts/providers/mock.js';
EOF
cat > "$NEW_TMP" << 'EOF'
export { MockTTSProvider } from './tts/providers/mock.js';
export type { MockTTSOptions } from './tts/providers/mock.js';
export {
  ElevenLabsTTSProvider,
  approximateTimings,
} from './tts/providers/elevenlabs.js';
export type { ElevenLabsOptions } from './tts/providers/elevenlabs.js';
export {
  createNapiCanvas,
  isNapiCanvasAvailable,
  loadImage,
} from './compositor/napi-canvas.js';
export {
  renderFrame,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_FRAME_CONFIG,
} from './compositor/frame-renderer.js';
export type {
  RenderFrameInput,
  CursorStyle,
} from './compositor/frame-renderer.js';
export type {
  CanvasLike,
  CanvasRenderingContext2DLike,
  CanvasGradientLike,
} from './compositor/canvas-types.js';
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/index.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: mock provider export block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for src/index.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running tests"
if pnpm exec vitest run 2>&1; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "feat(tts,compositor): ElevenLabs provider with timestamps and optional @napi-rs/canvas loader"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
