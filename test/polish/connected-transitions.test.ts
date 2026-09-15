import { describe, it, expect } from 'vitest';
import {
  findConnectedTransitions,
  CHAINED_ZOOM_PAN_GAP_MS,
  CONNECTED_ZOOM_PAN_DURATION_MS,
} from '../../src/polish/connected-transitions.js';
import type { ZoomRegion } from '../../src/types/recording.js';

function region(
  id: string,
  startMs: number,
  endMs: number,
  cx: number,
  cy: number,
): ZoomRegion {
  return { id, startMs, endMs, focus: { cx, cy }, depth: 1.5 };
}

describe('findConnectedTransitions', () => {
  it('returns empty array for fewer than two regions', () => {
    expect(findConnectedTransitions([])).toEqual([]);
    expect(findConnectedTransitions([region('a', 0, 1000, 100, 100)])).toEqual(
      [],
    );
  });

  it('returns empty array when regions are far apart', () => {
    const regions = [
      region('a', 0, 1000, 100, 100),
      region('b', 5000, 6000, 900, 600),
    ];
    expect(findConnectedTransitions(regions)).toEqual([]);
  });

  it('creates a connected transition when gap is below threshold', () => {
    const regions = [
      region('a', 0, 1000, 100, 100),
      region('b', 2000, 3000, 900, 600),
    ];
    const transitions = findConnectedTransitions(regions);
    expect(transitions).toHaveLength(1);
    const t = transitions[0]!;
    expect(t.fromRegion.id).toBe('a');
    expect(t.toRegion.id).toBe('b');
    expect(t.panStartMs).toBe(1000);
    expect(t.panEndMs).toBe(1000 + CONNECTED_ZOOM_PAN_DURATION_MS);
  });

  it('does not create a transition when gap equals threshold', () => {
    const regions = [
      region('a', 0, 1000, 100, 100),
      region('b', 1000 + CHAINED_ZOOM_PAN_GAP_MS, 3000, 900, 600),
    ];
    expect(findConnectedTransitions(regions)).toEqual([]);
  });

  it('creates multiple transitions for a chain of regions', () => {
    const regions = [
      region('a', 0, 1000, 100, 100),
      region('b', 2000, 3000, 400, 300),
      region('c', 4000, 5000, 900, 600),
    ];
    const transitions = findConnectedTransitions(regions);
    expect(transitions).toHaveLength(2);
    expect(transitions[0]!.fromRegion.id).toBe('a');
    expect(transitions[0]!.toRegion.id).toBe('b');
    expect(transitions[1]!.fromRegion.id).toBe('b');
    expect(transitions[1]!.toRegion.id).toBe('c');
  });

  it('sorts regions by start time before analysis', () => {
    const regions = [
      region('b', 2000, 3000, 900, 600),
      region('a', 0, 1000, 100, 100),
    ];
    const transitions = findConnectedTransitions(regions);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.fromRegion.id).toBe('a');
    expect(transitions[0]!.toRegion.id).toBe('b');
  });
});
