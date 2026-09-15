#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing tsconfig.json: add DOM lib so browser globals are available for injected scripts"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
    "lib": ["ES2022"],
EOF
cat > "$NEW_TMP" << 'EOF'
    "lib": ["ES2022", "DOM"],
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" tsconfig.json << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: lib line not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for tsconfig.json"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Fixing src/recording/tauri-playwright-adapter.ts: type event listener params"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
    window.addEventListener('mousemove', (e) => push('move', e));
    window.addEventListener('mousedown', (e) => push('click', e));
    window.addEventListener('wheel', (e) => push('scroll', e));
EOF
cat > "$NEW_TMP" << 'EOF'
    window.addEventListener('mousemove', (e: MouseEvent) => push('move', e));
    window.addEventListener('mousedown', (e: MouseEvent) => push('click', e));
    window.addEventListener('wheel', (e: WheelEvent) => push('scroll', e));
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/recording/tauri-playwright-adapter.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: addEventListener block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch succeeded for src/recording/tauri-playwright-adapter.ts"
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
  git commit -m "fix(recording): include DOM lib and type browser event listeners in injected telemetry script"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
