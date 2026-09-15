#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Inspecting current state of src/caption/style.ts"
python3 - << 'PYEOF'
with open('src/caption/style.ts', 'r') as f:
    content = f.read()

# Show the hexToAssColor function body
import re
m = re.search(r'export function hexToAssColor[\s\S]*?\n}\n', content)
if m:
    print("=== hexToAssColor ===")
    print(m.group(0))
else:
    print("hexToAssColor not found")

m2 = re.search(r'export function rgbaToAssColor[\s\S]*?\n}\n', content)
if m2:
    print("=== rgbaToAssColor ===")
    print(m2.group(0))
PYEOF

echo "Rewriting src/caption/style.ts cleanly"
cat > src/caption/style.ts << 'EOF'
import type { CaptionStyle } from '../types/script.js';

export interface FFmpegSubtitleStyleOptions {
  font?: string;
  size?: number;
  color?: string;
  background?: string;
  position?: 'top' | 'bottom' | 'center';
}

export function buildFFmpegSubtitleStyle(
  style: CaptionStyle | undefined,
): string {
  const parts: string[] = [];

  const font = style?.font ?? 'Inter';
  parts.push(`FontName=${font}`);

  const size = style?.size ?? 22;
  parts.push(`FontSize=${Math.round(size)}`);

  const color = style?.color ?? '#ffffff';
  parts.push(`PrimaryColour=${hexToAssColor(color)}`);

  const background = style?.background ?? 'rgba(0,0,0,0.75)';
  parts.push(`BackColour=${rgbaToAssColor(background)}`);
  parts.push('BorderStyle=4');
  parts.push('Outline=0');
  parts.push('Shadow=0');

  const position = style?.position ?? 'bottom';
  switch (position) {
    case 'top':
      parts.push('Alignment=8');
      break;
    case 'center':
      parts.push('Alignment=5');
      break;
    case 'bottom':
    default:
      parts.push('Alignment=2');
      break;
  }

  parts.push('MarginV=40');

  return parts.join(',');
}

export function hexToAssColor(hex: string): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;

  const cleaned = hex.replace(/^#/, '');
  if (cleaned.length === 3) {
    r = parseInt(cleaned[0]! + cleaned[0]!, 16);
    g = parseInt(cleaned[1]! + cleaned[1]!, 16);
    b = parseInt(cleaned[2]! + cleaned[2]!, 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else if (cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
    a = parseInt(cleaned.slice(6, 8), 16);
  }

  const assAlpha = 255 - a;
  return `&H${toHex2(assAlpha)}${toHex2(b)}${toHex2(g)}${toHex2(r)}`;
}

export function rgbaToAssColor(rgba: string): string {
  const trimmed = rgba.trim();
  if (trimmed.startsWith('#')) return hexToAssColor(trimmed);

  const match = trimmed.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!match) return '&H00000000';

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const alpha = match[4] !== undefined ? Number(match[4]) : 1;

  const assAlpha = Math.round((1 - alpha) * 255);
  return `&H${toHex2(assAlpha)}${toHex2(b)}${toHex2(g)}${toHex2(r)}`;
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, n))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}
EOF

echo "Rewriting test/compositor/frame-renderer-wallpaper.test.ts"
cat > test/compositor/frame-renderer-wallpaper.test.ts << 'TESTEOF'
import { describe, it, expect } from 'vitest';
import {
  renderFrame,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_FRAME_CONFIG,
} from '../../src/compositor/frame-renderer.js';
import type {
  CanvasLike,
  CanvasGradientLike,
} from '../../src/compositor/canvas-types.js';

interface Call {
  method: string;
  args: unknown[];
}

