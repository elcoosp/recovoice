#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Fixing src/polish/frame-scheduler.ts: use rounded frame count to avoid FP off-by-one"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  const frameIntervalMs = 1000 / fps;
  const totalFrames = Math.floor(durationMs / frameIntervalMs);
EOF
cat > "$NEW_TMP" << 'EOF'
  const frameIntervalMs = 1000 / fps;
  const totalFrames = Math.round((durationMs * fps) / 1000);
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/polish/frame-scheduler.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: frame count block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 1 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 1 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Fixing src/polish/camera-state.ts: cap zoom-in duration at half the region duration"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
function computeActiveScale(region: ZoomRegion, tMs: number): number {
  const elapsed = tMs - region.startMs;
  if (elapsed >= ZOOM_IN_DURATION_MS) return region.depth;
  const t = elapsed / ZOOM_IN_DURATION_MS;
  const progress = easeInOutCubic(t);
  return 1 + (region.depth - 1) * progress;
}
EOF
cat > "$NEW_TMP" << 'EOF'
function computeActiveScale(region: ZoomRegion, tMs: number): number {
  const elapsed = tMs - region.startMs;
  const regionDuration = region.endMs - region.startMs;
  const zoomInDuration = Math.min(
    ZOOM_IN_DURATION_MS,
    Math.max(1, regionDuration / 2),
  );
  if (elapsed >= zoomInDuration) return region.depth;
  const t = elapsed / zoomInDuration;
  const progress = easeInOutCubic(t);
  return 1 + (region.depth - 1) * progress;
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/polish/camera-state.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: computeActiveScale block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 2 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 2 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Fixing test/polish/pipeline.test.ts: use a fixture with a proper 900ms dwell"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 300, x: 100, y: 100, type: 'move' },
        { t: 500, x: 100, y: 100, type: 'move' },
        { t: 900, x: 500, y: 400, type: 'move' },
      ]),
      { autoZoom: { defaultDepth: 3 } },
    );
    expect(analysis.zoomRegions[0]!.depth).toBe(3);
EOF
cat > "$NEW_TMP" << 'EOF'
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 400, x: 100, y: 100, type: 'move' },
        { t: 900, x: 100, y: 100, type: 'move' },
        { t: 1200, x: 500, y: 400, type: 'move' },
      ]),
      { autoZoom: { defaultDepth: 3 } },
    );
    expect(analysis.zoomRegions.length).toBeGreaterThanOrEqual(1);
    expect(analysis.zoomRegions[0]!.depth).toBe(3);
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" test/polish/pipeline.test.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: pipeline fixture not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 3 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 3 failed"
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
  git commit -m "fix(polish): round frame count to avoid FP off-by-one; cap zoom-in at half region duration; fix pipeline fixture"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
