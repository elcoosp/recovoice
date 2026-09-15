#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Rewriting src/cache/audio-cache.ts to store synthesis results (audio + timings + format)"
cat > src/cache/audio-cache.ts << 'EOF'
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TTSResult, VoiceConfig, WordTiming } from '../types/recording.js';

export function hashSynthesisInput(
  text: string,
  config: VoiceConfig,
): string {
  const h = createHash('sha256');
  h.update('text:');
  h.update(text);
  h.update('\nvoiceId:');
  h.update(config.voiceId);
  if (config.modelId) {
    h.update('\nmodelId:');
    h.update(config.modelId);
  }
  if (config.language) {
    h.update('\nlanguage:');
    h.update(config.language);
  }
  return h.digest('hex');
}

interface StoredSynthesis {
  format: 'mp3' | 'wav';
  audioBase64: string;
  timings: WordTiming[];
}

export class AudioCache {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  getSynthesis(key: string): TTSResult | undefined {
    const path = join(this.dir, `${key}.json`);
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, 'utf-8');
    let stored: StoredSynthesis;
    try {
      stored = JSON.parse(raw) as StoredSynthesis;
    } catch {
      return undefined;
    }
    if (
      typeof stored.audioBase64 !== 'string' ||
      !Array.isArray(stored.timings) ||
      (stored.format !== 'mp3' && stored.format !== 'wav')
    ) {
      return undefined;
    }
    return {
      audio: Buffer.from(stored.audioBase64, 'base64'),
      format: stored.format,
      timings: stored.timings,
    };
  }

  setSynthesis(key: string, result: TTSResult): void {
    const stored: StoredSynthesis = {
      format: result.format,
      audioBase64: result.audio.toString('base64'),
      timings: result.timings,
    };
    const path = join(this.dir, `${key}.json`);
    writeFileSync(path, JSON.stringify(stored));
  }

  get(key: string): Buffer | undefined {
    const path = join(this.dir, `${key}.bin`);
    if (!existsSync(path)) return undefined;
    return readFileSync(path);
  }

  set(key: string, audio: Buffer): void {
    const path = join(this.dir, `${key}.bin`);
    writeFileSync(path, audio);
  }
}
EOF

echo "Rewriting test/cache/audio-cache.test.ts to cover synthesis caching"
cat > test/cache/audio-cache.test.ts << 'EOF'
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AudioCache,
  hashSynthesisInput,
} from '../../src/cache/audio-cache.js';

