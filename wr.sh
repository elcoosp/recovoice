#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing audio-mixer: pipe stderr so we can capture it"
python3 - << 'PYEOF'
path = 'src/compositor/audio-mixer.ts'
with open(path, 'r') as f:
    content = f.read()
content = content.replace(
    "const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'ignore'] });",
    "const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });",
)
with open(path, 'w') as f:
    f.write(content)
print("Patched stdio to pipe stderr")
PYEOF

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
  git commit -m "fix(tts,compositor): mock TTS produces valid silent WAV; audio mixer skips undersized files and captures stderr"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
