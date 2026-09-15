#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing src/cli.ts: remove invalid viewport option"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
          durationMs: estimateDurationMs(result.telemetry),
          fps: Number(opts.fps),
          telemetry: result.telemetry,
          viewport: result.telemetry.viewport,
          smoothingFactor: 0.3,
          usePolish: opts.polish !== false,
EOF
cat > "$NEW_TMP" << 'EOF'
          durationMs: estimateDurationMs(result.telemetry),
          fps: Number(opts.fps),
          telemetry: result.telemetry,
          smoothingFactor: 0.3,
          usePolish: opts.polish !== false,
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/cli.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: viewport option block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for src/cli.ts"
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
  git commit -m "docs: complete README, quickstart example, and ADR-0001..0004"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
