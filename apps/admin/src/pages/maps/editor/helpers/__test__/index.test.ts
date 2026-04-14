import { describe, expect, test } from 'bun:test';
import type { MapMetadata } from 'carrier-contracts/types';

import {
  fitViewportToWorldBounds,
  screenToTilePoint,
  tileToScreenPoint
} from '@/hooks/use-map-viewport';

import {
  DEFAULT_SOURCE_POLYGON_PARAMS,
  buildDuplicateStaticEntityLabel,
  canDeleteVertex,
  canSavePolygonDraft,
  chunkIntersectsDirtyBounds,
  filterArchetypeCatalog,
  filterStaticEntityItems,
  getChunkWorldBounds,
  getExactSelectedIslands,
  getIslandsBySelectedPolygons,
  getStaticEntityGroundingDiagnostics,
  getStaticEntityOverlayGeometry,
  mergeWorldBounds,
  nextIslandPolygonSelection,
  nextOrderedSelection,
  pointInPolygon,
  polygonIntersectsBounds,
  snapWorldPoint
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

  test('selects and toggles island polygon groups with shift semantics', () => {
    expect(nextIslandPolygonSelection([], ['a', 'b'], false)).toEqual([
      'a',
      'b'
    ]);
    expect(nextIslandPolygonSelection(['a', 'b'], ['c', 'd'], true)).toEqual([
      'a',
      'b',
      'c',
      'd'
    ]);
    expect(
      nextIslandPolygonSelection(['a', 'b', 'c'], ['a', 'b'], true)
    ).toEqual(['c']);
  });

  test('derives fully and exactly selected islands from polygon selection', () => {
    const islands = [
      { id: 'one', sourcePolygonIds: ['a', 'b'] },
      { id: 'two', sourcePolygonIds: ['c'] }
    ];

    expect(
      getIslandsBySelectedPolygons(islands, ['a', 'b', 'c']).map(
        island => island.id
      )
    ).toEqual(['one', 'two']);
    expect(
      getExactSelectedIslands(islands, ['a', 'b', 'c']).map(island => island.id)
    ).toEqual(['one', 'two']);
    expect(
      getExactSelectedIslands(islands, ['a', 'b', 'x']).map(island => island.id)
    ).toEqual([]);
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

  test('derives static entity overlay geometry and snapping behavior', () => {
    const overlay = getStaticEntityOverlayGeometry({
      assetVersion: {
        footprint: {
          depthMeters: 10,
          widthMeters: 20
        }
      },
      entity: {
        position: { x: 0, z: 0 },
        rotation: { yaw: 90 },
        scale: 1
      }
    });

    expect(overlay.corners[0].x).toBeCloseTo(5, 5);
    expect(overlay.corners[0].z).toBeCloseTo(-10, 5);
    expect(overlay.handle.x).toBeGreaterThan(overlay.frontMidpoint.x);

    const scaledOverlay = getStaticEntityOverlayGeometry({
      assetVersion: {
        footprint: {
          depthMeters: 10,
          widthMeters: 20
        }
      },
      entity: {
        position: { x: 0, z: 0 },
        rotation: { yaw: 90 },
        scale: 2
      }
    });

    expect(scaledOverlay.corners[0].x).toBeCloseTo(10, 5);
    expect(scaledOverlay.corners[0].z).toBeCloseTo(-20, 5);

    expect(
      snapWorldPoint(
        { x: 13.2, z: 27.7 },
        infiniteMap.resolution.metersPerTile,
        'tile'
      )
    ).toEqual({ x: 10, z: 30 });
    expect(
      snapWorldPoint(
        { x: 13.2, z: 27.7 },
        infiniteMap.resolution.metersPerTile,
        'meter'
      )
    ).toEqual({ x: 13, z: 28 });
  });

  test('builds duplicate labels and filters catalog and outliner entries', () => {
    expect(
      buildDuplicateStaticEntityLabel('Watchtower', ['Watchtower Copy'])
    ).toBe('Watchtower Copy 2');
    expect(buildDuplicateStaticEntityLabel(null, [])).toBeNull();

    expect(
      filterArchetypeCatalog(
        [
          {
            id: 'watchtower',
            name: 'Watchtower',
            tags: ['defense', 'stone']
          },
          {
            id: 'pine-tree',
            name: 'Pine Tree',
            tags: ['forest']
          }
        ],
        'def'
      ).map(archetype => archetype.id)
    ).toEqual(['watchtower']);

    expect(
      filterStaticEntityItems(
        [
          {
            archetype: {
              assetVersionId: 'watchtower-v1',
              category: 'landmark',
              id: 'watchtower',
              name: 'Watchtower',
              status: 'active'
            },
            entity: {
              archetypeId: 'watchtower',
              createdAt: '',
              id: 'watchtower-1',
              label: 'North Tower',
              mapId: 'map-1',
              position: { x: 0, z: 0 },
              rotation: { yaw: 0 },
              scale: 1,
              state: 'active',
              updatedAt: '',
              yOffset: 0
            }
          }
        ],
        'north'
      ).map(item => item.entity.id)
    ).toEqual(['watchtower-1']);
  });

  test('computes static entity grounding warnings and pending state from loaded chunks', () => {
    const chunk = {
      chunkX: 0,
      chunkZ: 0,
      heights: new Float32Array([0, 0, 0, 0, 4, 0, 0, 0, 0]),
      layers: {
        height: {
          encoding: 'float32' as const,
          unit: 'metres' as const
        }
      },
      mapId: 'map-1',
      originTileX: 0,
      originTileZ: 0,
      samplesHigh: 3,
      samplesWide: 3,
      staticEntities: [],
      tileHeight: 2,
      tileWidth: 2
    };
    const chunks = new Map([[`${chunk.chunkX}:${chunk.chunkZ}`, chunk]]);

    const warning = getStaticEntityGroundingDiagnostics({
      assetVersion: {
        footprint: {
          depthMeters: 10,
          widthMeters: 10
        },
        maxHeightDeltaMeters: 1
      },
      chunks,
      entity: {
        position: { x: 10, z: 10 },
        rotation: { yaw: 0 },
        yOffset: 2
      },
      map: infiniteMap
    });
    expect(warning.status).toBe('warning');
    if (warning.status === 'warning') {
      expect(warning.effectiveY).toBeGreaterThan(2);
    }

    expect(
      getStaticEntityGroundingDiagnostics({
        assetVersion: {
          footprint: {
            depthMeters: 10,
            widthMeters: 10
          },
          maxHeightDeltaMeters: 1
        },
        chunks: new Map(),
        entity: {
          position: { x: 10, z: 10 },
          rotation: { yaw: 0 },
          yOffset: 0
        },
        map: infiniteMap
      })
    ).toEqual({ status: 'pending' });
  });
});
