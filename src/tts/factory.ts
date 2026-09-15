import type { TTSProvider } from '../types/recording.js';
import { MockTTSProvider } from './providers/mock.js';
import { KokoroTTSProvider } from './providers/kokoro.js';
import { EdgeTTSProvider } from './providers/edge.js';

export interface TTSFactoryOptions {
  provider: 'mock' | 'kokoro' | 'edge';
  kokoroUrl?: string;
  edgeBinaryPath?: string;
}

export function createTTSProvider(options: TTSFactoryOptions): TTSProvider {
  switch (options.provider) {
    case 'kokoro': {
      const opts = options.kokoroUrl ? { baseUrl: options.kokoroUrl } : {};
      return new KokoroTTSProvider(opts);
    }
    case 'edge': {
      const opts = options.edgeBinaryPath
        ? { binaryPath: options.edgeBinaryPath }
        : {};
      return new EdgeTTSProvider(opts);
    }
    case 'mock':
    default:
      return new MockTTSProvider();
  }
}