describe('hashSynthesisInput', () => {
  it('returns the same hash for identical inputs', () => {
    const a = hashSynthesisInput('Hello', { voiceId: 'v1' });
    const b = hashSynthesisInput('Hello', { voiceId: 'v1' });
    expect(a).toBe(b);
  });

  it('returns different hashes for different text', () => {
    const a = hashSynthesisInput('Hello', { voiceId: 'v1' });
    const b = hashSynthesisInput('World', { voiceId: 'v1' });
    expect(a).not.toBe(b);
  });

  it('returns different hashes for different voice', () => {
    const a = hashSynthesisInput('Hello', { voiceId: 'v1' });
    const b = hashSynthesisInput('Hello', { voiceId: 'v2' });
    expect(a).not.toBe(b);
  });

  it('returns a hex string of length 64', () => {
    const h = hashSynthesisInput('Hello', { voiceId: 'v1' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AudioCache', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'recovoice-cache-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('raw buffer API', () => {
    it('returns undefined for a miss', () => {
      const cache = new AudioCache(cacheDir);
      expect(cache.get('nonexistent-key')).toBeUndefined();
    });

    it('stores and retrieves audio', () => {
      const cache = new AudioCache(cacheDir);
      const audio = Buffer.from('fake audio bytes');
      cache.set('key1', audio);
      const retrieved = cache.get('key1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.equals(audio)).toBe(true);
    });

    it('persists across instances', () => {
      const cache1 = new AudioCache(cacheDir);
      cache1.set('key1', Buffer.from('data'));
      const cache2 = new AudioCache(cacheDir);
      expect(cache2.get('key1')).toBeDefined();
    });

    it('creates the cache directory if missing', () => {
      const nested = join(cacheDir, 'deep', 'nested');
      const cache = new AudioCache(nested);
      cache.set('k', Buffer.from('data'));
      expect(existsSync(nested)).toBe(true);
    });
  });

  describe('synthesis API', () => {
    it('returns undefined for a synthesis miss', () => {
      const cache = new AudioCache(cacheDir);
      expect(cache.getSynthesis('missing')).toBeUndefined();
    });

    it('stores and retrieves full synthesis results (audio + timings + format)', () => {
      const cache = new AudioCache(cacheDir);
      const audio = Buffer.from('fake audio');
      const timings = [
        { word: 'Hello', startMs: 0, endMs: 400 },
        { word: 'world', startMs: 400, endMs: 900 },
      ];
      cache.setSynthesis('k1', { audio, format: 'mp3', timings });
      const result = cache.getSynthesis('k1');
      expect(result).toBeDefined();
      expect(result!.audio.equals(audio)).toBe(true);
      expect(result!.format).toBe('mp3');
      expect(result!.timings).toEqual(timings);
    });

    it('persists synthesis results across instances', () => {
      const c1 = new AudioCache(cacheDir);
      c1.setSynthesis('k1', {
        audio: Buffer.from('x'),
        format: 'wav',
        timings: [{ word: 'a', startMs: 0, endMs: 100 }],
      });
      const c2 = new AudioCache(cacheDir);
      const result = c2.getSynthesis('k1');
      expect(result).toBeDefined();
      expect(result!.format).toBe('wav');
    });

    it('returns undefined for a malformed JSON payload', () => {
      const cache = new AudioCache(cacheDir);
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(join(cacheDir, 'bad.json'), 'not json');
      expect(cache.getSynthesis('bad')).toBeUndefined();
    });
  });
});
EOF

echo "Fixing src/recovoice.ts: use synthesis cache to skip TTS on hit"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
      const key = hashSynthesisInput(segment.prose, voiceConfig);
      const cachedAudio = cache.get(key);

      let audio: Buffer;
      let timings: WordTiming[];
      let format: 'mp3' | 'wav';

      if (cachedAudio) {
        const result = await this.opts.ttsProvider.synthesize(
          segment.prose,
          voiceConfig,
        );
        audio = cachedAudio;
        timings = result.timings;
        format = result.format;
      } else {
        const result = await this.opts.ttsProvider.synthesize(
          segment.prose,
          voiceConfig,
        );
        audio = result.audio;
        timings = result.timings;
        format = result.format;
        cache.set(key, audio);
      }

      const fileName = `voiceover-${String(i + 1).padStart(3, '0')}.${format}`;
      const filePath = join(assetsDir, fileName);
      writeFileSync(filePath, audio);
EOF
cat > "$NEW_TMP" << 'EOF'
      const key = hashSynthesisInput(segment.prose, voiceConfig);
      const cached = cache.getSynthesis(key);

      let audio: Buffer;
      let timings: WordTiming[];
      let format: 'mp3' | 'wav';

      if (cached) {
        audio = cached.audio;
        timings = cached.timings;
        format = cached.format;
      } else {
        const result = await this.opts.ttsProvider.synthesize(
          segment.prose,
          voiceConfig,
        );
        audio = result.audio;
        timings = result.timings;
        format = result.format;
        cache.setSynthesis(key, result);
      }

      const fileName = `voiceover-${String(i + 1).padStart(3, '0')}.${format}`;
      const filePath = join(assetsDir, fileName);
      writeFileSync(filePath, audio);
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recovoice.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old cache block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for src/recovoice.ts"
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
  git commit -m "fix(cache): persist synthesis results (audio + timings + format) to eliminate TTS calls on cache hit"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
