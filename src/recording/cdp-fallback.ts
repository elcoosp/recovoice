import { platform } from 'node:os';

export interface CdpAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Determine whether CDP screencast fallback is available on this platform.
 * WebView2 (Windows) exposes CDP. macOS WKWebView and Linux WebKitGTK do not.
 */
export function checkCdpAvailability(): CdpAvailability {
  if (platform() === 'win32') {
    return { available: true };
  }
  return {
    available: false,
    reason: `CDP screencast fallback is Windows-only. Current platform: ${platform()}`,
  };
}

export interface CdpLaunchOptions {
  debuggingPort?: number;
}

export interface CdpLaunchResult {
  wsEndpoint: string;
}

/**
 * Attempt to locate a WebView2 CDP endpoint. This is a discovery helper; the
 * actual connection is done by the caller (e.g., via playwright.chromium.
 * connectOverCDP or puppeteer.connect). If no debugger port was configured,
 * this returns undefined and the caller should fall back to native recording.
 */
export function describeCdpEndpoint(
  options: CdpLaunchOptions,
): CdpLaunchResult | undefined {
  const availability = checkCdpAvailability();
  if (!availability.available) return undefined;
  const port = options.debuggingPort ?? 9222;
  return { wsEndpoint: `http://127.0.0.1:${port}` };
}
