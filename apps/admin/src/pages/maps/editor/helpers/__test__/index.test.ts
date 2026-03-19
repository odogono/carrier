import { describe, expect, test } from 'bun:test';
import type { MapMetadata } from 'carrier-contracts/types';

import {
  fitViewportToWorldBounds,
  screenToTilePoint,
  tileToScreenPoint
} from '@/hooks/use-map-viewport';

import {
  DEFAULT_SOURCE_POLYGON_PARAMS,
  canDeleteVertex,
  canSavePolygonDraft,
  chunkIntersectsDirtyBounds,
  getChunkWorldBounds,
  mergeWorldBounds,
  nextOrderedSelection,
  pointInPolygon,
  polygonIntersectsBounds
} from '../index';

const infiniteMap: MapMetadata = {
  createdAt: new Date().toISOString(),
  extent: { kind: 'infinite' },
  id: 'map-1',
  kind: 'infinite-vector',
  name: 'Infinite',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed: 'seed',
  updatedAt: new Date().toISOString()
};

describe('editor utilities', () => {
  test('round-trips screen and tile coordinates', () => {
    const viewport = {
      centerTileX: 40,
      centerTileZ: -12,
      zoom: 4
    };

    const screen = tileToScreenPoint(viewport, 800, 600, 48, -6);
    expect(screenToTilePoint(viewport, 800, 600, screen.x, screen.z)).toEqual({
      x: 48,
      z: -6
    });
  });

  test('preserves ordered boolean selection with shift-toggle semantics', () => {
    expect(nextOrderedSelection([], 'a', false)).toEqual(['a']);
    expect(nextOrderedSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(nextOrderedSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  test('validates polygon draft lifecycle with seeded default params', () => {
    expect(
      canSavePolygonDraft(
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 }
        ],
        DEFAULT_SOURCE_POLYGON_PARAMS
      )
    ).toBe(true);

    expect(
      canSavePolygonDraft(
        [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 10, z: 10 }
        ],
        DEFAULT_SOURCE_POLYGON_PARAMS
      )
    ).toBe(false);
  });

  test('enforces selected-vertex delete safety', () => {
    expect(
      canDeleteVertex(
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 }
        ],
        1
      )
    ).toBe(false);

    expect(
      canDeleteVertex(
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 },
          { x: 0, z: 10 }
        ],
        2
      )
    ).toBe(true);
  });

  test('fits viewport to world bounds and filters chunk invalidation by dirty area', () => {
    const fitted = fitViewportToWorldBounds(infiniteMap, 800, 600, {
      maxX: 640,
      maxZ: 320,
      minX: 0,
      minZ: 0
    });

    expect(fitted.centerTileX).toBe(32);
    expect(fitted.centerTileZ).toBe(16);
    expect(fitted.zoom).toBeGreaterThan(1);

    expect(
      chunkIntersectsDirtyBounds(infiniteMap, 0, 0, {
        maxX: 300,
        maxZ: 300,
        minX: 50,
        minZ: 50
      })
    ).toBe(true);
    expect(
      chunkIntersectsDirtyBounds(infiniteMap, 4, 4, {
        maxX: 300,
        maxZ: 300,
        minX: 50,
        minZ: 50
      })
    ).toBe(false);
  });

  test('merges authored bounds and exposes chunk bounds in world metres', () => {
    expect(
      mergeWorldBounds(
        {
          maxX: 10,
          maxZ: 10,
          minX: -10,
          minZ: -10
        },
        {
          maxX: 20,
          maxZ: 30,
          minX: 0,
          minZ: -5
        }
      )
    ).toEqual({
      maxX: 20,
      maxZ: 30,
      minX: -10,
      minZ: -10
    });

    expect(getChunkWorldBounds(infiniteMap, -1, 2)).toEqual({
      maxX: 0,
      maxZ: 960,
      minX: -320,
      minZ: 640
    });
  });

  test('detects polygon containment and marquee intersection', () => {
    const polygon = [
      { x: 0, z: 0 },
      { x: 20, z: 0 },
      { x: 20, z: 20 },
      { x: 0, z: 20 }
    ];

    expect(pointInPolygon({ x: 10, z: 10 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 30, z: 30 }, polygon)).toBe(false);

    expect(
      polygonIntersectsBounds(polygon, {
        maxX: 5,
        maxZ: 5,
        minX: -5,
        minZ: -5
      })
    ).toBe(true);

    expect(
      polygonIntersectsBounds(polygon, {
        maxX: 40,
        maxZ: 40,
        minX: 30,
        minZ: 30
      })
    ).toBe(false);
  });
});
