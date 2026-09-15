#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Inspecting cursor-state.ts computeAt body"
python3 - << 'PYEOF'
with open('src/polish/cursor-state.ts', 'r') as f:
    content = f.read()

idx = content.find('computeAt(')
idx2 = content.find('private computeClickPulse')
if idx >= 0 and idx2 > idx:
    print(content[idx:idx2])
else:
    print("computeAt or computeClickPulse not found")
PYEOF

echo "Applying disableSmoothing shortcut with explicit block match"
python3 - << 'PYEOF'
path = 'src/polish/cursor-state.ts'
with open(path, 'r') as f:
    content = f.read()

# Match the section from "const latest" up to just before "const currentX"
old_pattern = """    const latest = before[before.length - 1]!;
    this.springX.setTarget(latest.x);
    this.springY.setTarget(latest.y);

    const dtSec = Math.max(1e-6, (tMs - this.lastT) / 1000);"""

new_pattern = """    const latest = before[before.length - 1]!;

    if (this.opts.disableSmoothing) {
      const rawX = latest.x;
      const rawY = latest.y;
      const dtRaw = Math.max(1e-6, (tMs - this.lastT) / 1000);
      const velX = (rawX - this.lastX) / dtRaw;
      const velY = (rawY - this.lastY) / dtRaw;
      const rawSpeed = Math.sqrt(velX * velX + velY * velY);

      const rotation = this.opts.disableSway
        ? 0
        : computeSwayAngle(velX, velY);
      const ghostCount = this.opts.disableMotionBlur
        ? 0
        : computeCursorGhostCount(rawSpeed);
      const clickPulse = this.opts.disableClickPulse
        ? 0
        : this.computeClickPulse(tMs);

      this.lastX = rawX;
      this.lastY = rawY;
      this.lastT = tMs;

      return {
        visible: true,
        x: rawX,
        y: rawY,
        rotation,
        ghostCount,
        clickPulse,
      };
    }

    this.springX.setTarget(latest.x);
    this.springY.setTarget(latest.y);

    const dtSec = Math.max(1e-6, (tMs - this.lastT) / 1000);"""

if old_pattern not in content:
    print("ERROR: pattern not found")
    print("Looking for variants...")
    # Try without the "const dtSec" line
    old_v2 = """    const latest = before[before.length - 1]!;
    this.springX.setTarget(latest.x);
    this.springY.setTarget(latest.y);"""
    if old_v2 in content:
        print("Found variant without dtSec line — patching that instead")
        new_v2 = """    const latest = before[before.length - 1]!;

    if (this.opts.disableSmoothing) {
      const rawX = latest.x;
      const rawY = latest.y;
      const dtRaw = Math.max(1e-6, (tMs - this.lastT) / 1000);
      const velX = (rawX - this.lastX) / dtRaw;
      const velY = (rawY - this.lastY) / dtRaw;
      const rawSpeed = Math.sqrt(velX * velX + velY * velY);

      const rotation = this.opts.disableSway
        ? 0
        : computeSwayAngle(velX, velY);
      const ghostCount = this.opts.disableMotionBlur
        ? 0
        : computeCursorGhostCount(rawSpeed);
      const clickPulse = this.opts.disableClickPulse
        ? 0
        : this.computeClickPulse(tMs);

      this.lastX = rawX;
      this.lastY = rawY;
      this.lastT = tMs;

      return {
        visible: true,
        x: rawX,
        y: rawY,
        rotation,
        ghostCount,
        clickPulse,
      };
    }

    this.springX.setTarget(latest.x);
    this.springY.setTarget(latest.y);"""
        content = content.replace(old_v2, new_v2, 1)
        with open(path, 'w') as f:
            f.write(content)
        print("Applied with variant pattern")
    else:
        raise SystemExit(1)
else:
    content = content.replace(old_pattern, new_pattern, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("Applied with primary pattern")
PYEOF

echo "Verifying the patch"
python3 - << 'PYEOF'
with open('src/polish/cursor-state.ts', 'r') as f:
    content = f.read()
if 'this.opts.disableSmoothing' in content:
    print("OK: this.opts.disableSmoothing is present")
else:
    print("ERROR: patch not present")
    raise SystemExit(1)
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

echo "Running disable-smoothing tests only"
if pnpm exec vitest run test/polish/disable-smoothing.test.ts 2>&1; then
  echo "Targeted tests passed. Running full suite."
  if pnpm exec vitest run 2>&1; then
    echo "All tests passed. Committing."
    git add -A
    git commit -m "feat(polish,recording): cursorSmoothing: false fully disables spring smoothing; voiceoverOnly CLI integration tests"
  else
    echo "Full suite failed. Fix errors then run the next script."
    exit 1
  fi
else
  echo "Targeted tests failed. Fix errors then run the next script."
  exit 1
fi
