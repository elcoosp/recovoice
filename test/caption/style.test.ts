import { describe, it, expect } from 'vitest';
import {
  buildFFmpegSubtitleStyle,
  hexToAssColor,
  rgbaToAssColor,
} from '../../src/caption/style.js';

describe('hexToAssColor', () => {
  it('converts #ffffff to opaque white', () => {
    expect(hexToAssColor('#ffffff')).toBe('&H00FFFFFF');
  });

  it('converts #000000 to opaque black', () => {
    expect(hexToAssColor('#000000')).toBe('&H00000000');
  });

  it('expands 3-char hex', () => {
    expect(hexToAssColor('#fff')).toBe('&H00FFFFFF');
  });

  it('handles 8-char hex with alpha', () => {
    const result = hexToAssColor('#ff000080');
    // ASS alpha inverted: 0x80 alpha -> 0x7f in ASS
    expect(result).toMatch(/^&H7F/);
  });
});

describe('rgbaToAssColor', () => {
  it('handles rgba with 0.5 alpha', () => {
    const result = rgbaToAssColor('rgba(0,0,0,0.5)');
    // ASS alpha inverted: 0.5 -> 0x80
    expect(result).toBe('&H80000000');
  });

  it('handles rgb without alpha (opaque)', () => {
    expect(rgbaToAssColor('rgb(255,255,255)')).toBe('&H00FFFFFF');
  });

  it('falls back to opaque black for unrecognized input', () => {
    expect(rgbaToAssColor('not a color')).toBe('&H00000000');
  });

  it('delegates hex input', () => {
    expect(rgbaToAssColor('#ffffff')).toBe('&H00FFFFFF');
  });
});

describe('buildFFmpegSubtitleStyle', () => {
  it('produces a complete style string with defaults', () => {
    const style = buildFFmpegSubtitleStyle(undefined);
    expect(style).toContain('FontName=Inter');
    expect(style).toContain('FontSize=22');
    expect(style).toContain('PrimaryColour=&H00FFFFFF');
    expect(style).toContain('Alignment=2');
    expect(style).toContain('BorderStyle=4');
  });

  it('respects a custom style', () => {
    const style = buildFFmpegSubtitleStyle({
      font: 'Roboto',
      size: 18,
      color: '#ff0000',
      position: 'top',
    });
    expect(style).toContain('FontName=Roboto');
    expect(style).toContain('FontSize=18');
    expect(style).toContain('PrimaryColour=&H000000FF');
    expect(style).toContain('Alignment=8');
  });

  it('maps position: center to Alignment=5', () => {
    const style = buildFFmpegSubtitleStyle({ position: 'center' });
    expect(style).toContain('Alignment=5');
  });
});
