import { describe, expect, test } from 'bun:test';
import {
  MAP_SURFACE_MATERIALS,
  ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
  ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
  type MapMetadata,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';

import { createChunkMapTerrain } from './map-chunk-terrain';

const map: MapMetadata = {
  createdAt: '2026-04-10T00:00:00.000Z',
  extent: {
    heightMeters: 20,
    heightTiles: 2,
    kind: 'finite',
    widthMeters: 20,
    widthTiles: 2,
    wrapX: false,
    wrapZ: false
  },
  generator: 'diamond-square',
  id: 'map-1',
  kind: 'wrapped-classic',
  name: 'Terrain Test',
  resolution: {
    chunkSizeTiles: 2,
    metersPerTile: 10
  },
  revision: 0,
  seed: 'seed',
  updatedAt: '2026-04-10T00:00:00.000Z'
};

const editConfig: ZarchTileEditConfig = {
  heightStepMeters: 4,
  maxAbsHeightSteps: 16,
  palette: [
    { hex: '#1f7a8c', id: 'teal', label: 'Teal' },
    { hex: '#f28f3b', id: 'amber', label: 'Amber' }
  ],
  tileTypes: [
    { id: 'normal', label: 'Normal' },
    { id: 'landing-pad', label: 'Landing Pad' }
  ]
};

const createChunk = (): RuntimeMapChunk => ({
  chunkX: 0,
  chunkZ: 0,
  heights: Float32Array.from([
    10, 10, 10,
    10, 10, 10,
    10, 10, 10
  ]),
  layers: {
    height: { encoding: 'float32', unit: 'metres' },
    material: { encoding: 'uint8', unit: 'surface-material' },
    tileColor: {
      encoding: 'uint8',
      sentinel: ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
      unit: 'tile-color-index'
    },
    tileHeightStep: { encoding: 'int8', unit: 'height-step' },
    tileType: {
      encoding: 'uint8',
      sentinel: ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
      unit: 'tile-type-index'
    }
  },
  mapId: map.id,
  materials: [
    MAP_SURFACE_MATERIALS[0]!,
    MAP_SURFACE_MATERIALS[1]!,
    MAP_SURFACE_MATERIALS[2]!,
    MAP_SURFACE_MATERIALS[3]!
  ],
  originTileX: 0,
  originTileZ: 0,
  samplesHigh: 3,
  samplesWide: 3,
  staticEntities: [],
  tileColorIndexes: Uint8Array.from([
    ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
    1,
    0,
    ZARCH_TILE_OVERRIDE_COLOR_SENTINEL
  ]),
  tileHeight: 2,
  tileHeightSteps: Int8Array.from([0, 1, -1, 0]),
  tileTypeIndexes: Uint8Array.from([
    ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
    1,
    0,
    ZARCH_TILE_OVERRIDE_TYPE_SENTINEL
  ]),
  tileWidth: 2
});

describe('createChunkMapTerrain', () => {
  test('reads persisted tile layers and sentinel defaults', () => {
    const terrain = createChunkMapTerrain({
      chunks: new Map([['0:0', createChunk()]]),
      editConfig,
      map
    });

    expect(terrain.containsTile(1, 1)).toBe(true);
    expect(terrain.containsTile(2, 2)).toBe(false);
    expect(terrain.getTileBaseAverageHeight(0, 0)).toBe(10);
    expect(terrain.getTileHeightSteps(1, 0)).toBe(1);
    expect(terrain.getTileTypeId(0, 0)).toBe('normal');
    expect(terrain.getTileTypeId(1, 0)).toBe('landing-pad');
    expect(terrain.getTileColorIndex(0, 0)).toBeNull();
    expect(terrain.getTileColorHex(1, 0)).toBe('#f28f3b');
    expect(terrain.getTileMaterial(1, 1)).toBe(MAP_SURFACE_MATERIALS[3]);
  });

  test('overlays draft edits on top of persisted chunk data', () => {
    const terrain = createChunkMapTerrain({
      chunks: new Map([['0:0', createChunk()]]),
      draftEdits: {
        '0:0': {
          colorIndex: 0,
          heightSteps: 3,
          tileX: 0,
          tileZ: 0,
          typeId: 'landing-pad'
        }
      },
      editConfig,
      map
    });

    expect(terrain.getTileHeightSteps(0, 0)).toBe(3);
    expect(terrain.getTileTypeId(0, 0)).toBe('landing-pad');
    expect(terrain.getTileColorIndex(0, 0)).toBe(0);
    expect(terrain.getTileColorHex(0, 0)).toBe('#1f7a8c');
    expect(terrain.sampleHeight(0, 0)).toBe(22);
  });
});
