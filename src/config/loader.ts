import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { Frontmatter } from '../types/script.js';

export interface LoadedConfig {
  config: Partial<Frontmatter>;
  path?: string;
}

const CANDIDATE_FILENAMES = [
  'recovoice.config.js',
  'recovoice.config.mjs',
  'recovoice.config.cjs',
  'recovoice.config.ts',
];

export async function loadConfig(
  cwd: string = process.cwd(),
  explicitPath?: string,
): Promise<LoadedConfig> {
  const path = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : resolve(cwd, explicitPath)
    : findConfigFile(cwd);

  if (!path) return { config: {} };
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const imported = await import(/* @vite-ignore */ path);
  const raw = (imported.default ?? imported) as unknown;
  if (!isPlainObject(raw)) {
    throw new Error(`Config file must export a plain object: ${path}`);
  }
  return { config: raw as Partial<Frontmatter>, path };
}

function findConfigFile(cwd: string): string | undefined {
  for (const name of CANDIDATE_FILENAMES) {
    const candidate = resolve(cwd, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function isPlainObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export interface MergeConfigSources {
  frontmatter: Partial<Frontmatter>;
  file?: Partial<Frontmatter>;
  cli?: Partial<Frontmatter>;
}

/**
 * Merge configuration sources with the following precedence (highest first):
 *   1. CLI flags
 *   2. Config file
 *   3. Frontmatter
 */
export function mergeConfig(sources: MergeConfigSources): Frontmatter {
  return deepMerge(
    deepMerge(sources.frontmatter, sources.file ?? {}),
    sources.cli ?? {},
  );
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(
    override as Record<string, unknown>,
  )) {
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }
  return out as T;
}
