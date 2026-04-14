/* eslint-disable perfectionist/sort-objects */
/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import type {
  MapMetadata,
  RuntimeMapChunk,
  ZarchTileEditConfig
} from 'carrier-contracts/types';

import {
  createServerMapTerrain,
  getMapChunkQueryKey,
  getVisibleChunkWindow
} from '@/helpers/zarch-map-terrain';
import {
  LANDSCAPE_CLIP_SCALE_MAX,
  MAX_VIEW_RADIUS,
  VIEW_R_BASE,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  getLandscapeViewMetrics,
  getTreeType,
  tileHash
} from '@/helpers/zarch-terrain';
import { QueryClient } from '@tanstack/react-query';

const editConfig: ZarchTileEditConfig = {
  heightStepMeters: 4,
  maxAbsHeightSteps: 16,
  palette: [{ hex: '#d6c64a', id: 'pad-yellow', label: 'Pad Yellow' }],
  tileTypes: [
    { id: 'normal', label: 'Normal' },
    { id: 'landing-pad', label: 'Landing Pad' }
  ]
};

const map: MapMetadata = {
  id: 'map-1',
  name: 'Test map',
  kind: 'wrapped-classic',
  extent: {
    kind: 'finite',
    widthMeters: 640,
    heightMeters: 640,
    widthTiles: 64,
    heightTiles: 64,
    wrapX: false,
    wrapZ: false
  },
  resolution: {
    metersPerTile: 10,
    chunkSizeTiles: 32
  },
  revision: 0,
  generator: 'diamond-square',
  seed: 'map-seed',
  createdAt: '2026-03-06T00:00:00.000Z',
  updatedAt: '2026-03-06T00:00:00.000Z'
};

const wrappedMap: MapMetadata = {
  ...map,
  id: 'map-wrap',
  extent: {
    kind: 'finite',
    widthMeters: 640,
    heightMeters: 640,
    widthTiles: 64,
    heightTiles: 64,
    wrapX: true,
    wrapZ: true
  }
};

const chunk00: RuntimeMapChunk = {
  chunkX: 0,
  chunkZ: 0,
  heights: Float32Array.from({ length: 33 * 33 }, (_, index) => index),
  layers: {
    height: {
      encoding: 'float32',
      unit: 'metres'
    }
  },
  mapId: map.id,
  originTileX: 0,
  originTileZ: 0,
  samplesHigh: 33,
  samplesWide: 33,
  staticEntities: [],
  tileHeight: 32,
  tileWidth: 32
};

const chunk10: RuntimeMapChunk = {
  ...chunk00,
  chunkX: 1,
  heights: Float32Array.from({ length: 33 * 33 }, (_, index) => 10_000 + index),
  mapId: wrappedMap.id,
  originTileX: 32
};

const chunk01: RuntimeMapChunk = {
  ...chunk00,
  chunkZ: 1,
  heights: Float32Array.from({ length: 33 * 33 }, (_, index) => 20_000 + index),
  mapId: wrappedMap.id,
  originTileZ: 32
};

const chunk11: RuntimeMapChunk = {
  ...chunk00,
  chunkX: 1,
  chunkZ: 1,
  heights: Float32Array.from({ length: 33 * 33 }, (_, index) => 30_000 + index),
  mapId: wrappedMap.id,
  originTileX: 32,
  originTileZ: 32
};

