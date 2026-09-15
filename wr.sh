#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing src/tts/providers/mock.ts: msPerWord duration per word"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const msPerWord = (60_000 / this.wpm);
    const timings: WordTiming[] = [];
    let t = 0;
    for (const word of words) {
      const durationMs = Math.max(50, Math.round(word.length * msPerWord / 5));
      timings.push({ word, startMs: t, endMs: t + durationMs });
      t += durationMs;
    }
EOF
cat > "$NEW_TMP" << 'EOF'
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const msPerWord = 60_000 / this.wpm;
    const timings: WordTiming[] = [];
    let t = 0;
    for (const word of words) {
      const durationMs = Math.max(50, Math.round(msPerWord));
      timings.push({ word, startMs: t, endMs: t + durationMs });
      t += durationMs;
    }
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/tts/providers/mock.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old block not found")
    sys.exit(1)
content = content.replace(old, new)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for src/tts/providers/mock.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Fixing test/caption/generator.test.ts: assert LF-separated index"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
    expect(srt).toContain('2\r\n');
EOF
cat > "$NEW_TMP" << 'EOF'
    expect(srt).toContain('\n2\n');
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" test/caption/generator.test.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old block not found")
    sys.exit(1)
content = content.replace(old, new)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for test/caption/generator.test.ts"
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
  git commit -m "fix(tts,caption): constant per-word duration and LF-separated SRT assertion"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
