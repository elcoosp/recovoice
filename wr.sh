#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing src/parser/parser.ts: substitute variables inside action arguments"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  const name = match[1]!;
  const argsString = (match[2] ?? '').trim();
  let args: unknown[];
  try {
    args = evaluateArgs(argsString);
  } catch (err) {
    throw new ParseError(
      `Invalid arguments in action "${name}": ${(err as Error).message}`,
      lineNum,
    );
  }
  return { name, args, sourceLine: lineNum };
}
EOF
cat > "$NEW_TMP" << 'EOF'
  const name = match[1]!;
  const argsString = (match[2] ?? '').trim();
  let args: unknown[];
  try {
    args = evaluateArgs(argsString, variables, lineNum);
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      `Invalid arguments in action "${name}": ${(err as Error).message}`,
      lineNum,
    );
  }
  return { name, args, sourceLine: lineNum };
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/parser/parser.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old block not found in parser.ts")
    sys.exit(1)
content = content.replace(old, new)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 1 succeeded for src/parser/parser.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 1 failed for src/parser/parser.ts"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Patching src/parser/parser.ts: pass variables through parseActionLine"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
      pendingActions.push(
        parseActionLine(actionMatch[1]!, lineNum),
      );
EOF
cat > "$NEW_TMP" << 'EOF'
      pendingActions.push(
        parseActionLine(actionMatch[1]!, lineNum, variables),
      );
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/parser/parser.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old block not found in parser.ts")
    sys.exit(1)
content = content.replace(old, new)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 2 succeeded for src/parser/parser.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 2 failed for src/parser/parser.ts"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Patching src/parser/parser.ts: update parseActionLine signature"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
function parseActionLine(rawCall: string, lineNum: number): Action {
  const call = rawCall.trim();
EOF
cat > "$NEW_TMP" << 'EOF'
function parseActionLine(
  rawCall: string,
  lineNum: number,
  variables: VariableMap,
): Action {
  const call = rawCall.trim();
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/parser/parser.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old block not found in parser.ts")
    sys.exit(1)
content = content.replace(old, new)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 3 succeeded for src/parser/parser.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 3 failed for src/parser/parser.ts"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Patching src/parser/parser.ts: substitute variables in evaluated args"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
function evaluateArgs(argsString: string): unknown[] {
  if (argsString === '') return [];
  const fn = new Function(`"use strict"; return [${argsString}];`);
  return fn() as unknown[];
}
EOF
cat > "$NEW_TMP" << 'EOF'
function evaluateArgs(
  argsString: string,
  variables: VariableMap,
  line: number,
): unknown[] {
  if (argsString === '') return [];
  const substituted = substituteVariables(argsString, variables, line);
  const fn = new Function(`"use strict"; return [${substituted}];`);
  return fn() as unknown[];
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/parser/parser.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: old block not found in parser.ts")
    sys.exit(1)
content = content.replace(old, new)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 4 succeeded for src/parser/parser.ts"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 4 failed for src/parser/parser.ts"
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
  git commit -m "fix(parser): substitute variables inside action arguments"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
