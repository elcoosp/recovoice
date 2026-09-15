#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Cleaning malformed sleep injections in test/recording/orchestrator.test.ts"
python3 - << 'PYEOF'
import re
path = 'test/recording/orchestrator.test.ts'
with open(path, 'r') as f:
    content = f.read()

# Remove any stray leading comma forms: ", sleep: noopSleep })" -> " })"
content = content.replace(', sleep: noopSleep }', ' }')

# Add sleep: noopSleep as a final property cleanly by matching each
# "new Recovoice({ ... })" block and inserting sleep before the closing paren.
# We do it by finding `new Recovoice({` and inserting `sleep: noopSleep, ` at
# the start of the option list instead — safer than matching the closing.
content = content.replace(
    'new Recovoice({\n',
    'new Recovoice({\n      sleep: noopSleep,\n'
)
# Handle single-line form as well
content = re.sub(
    r'new Recovoice\(\{ script: ([^}]+?)\}\)',
    lambda m: f'new Recovoice({{ sleep: noopSleep, script: {m.group(1)} }})',
    content,
)

with open(path, 'w') as f:
    f.write(content)
print("Rewrote orchestrator.test.ts")
PYEOF

echo "Cleaning malformed sleep injections in test/integration/e2e.test.ts"
python3 - << 'PYEOF'
import re
path = 'test/integration/e2e.test.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace(', sleep: noopSleep }', ' }')

content = content.replace(
    'new Recovoice({\n',
    'new Recovoice({\n      sleep: noopSleep,\n'
)
content = re.sub(
    r'new Recovoice\(\{ script: ([^}]+?)\}\)',
    lambda m: f'new Recovoice({{ sleep: noopSleep, script: {m.group(1)} }})',
    content,
)

with open(path, 'w') as f:
    f.write(content)
print("Rewrote integration/e2e.test.ts")
PYEOF

echo "Verifying no stray leading commas remain"
python3 - << 'PYEOF'
import re
for path in ['test/recording/orchestrator.test.ts', 'test/integration/e2e.test.ts']:
    with open(path, 'r') as f:
        content = f.read()
    if re.search(r',\s*,', content):
        print(f"WARNING: double comma still present in {path}")
    if ', sleep: noopSleep })' in content:
        print(f"WARNING: stray sleep injection still present in {path}")
    if 'new Recovoice({\n      sleep: noopSleep,\n' in content:
        print(f"OK: {path} has clean sleep injection")
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
  git commit -m "fix(test): clean up malformed sleep injections in orchestrator and e2e test files"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
