import { describe, expect, test } from 'bun:test';

import type { MapMetadata } from 'carrier-contracts/types';

import { DEFAULT_ZOOM, getDefaultViewport } from './use-map-viewport';

const finiteMap: MapMetadata = {
  createdAt: '2026-03-18T00:00:00.000Z',
  extent: {
    heightMeters: 800,
    heightTiles: 80,
    kind: 'finite',
    widthMeters: 1200,
    widthTiles: 120,
    wrapX: false,
    wrapZ: false
  },
  generator: 'diamond-square',
  id: 'finite-map',
  kind: 'wrapped-classic',
  name: 'Finite',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed: 'seed',
  updatedAt: '2026-03-18T00:00:00.000Z'
};

const infiniteMap: MapMetadata = {
  createdAt: '2026-03-18T00:00:00.000Z',
  extent: { kind: 'infinite' },
  id: 'infinite-map',
  kind: 'infinite-vector',
  name: 'Infinite',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed: 'seed',
  updatedAt: '2026-03-18T00:00:00.000Z'
};

describe('default viewport', () => {
  test('centers finite maps from finite extent dimensions', () => {
    expect(getDefaultViewport(finiteMap, 600, 400)).toEqual({
      centerTileX: finiteMap.extent.widthTiles / 2,
      centerTileZ: finiteMap.extent.heightTiles / 2,
      zoom: 5
    });
  });

  test('starts infinite maps at the origin with the default zoom', () => {
    expect(getDefaultViewport(infiniteMap, 600, 400)).toEqual({
      centerTileX: 0,
      centerTileZ: 0,
      zoom: DEFAULT_ZOOM
    });
  });
});
