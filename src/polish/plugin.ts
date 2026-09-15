import type {
  CursorTelemetry,
  ZoomRegion,
  ConnectedTransition,
} from '../types/recording.js';
import type { CameraState } from './camera-state.js';
import type { CursorFrameState } from './cursor-state.js';

/**
 * Interface for custom polish effects. A plugin receives the analysis phase
 * outputs and per-frame state, and may adjust either.
 *
 * Plugins run in order. Each plugin can mutate the camera and cursor state
 * passed to it, and can contribute additional zoom regions/transitions
 * during analysis.
 */
export interface PolishPlugin {
  /** Stable identifier for logging and debugging. */
  name: string;

  /**
   * Called once before frame generation. Plugins may return additional zoom
   * regions and connected transitions to blend into the analysis.
   */
  analyze?(input: {
    telemetry: CursorTelemetry;
    zoomRegions: ZoomRegion[];
    transitions: ConnectedTransition[];
  }): {
    zoomRegions?: ZoomRegion[];
    transitions?: ConnectedTransition[];
  };

  /**
   * Called per-frame. The plugin may mutate `camera` and `cursor` in place.
   * Return values are ignored.
   */
  transformFrame?(frame: {
    tMs: number;
    camera: CameraState;
    cursor: CursorFrameState;
  }): void;
}

export interface PolishRegistry {
  register(plugin: PolishPlugin): void;
  list(): PolishPlugin[];
  clear(): void;
}

export function createPolishRegistry(): PolishRegistry {
  const plugins: PolishPlugin[] = [];
  return {
    register(plugin) {
      if (plugins.some((p) => p.name === plugin.name)) {
        throw new Error(`Polish plugin already registered: ${plugin.name}`);
      }
      plugins.push(plugin);
    },
    list() {
      return [...plugins];
    },
    clear() {
      plugins.length = 0;
    },
  };
}

export interface ApplyAnalyzeResult {
  zoomRegions: ZoomRegion[];
  transitions: ConnectedTransition[];
}

/**
 * Run all plugins' analyze hooks, merging their contributions into the
 * analysis result. Plugins may add regions/transitions but not remove them.
 */
export function runAnalyzeHooks(
  plugins: PolishPlugin[],
  input: ApplyAnalyzeResult & { telemetry: CursorTelemetry },
): ApplyAnalyzeResult {
  let zoomRegions = [...input.zoomRegions];
  let transitions = [...input.transitions];

  for (const plugin of plugins) {
    if (!plugin.analyze) continue;
    const out = plugin.analyze({
      telemetry: input.telemetry,
      zoomRegions,
      transitions,
    });
    if (out.zoomRegions) zoomRegions = [...zoomRegions, ...out.zoomRegions];
    if (out.transitions) transitions = [...transitions, ...out.transitions];
  }

  return { zoomRegions, transitions };
}

/**
 * Run all plugins' transformFrame hooks in order, allowing each to mutate
 * the camera/cursor state before the frame is rendered.
 */
export function runTransformHooks(
  plugins: PolishPlugin[],
  frame: {
    tMs: number;
    camera: CameraState;
    cursor: CursorFrameState;
  },
): void {
  for (const plugin of plugins) {
    plugin.transformFrame?.(frame);
  }
}
