#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Removing ElevenLabs provider"
rm -f src/tts/providers/elevenlabs.ts
rm -f test/tts/elevenlabs.test.ts

echo "Writing src/tts/providers/kokoro.ts"
cat > src/tts/providers/kokoro.ts << 'EOF'
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
EOF

echo "Writing src/tts/providers/edge.ts"
cat > src/tts/providers/edge.ts << 'EOF'
import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface EdgeTTSOptions {
  binaryPath?: string;
}

interface EdgeWordBoundary {
  offset: number;
  duration: number;
  text: string;
}

export class EdgeTTSProvider implements TTSProvider {
  private readonly binaryPath: string;

  constructor(options: EdgeTTSOptions = {}) {
    this.binaryPath = options.binaryPath ?? 'edge-tts';
  }

  async synthesize(text: string, config: VoiceConfig): Promise<TTSResult> {
    const { spawn } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const tmpDir = mkdtempSync(join(tmpdir(), 'recovoice-edge-'));
    const audioPath = join(tmpDir, 'audio.mp3');
    const jsonPath = join(tmpDir, 'boundaries.json');

    const voice = config.voiceId || 'en-US-JennyNeural';
    const args = [
      '--voice', voice,
      '--text', text,
      '--write-media', audioPath,
      '--write-subtitles', jsonPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.binaryPath, args);
      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('error', (err) => reject(
        new Error(`Failed to launch edge-tts: ${err.message}`),
      ));
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`edge-tts exited with code ${code}: ${stderr}`));
      });
    });

    const { readFileSync, unlinkSync } = await import('node:fs');
    const audio = readFileSync(audioPath);
    const subtitleRaw = readFileSync(jsonPath, 'utf-8');
    const boundaries = JSON.parse(subtitleRaw) as EdgeWordBoundary[];

    const timings: WordTiming[] = boundaries.map((b) => ({
      word: b.text.trim(),
      startMs: Math.round(b.offset / 10_000),
      endMs: Math.round((b.offset + b.duration) / 10_000),
    }));

    try { unlinkSync(audioPath); unlinkSync(jsonPath); } catch { /* ignore */ }

    return { audio, format: 'mp3', timings };
  }
}
EOF

echo "Writing test/tts/kokoro-edge.test.ts"
cat > test/tts/kokoro-edge.test.ts << 'EOF'
import { describe, it, expect, vi } from 'vitest';
import { KokoroTTSProvider } from '../../src/tts/providers/kokoro.js';

describe('KokoroTTSProvider', () => {
  it('parses audio and timestamps from the API response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio: Buffer.from('audio-bytes').toString('base64'),
          timestamps: [
            { word: 'Hello', start_time: 0, end_time: 0.4 },
            { word: 'world', start_time: 0.4, end_time: 0.9 },
          ],
        }),
        { status: 200 },
      );
    });

    const provider = new KokoroTTSProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.synthesize('Hello world', {
      voiceId: 'af_bella',
    });

    expect(result.audio.toString()).toBe('audio-bytes');
    expect(result.format).toBe('mp3');
    expect(result.timings).toHaveLength(2);
    expect(result.timings[0]!.word).toBe('Hello');
    expect(result.timings[0]!.startMs).toBe(0);
    expect(result.timings[0]!.endMs).toBe(400);
    expect(result.timings[1]!.word).toBe('world');
  });

  it('throws on non-200 response', async () => {
    const fetchMock = vi.fn(async () => new Response('bad', { status: 500 }));
    const provider = new KokoroTTSProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize('hi', { voiceId: 'af_bella' }),
    ).rejects.toThrow(/500/);
  });
});
EOF

echo "Updating src/index.ts to remove ElevenLabs and export Kokoro and Edge"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export {
  ElevenLabsTTSProvider,
  approximateTimings,
} from './tts/providers/elevenlabs.js';
export type { ElevenLabsOptions } from './tts/providers/elevenlabs.js';
EOF
cat > "$NEW_TMP" << 'EOF'
export { KokoroTTSProvider } from './tts/providers/kokoro.js';
export type { KokoroOptions } from './tts/providers/kokoro.js';
export { EdgeTTSProvider } from './tts/providers/edge.js';
export type { EdgeTTSOptions } from './tts/providers/edge.js';
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/index.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: ElevenLabs export block not found")
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
  git commit -m "feat(tts): replace ElevenLabs with Kokoro (Apache 2.0) and edge-tts (free) providers"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
