#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Creating directory structure"
mkdir -p src/types src/parser src/tts src/caption src/polish src/compositor src/recording test/fixtures

echo "Writing package.json"
cat > package.json << 'EOF'
{
  "name": "recovoice",
  "version": "0.1.0",
  "description": "Programmatic narrated captioned polished demo recordings from a single declarative file",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "recovoice": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm build"
  },
  "keywords": [
    "demo",
    "recording",
    "tauri",
    "playwright",
    "voiceover",
    "captions",
    "screen-recording"
  ],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^13.1.0",
    "js-yaml": "^4.1.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.10.2",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  },
  "peerDependencies": {
    "@srsholmes/tauri-playwright": ">=0.1.0"
  },
  "peerDependenciesMeta": {
    "@srsholmes/tauri-playwright": {
      "optional": true
    }
  }
}
EOF

echo "Writing pnpm-workspace.yaml"
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - '.'
EOF

echo "Writing tsconfig.json"
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
EOF

echo "Writing vitest.config.ts"
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
    environment: 'node',
  },
});
EOF

echo "Writing .gitignore"
cat > .gitignore << 'EOF'
node_modules/
dist/
output/
*.log
.DS_Store
coverage/
*.tsbuildinfo
EOF

echo "Writing .npmrc"
cat > .npmrc << 'EOF'
auto-install-peers=true
strict-peer-dependencies=false
EOF

echo "Writing src/index.ts"
cat > src/index.ts << 'EOF'
export { parseScript } from './parser/parser.js';
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
EOF

echo "Writing src/types/script.ts"
cat > src/types/script.ts << 'EOF'
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
EOF

echo "Writing src/types/recording.ts"
cat > src/types/recording.ts << 'EOF'
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
}

export interface AutoZoomConfig {
  minDwellMs?: number;
  dwellRadiusPx?: number;
  minClickCluster?: number;
  clickClusterTimeMs?: number;
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
EOF

echo "Writing a placeholder parser so index.ts typechecks"
cat > src/parser/parser.ts << 'EOF'
import type { Script } from '../types/script.js';

export function parseScript(_filePath: string): Script {
  throw new Error('parseScript not yet implemented');
}
EOF

echo "Installing dependencies with pnpm (this must happen before any tsc/npx calls)"
if ! pnpm install 2>&1; then
  echo "pnpm install failed"
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
if pnpm exec vitest run --passWithNoTests 2>&1; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "chore: set up workspace skeleton with core types (pnpm, latest deps)"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
