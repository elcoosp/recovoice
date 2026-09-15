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
