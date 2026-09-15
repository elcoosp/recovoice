#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Removing stale ImageDataLike re-export"
python3 - << 'PYEOF'
path = 'src/compositor/polish-compositor.ts'
with open(path, 'r') as f:
    content = f.read()
old = "export type { ImageDataLike };"
if old in content:
    content = content.replace(old, "", 1)
    with open(path, 'w') as f:
        f.write(content)
    print("Removed stale re-export")
else:
    print("Not found; no-op")
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
  git commit -m "feat(parser,polish): zod frontmatter schema validation; custom polish plugin interface"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
