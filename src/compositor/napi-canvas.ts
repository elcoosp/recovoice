import type { CanvasLike } from './canvas-types.js';

let cachedModule: unknown = null;
let cachedError: Error | null = null;

function loadModule(): unknown {
  if (cachedModule) return cachedModule;
  if (cachedError) throw cachedError;
  try {
    const req = require('node:module').createRequire(import.meta.url);
    cachedModule = req('@napi-rs/canvas');
    return cachedModule;
  } catch (err) {
    cachedError = new Error(
      `@napi-rs/canvas is required for real compositing. Install it with: pnpm add @napi-rs/canvas. Underlying error: ${(err as Error).message}`,
    );
    throw cachedError;
  }
}

export function isNapiCanvasAvailable(): boolean {
  try {
    loadModule();
    return true;
  } catch {
    return false;
  }
}

interface NapiCanvasModule {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(source: Buffer | Uint8Array): Promise<unknown>;
}

export function createNapiCanvas(width: number, height: number): CanvasLike {
  const mod = loadModule() as NapiCanvasModule;
  return mod.createCanvas(width, height);
}

export async function loadImage(
  source: Buffer | Uint8Array,
): Promise<unknown> {
  const mod = loadModule() as NapiCanvasModule;
  return mod.loadImage(source);
}
