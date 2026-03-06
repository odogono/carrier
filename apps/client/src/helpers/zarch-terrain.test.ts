/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  GRID,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  generateTerrainHeights,
  getTileAverageHeightFromHeights,
  getTreeType,
  isWaterTileFromHeights,
  sampleHeightFromHeights,
  tileHash,
  toroidalIndex
} from '@/helpers/zarch-terrain';

describe('zarch terrain helpers', () => {
  test('toroidalIndex wraps coordinates across the grid', () => {
    expect(toroidalIndex(-1, -1)).toBe(toroidalIndex(GRID - 1, GRID - 1));
    expect(toroidalIndex(GRID, GRID)).toBe(toroidalIndex(0, 0));
  });

  test('sampleHeightFromHeights uses toroidal addressing', () => {
    const heights = new Float32Array(GRID * GRID);
    heights[toroidalIndex(GRID - 1, GRID - 1)] = 42;

    expect(sampleHeightFromHeights(heights, -1, -1)).toBe(42);
    expect(sampleHeightFromHeights(heights, GRID - 1, GRID - 1)).toBe(42);
  });

  test('getTileAverageHeightFromHeights averages the four corners', () => {
    const heights = new Float32Array(GRID * GRID);
    heights[toroidalIndex(0, 0)] = 10;
    heights[toroidalIndex(1, 0)] = 14;
    heights[toroidalIndex(0, 1)] = 18;
    heights[toroidalIndex(1, 1)] = 22;

    expect(getTileAverageHeightFromHeights(heights, 0, 0)).toBe(16);
  });

  test('isWaterTileFromHeights checks the tile average against water level', () => {
    const heights = new Float32Array(GRID * GRID);
    heights.fill(-12);

    expect(isWaterTileFromHeights(heights, 0, 0)).toBe(true);

    heights.fill(8);

    expect(isWaterTileFromHeights(heights, 0, 0)).toBe(false);
  });

  test('tileHash remains deterministic and normalized', () => {
    const hash = tileHash(7, 13);

    expect(hash).toBe(tileHash(7, 13));
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(1);
  });

  test('getTreeType only returns supported tree variants', () => {
    expect([0, 1]).toContain(getTreeType(3, 9));
    expect(getTreeType(3, 9)).toBe(getTreeType(3, 9));
  });

  test('clampZoom enforces the prototype zoom bounds', () => {
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX);
    expect(clampZoom(1.25)).toBe(1.25);
  });

  test('generateTerrainHeights produces a heightmap of the expected size', () => {
    const heights = generateTerrainHeights(GRID, () => 0.5);

    expect(heights).toHaveLength(GRID * GRID);
    expect(heights.every(Number.isFinite)).toBe(true);
  });
});