function makeMockCanvas(width: number, height: number): {
  canvas: CanvasLike;
  calls: Call[];
  filterLog: string[];
} {
  const calls: Call[] = [];
  const filterLog: string[] = [];
  const gradient: CanvasGradientLike = { addColorStop: () => undefined };
  let filterValue = 'none';

  const ctx = {
    save: () => calls.push({ method: 'save', args: [] }),
    restore: () => calls.push({ method: 'restore', args: [] }),
    translate: (...a: unknown[]) => calls.push({ method: 'translate', args: a }),
    scale: (...a: unknown[]) => calls.push({ method: 'scale', args: a }),
    rotate: (...a: unknown[]) => calls.push({ method: 'rotate', args: a }),
    clearRect: (...a: unknown[]) => calls.push({ method: 'clearRect', args: a }),
    fillRect: (...a: unknown[]) => calls.push({ method: 'fillRect', args: a }),
    strokeRect: (...a: unknown[]) => calls.push({ method: 'strokeRect', args: a }),
    drawImage: (...a: unknown[]) => calls.push({ method: 'drawImage', args: a }),
    beginPath: () => calls.push({ method: 'beginPath', args: [] }),
    moveTo: (...a: unknown[]) => calls.push({ method: 'moveTo', args: a }),
    lineTo: (...a: unknown[]) => calls.push({ method: 'lineTo', args: a }),
    quadraticCurveTo: (...a: unknown[]) =>
      calls.push({ method: 'quadraticCurveTo', args: a }),
    closePath: () => calls.push({ method: 'closePath', args: [] }),
    arc: (...a: unknown[]) => calls.push({ method: 'arc', args: a }),
    fill: () => calls.push({ method: 'fill', args: [] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    get filter() {
      return filterValue;
    },
    set filter(v: string) {
      filterValue = v;
      filterLog.push(v);
    },
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  return {
    canvas: { width, height, getContext: () => ctx },
    calls,
    filterLog,
  };
}

const baseInput = {
  video: {},
  videoWidth: 1280,
  videoHeight: 800,
  camera: { scale: 1, translateX: 0, translateY: 0 },
  cursor: {
    visible: false,
    x: 0,
    y: 0,
    rotation: 0,
    ghostCount: 0,
    clickPulse: 0,
  },
  frame: DEFAULT_FRAME_CONFIG,
  cursorStyle: DEFAULT_CURSOR_STYLE,
};

describe('renderFrame wallpaper', () => {
  it('draws the wallpaper when provided', () => {
    const { canvas, calls } = makeMockCanvas(1920, 1080);
    const wallpaper = { tag: 'wp' };
    renderFrame(canvas, {
      ...baseInput,
      background: { type: 'wallpaper' },
      wallpaper,
    });
    const drawCalls = calls.filter((c) => c.method === 'drawImage');
    expect(drawCalls.length).toBeGreaterThanOrEqual(2);
    expect(drawCalls[0]!.args[0]).toEqual(wallpaper);
  });

  it('applies a blur filter in blur mode', () => {
    const { canvas, filterLog } = makeMockCanvas(1920, 1080);
    renderFrame(canvas, {
      ...baseInput,
      background: { type: 'blur' },
      wallpaper: { tag: 'wp' },
    });
    expect(filterLog.some((f) => f.startsWith('blur('))).toBe(true);
  });

  it('falls back to solid color when wallpaper is missing', () => {
    const { canvas, calls } = makeMockCanvas(1920, 1080);
    renderFrame(canvas, {
      ...baseInput,
      background: { type: 'wallpaper', value: '#123456' },
    });
    const fillCalls = calls.filter((c) => c.method === 'fillRect');
    expect(fillCalls.length).toBeGreaterThan(0);
  });
});
TESTEOF

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running targeted tests"
if pnpm exec vitest run test/caption/style.test.ts test/compositor/frame-renderer-wallpaper.test.ts 2>&1; then
  echo "Targeted tests passed. Running full suite."
  if pnpm exec vitest run 2>&1; then
    echo "All tests passed. Committing."
    git add -A
    git commit -m "fix(caption,compositor): invert ASS alpha; rewrite wallpaper test with proper filter tracking"
  else
    echo "Full suite failed. Fix errors then run the next script."
    exit 1
  fi
else
  echo "Targeted tests failed. Fix errors then run the next script."
  exit 1
fi