describe('server-backed zarch terrain', () => {
  test('query keys and tile hash helpers remain stable', () => {
    expect(getMapChunkQueryKey('map-1', 2, 3)).toEqual([
      'map-chunk',
      'map-1',
      2,
      3
    ]);
    expect(getMapChunkQueryKey('map-1', 2, 3, 7)).toEqual([
      'map-chunk',
      'map-1',
      2,
      3,
      7
    ]);
    expect(tileHash(7, 13)).toBe(tileHash(7, 13));
    expect(getTreeType(3, 9)).toBe(getTreeType(3, 9));
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX);
  });

  test('supports expanded landscape visibility beyond the previous cap', () => {
    const metrics = getLandscapeViewMetrics({
      landscapeClipScale: LANDSCAPE_CLIP_SCALE_MAX,
      viewRadiusBase: VIEW_R_BASE,
      zoom: ZOOM_MAX
    });

    expect(metrics.viewRadius).toBe(MAX_VIEW_RADIUS);
    expect(metrics.viewRadius).toBeGreaterThan(
      Math.round(VIEW_R_BASE * ZOOM_MAX)
    );
    expect(metrics.cameraZoomRadius).toBe(VIEW_R_BASE * ZOOM_MAX);
    expect(metrics.clipRadius).toBeGreaterThan(metrics.cameraClipRadius);
  });

  test('reads heights from the query cache and respects map bounds', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getMapChunkQueryKey(map.id, 0, 0, map.revision),
      chunk00
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.sampleHeight(0, 0)).toBe(0);
    expect(terrain.sampleHeight(1, 0)).toBe(1);
    expect(terrain.getTileAverageHeight(0, 0)).toBe((0 + 1 + 33 + 34) * 0.25);
    expect(terrain.sampleHeight(-1, 0)).toBeNull();
    expect(terrain.sampleHeight(65, 0)).toBeNull();
    expect(terrain.containsTile(-1, 0)).toBe(false);
    expect(terrain.containsTile(63, 63)).toBe(true);
  });

  test('samples world-space height and normal continuously', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getMapChunkQueryKey(map.id, 0, 0, map.revision),
      chunk00
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.sampleHeightAtWorld(12, 12)).toBe((0 + 1 + 33 + 34) * 0.25);
    expect(terrain.isWorldPointLoaded(12, 12)).toBe(true);
    expect(terrain.sampleNormalAtWorld(12, 12)).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number)
    });
    expect(terrain.isWaterAtWorld(12, 12)).toBe(false);
  });

  test('blends tile height edits across shared corners so adjacent tiles stay connected', () => {
    const queryClient = new QueryClient();
    const tileHeightSteps = new Int8Array(32 * 32);
    tileHeightSteps[1 + 32] = 2;

    queryClient.setQueryData(
      getMapChunkQueryKey(map.id, 0, 0, map.revision),
      {
        ...chunk00,
        heights: new Float32Array(33 * 33),
        tileHeightSteps
      } satisfies RuntimeMapChunk
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.sampleHeight(1, 1)).toBe(2);
    expect(terrain.sampleHeight(2, 1)).toBe(2);
    expect(terrain.sampleHeight(1, 2)).toBe(2);
    expect(terrain.sampleHeight(2, 2)).toBe(2);
    expect(terrain.getTileAverageHeight(1, 1)).toBe(2);
    expect(terrain.getTileAverageHeight(0, 1)).toBe(1);
    expect(terrain.sampleHeightAtWorld(36, 36)).toBe(2);
  });

  test('ignores chunks cached for a previous map revision', () => {
    const queryClient = new QueryClient();
    const currentMap = {
      ...map,
      revision: 2
    };
    const staleChunk = {
      ...chunk00,
      heights: new Float32Array(33 * 33).fill(99)
    } satisfies RuntimeMapChunk;

    queryClient.setQueryData(
      getMapChunkQueryKey(currentMap.id, 0, 0, 1),
      staleChunk
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map: currentMap,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.sampleHeight(0, 0)).toBeNull();

    queryClient.setQueryData(
      getMapChunkQueryKey(currentMap.id, 0, 0, currentMap.revision),
      chunk00
    );

    expect(
      createServerMapTerrain({
        editConfig,
        map: currentMap,
        prefetchChunk: () => {},
        queryClient
      }).sampleHeight(0, 0)
    ).toBe(0);
  });

  test('requests visible chunks with a one-ring prefetch window', () => {
    const requested: string[] = [];
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getMapChunkQueryKey(map.id, 0, 0, map.revision),
      chunk00
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map,
      prefetchChunk: (chunkX, chunkZ) => requested.push(`${chunkX},${chunkZ}`),
      queryClient
    });

    const window = getVisibleChunkWindow(map, 20, 20, 6);
    terrain.requestVisibleChunks(20, 20, 6);

    expect(window).toEqual({
      maxChunkX: 1,
      maxChunkZ: 1,
      minChunkX: 0,
      minChunkZ: 0
    });
    expect(requested).toEqual(['0,0', '1,0', '0,1', '1,1']);
  });

  test('marks a tile as unloaded until all corner samples are cached', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getMapChunkQueryKey(map.id, 0, 0, map.revision),
      chunk00
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.isTileLoaded(0, 0)).toBe(true);
    expect(terrain.isTileLoaded(40, 40)).toBe(false);
  });

  test('wraps sample and tile lookup for wrapped-classic maps', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getMapChunkQueryKey(wrappedMap.id, 0, 0, wrappedMap.revision),
      {
        ...chunk00,
        mapId: wrappedMap.id
      }
    );
    queryClient.setQueryData(
      getMapChunkQueryKey(wrappedMap.id, 1, 0, wrappedMap.revision),
      chunk10
    );
    queryClient.setQueryData(
      getMapChunkQueryKey(wrappedMap.id, 0, 1, wrappedMap.revision),
      chunk01
    );
    queryClient.setQueryData(
      getMapChunkQueryKey(wrappedMap.id, 1, 1, wrappedMap.revision),
      chunk11
    );

    const terrain = createServerMapTerrain({
      editConfig,
      map: wrappedMap,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.containsTile(-1, 0)).toBe(true);
    expect(terrain.sampleHeight(-1, 0)).toBe(chunk10.heights[31]);
    expect(terrain.sampleHeight(64, 0)).toBe(chunk00.heights[0]);
    expect(terrain.isTileLoaded(-1, -1)).toBe(true);
    expect(terrain.wrapX).toBe(true);
    expect(terrain.wrapZ).toBe(true);
  });

  test('deduplicates wrapped chunk prefetches onto canonical chunk coordinates', () => {
    const requested: string[] = [];
    const queryClient = new QueryClient();

    const terrain = createServerMapTerrain({
      editConfig,
      map: wrappedMap,
      prefetchChunk: (chunkX, chunkZ) => requested.push(`${chunkX},${chunkZ}`),
      queryClient
    });

    terrain.requestVisibleChunks(0, 0, 40);

    expect(requested.sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });
});
