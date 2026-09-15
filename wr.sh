#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Improving Recovoice.check to validate config too"
python3 - << 'PYEOF'
path = 'src/recovoice.ts'
with open(path, 'r') as f:
    content = f.read()

old = """  async check(): Promise<CheckResult> {
    try {
      parseScript(this.opts.script);
      return { valid: true, errors: [] };
    } catch (err) {
      if (err instanceof ParseError) {
        const entry: { message: string; line?: number } = { message: err.message };
        if (err.line !== undefined) entry.line = err.line;
        return { valid: false, errors: [entry] };
      }
      return {
        valid: false,
        errors: [{ message: (err as Error).message }],
      };
    }
  }"""

new = """  async check(): Promise<CheckResult> {
    try {
      await this.loadMergedScript();
      return { valid: true, errors: [] };
    } catch (err) {
      if (err instanceof ParseError) {
        const entry: { message: string; line?: number } = { message: err.message };
        if (err.line !== undefined) entry.line = err.line;
        return { valid: false, errors: [entry] };
      }
      return {
        valid: false,
        errors: [{ message: (err as Error).message }],
      };
    }
  }"""

if old not in content:
    print("ERROR: check() block not found")
    raise SystemExit(1)
content = content.replace(old, new, 1)
with open(path, 'w') as f:
    f.write(content)
print("check() now validates config too")
PYEOF

echo "Adding config validation through the frontmatter schema"
python3 - << 'PYEOF'
path = 'src/config/loader.ts'
with open(path, 'r') as f:
    content = f.read()

old = """  const imported = await import(/* @vite-ignore */ path);
  const raw = (imported.default ?? imported) as unknown;
  if (!isPlainObject(raw)) {
    throw new Error(`Config file must export a plain object: ${path}`);
  }
  return { config: raw as Partial<Frontmatter>, path };"""

new = """  const imported = await import(/* @vite-ignore */ path);
  const raw = (imported.default ?? imported) as unknown;
  if (!isPlainObject(raw)) {
    throw new Error(`Config file must export a plain object: ${path}`);
  }

  const { validateFrontmatter } = await import('../parser/schema.js');
  const validation = validateFrontmatter(raw);
  if (!validation.valid) {
    const issue = validation.issues[0]!;
    throw new Error(
      `Invalid config file at "${issue.path}": ${issue.message}`,
    );
  }

  return { config: raw as Partial<Frontmatter>, path };"""

if old not in content:
    print("ERROR: config import block not found")
    raise SystemExit(1)
content = content.replace(old, new, 1)
with open(path, 'w') as f:
    f.write(content)
print("Config file validated against schema")
PYEOF

echo "Adding test for config validation in check()"
cat > test/recovoice/check-config.test.ts << 'TESTEOF'
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recovoice } from '../../src/recovoice.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import {
  StubRecordingAdapter,
  StubCompositor,
} from '../../src/recording/stub-adapter.js';

const noopSleep = async (): Promise<void> => undefined;

const VALID_SCRIPT = `---
fps: 30
---

\`visit("x")\`
Hello.
`;

let workDir: string;
let scriptPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'recovoice-check-cfg-'));
  scriptPath = join(workDir, 'demo.demo.md');
  writeFileSync(scriptPath, VALID_SCRIPT);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Recovoice.check with config file', () => {
  it('passes when config file is valid', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 60 };\n',
    );
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: join(workDir, 'out'),
      recordingAdapter: new StubRecordingAdapter({
        rawVideoPath: join(workDir, 'raw.mp4'),
      }),
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      config: { configCwd: workDir },
    });
    const result = await recovoice.check();
    expect(result.valid).toBe(true);
  });

  it('fails when config file has invalid values', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default { fps: 9999 };\n',
    );
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: join(workDir, 'out'),
      recordingAdapter: new StubRecordingAdapter({
        rawVideoPath: join(workDir, 'raw.mp4'),
      }),
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      config: { configCwd: workDir },
    });
    const result = await recovoice.check();
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toMatch(/fps/);
  });

  it('fails when config file is not a plain object', async () => {
    writeFileSync(
      join(workDir, 'recovoice.config.mjs'),
      'export default "nope";\n',
    );
    const recovoice = new Recovoice({
      sleep: noopSleep,
      script: scriptPath,
      output: join(workDir, 'out'),
      recordingAdapter: new StubRecordingAdapter({
        rawVideoPath: join(workDir, 'raw.mp4'),
      }),
      ttsProvider: new MockTTSProvider(),
      compositor: new StubCompositor(),
      config: { configCwd: workDir },
    });
    const result = await recovoice.check();
    expect(result.valid).toBe(false);
  });
});
TESTEOF

echo "Adding coverage configuration to vitest.config.ts"
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/cli.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 70,
        lines: 75,
      },
    },
  },
});
EOF

echo "Adding coverage dev dependency"
python3 - << 'PYEOF'
import json
with open('package.json', 'r') as f:
    pkg = json.load(f)
dev = pkg.get('devDependencies', {})
dev['@vitest/coverage-v8'] = '^3.2.7'
pkg['devDependencies'] = dev
scripts = pkg.get('scripts', {})
scripts['test:coverage'] = 'vitest run --coverage'
pkg['scripts'] = scripts
with open('package.json', 'w') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')
print("Added @vitest/coverage-v8 and test:coverage script")
PYEOF

echo "Installing new dev dependency"
if ! pnpm install 2>&1 | tail -15; then
  echo "pnpm install failed"
  exit 1
fi

echo "Writing .github/workflows/ci.yml"
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: test (${{ matrix.os }} / node ${{ matrix.node }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm

      - name: Install ffmpeg (Ubuntu)
        if: matrix.os == 'ubuntu-latest'
        run: sudo apt-get update && sudo apt-get install -y ffmpeg

      - name: Install ffmpeg (macOS)
        if: matrix.os == 'macos-latest'
        run: brew install ffmpeg

      - run: pnpm install --frozen-lockfile

      - run: pnpm exec tsc --noEmit

      - run: pnpm test

      - name: Upload coverage
        if: matrix.os == 'ubuntu-latest' && matrix.node == 22
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  lint:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec tsc --noEmit
EOF

echo "Writing .github/workflows/release.yml"
cat > .github/workflows/release.yml << 'EOF'
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - run: pnpm install --frozen-lockfile

      - run: pnpm exec tsc --noEmit

      - run: pnpm test

      - run: pnpm build

      - name: Publish to npm
        run: pnpm publish --no-git-checks --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
EOF

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
if pnpm exec vitest run --reporter=dot 2>&1 | tail -10; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "feat(config,ci): validate config file against schema in check(); add coverage thresholds and GitHub Actions workflows"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
