#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing src/polish/motion-blur.ts: primary ghost gets base alpha"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export function computeCursorGhostAlpha(
  ghostIndex: number,
  totalGhosts: number,
): number {
  if (ghostIndex < 1 || ghostIndex > MAX_CURSOR_GHOSTS) return 0;
  if (totalGhosts <= 0) return 0;
  const t = ghostIndex / totalGhosts;
  return CURSOR_GHOST_BASE_ALPHA * (1 - t);
}
EOF
cat > "$NEW_TMP" << 'EOF'
export function computeCursorGhostAlpha(
  ghostIndex: number,
  totalGhosts: number,
): number {
  if (ghostIndex < 1 || ghostIndex > MAX_CURSOR_GHOSTS) return 0;
  if (totalGhosts <= 0) return 0;
  const t = (ghostIndex - 1) / totalGhosts;
  return CURSOR_GHOST_BASE_ALPHA * (1 - t);
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/polish/motion-blur.ts << 'PYEOF'
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
  echo "Python patch succeeded for src/polish/motion-blur.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch failed for src/polish/motion-blur.ts"
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
  git commit -m "fix(polish): primary cursor ghost should carry base alpha"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
