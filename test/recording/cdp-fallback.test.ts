import { describe, it, expect } from 'vitest';
import { platform } from 'node:os';
import {
  checkCdpAvailability,
  describeCdpEndpoint,
} from '../../src/recording/cdp-fallback.js';

describe('checkCdpAvailability', () => {
  it('reports availability matching the platform', () => {
    const result = checkCdpAvailability();
    if (platform() === 'win32') {
      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    } else {
      expect(result.available).toBe(false);
      expect(result.reason).toContain(platform());
    }
  });
});

describe('describeCdpEndpoint', () => {
  it('returns undefined on non-Windows platforms', () => {
    if (platform() === 'win32') return;
    expect(describeCdpEndpoint({})).toBeUndefined();
  });

  it('uses the default port when none is given', () => {
    if (platform() !== 'win32') return;
    const result = describeCdpEndpoint({});
    expect(result?.wsEndpoint).toContain(':9222');
  });

  it('uses the custom port when provided', () => {
    if (platform() !== 'win32') return;
    const result = describeCdpEndpoint({ debuggingPort: 9999 });
    expect(result?.wsEndpoint).toContain(':9999');
  });
});
