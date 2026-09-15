import type {
  CursorTelemetry,
  PolishConfig,
  ZoomRegion,
  ConnectedTransition,
} from '../types/recording.js';
import { analyzeZoomRegions, type AutoZoomConfig } from './auto-zoom.js';
import { findConnectedTransitions } from './connected-transitions.js';

export interface PolishAnalysis {
  zoomRegions: ZoomRegion[];
  transitions: ConnectedTransition[];
}

export function analyzePolishing(
  telemetry: CursorTelemetry,
  config: PolishConfig,
): PolishAnalysis {
  const autoZoom = config.autoZoom;

  if (autoZoom === false) {
    return { zoomRegions: [], transitions: [] };
  }

  const autoZoomConfig: AutoZoomConfig =
    typeof autoZoom === 'object' && autoZoom !== null ? autoZoom : {};

  const zoomRegions = analyzeZoomRegions(telemetry, autoZoomConfig);

  const transitions =
    config.connectedTransitions === false
      ? []
      : findConnectedTransitions(zoomRegions);

  return { zoomRegions, transitions };
}
