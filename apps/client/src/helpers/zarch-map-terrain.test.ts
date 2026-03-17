/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';
import type { MapMetadata, RuntimeMapChunk } from 'carrier-contracts/types';

import {
  createServerMapTerrain,
  getMapChunkQueryKey,
  getVisibleChunkWindow
} from '@/helpers/zarch-map-terrain';
import { ZOOM_MAX, ZOOM_MIN, clampZoom, getTreeType, tileHash } from '@/helpers/zarch-terrain';

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
  generator: 'diamond-square',
  seed: 'map-seed',
  createdAt: '2026-03-06T00:00:00.000Z',
  updatedAt: '2026-03-06T00:00:00.000Z'
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
  tileHeight: 32,
  tileWidth: 32
};

describe('server-backed zarch terrain', () => {
  test('query keys and tile hash helpers remain stable', () => {
    expect(getMapChunkQueryKey('map-1', 2, 3)).toEqual(['map-chunk', 'map-1', 2, 3]);
    expect(tileHash(7, 13)).toBe(tileHash(7, 13));
    expect(getTreeType(3, 9)).toBe(getTreeType(3, 9));
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX);
  });

  test('reads heights from the query cache and respects map bounds', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getMapChunkQueryKey(map.id, 0, 0), chunk00);

    const terrain = createServerMapTerrain({
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

  test('requests visible chunks with a one-ring prefetch window', () => {
    const requested: string[] = [];
    const queryClient = new QueryClient();
    queryClient.setQueryData(getMapChunkQueryKey(map.id, 0, 0), chunk00);

    const terrain = createServerMapTerrain({
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
    queryClient.setQueryData(getMapChunkQueryKey(map.id, 0, 0), chunk00);

    const terrain = createServerMapTerrain({
      map,
      prefetchChunk: () => {},
      queryClient
    });

    expect(terrain.isTileLoaded(0, 0)).toBe(true);
    expect(terrain.isTileLoaded(40, 40)).toBe(false);
  });
});
