import { describe, expect, test } from 'bun:test';
import {
  MAP_SURFACE_MATERIALS,
  ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
  ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
  type MapMetadata,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';

import {
  TERRAIN_RENDER_LAYER_OPTIONS,
  computeVisibleHeightRange,
  getTerrainRenderLegend,
  getTileTypeLayerRgb,
  rgbToHex
} from './terrain-render';

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
  tileHeightSteps: Int8Array.from([0, 0, 0, 0]),
  tileTypeIndexes: Uint8Array.from([
    ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
    1,
    0,
    ZARCH_TILE_OVERRIDE_TYPE_SENTINEL
  ]),
  tileWidth: 2
});

describe('terrain render helpers', () => {
  test('exposes render layer options and categorical legends', () => {
    expect(TERRAIN_RENDER_LAYER_OPTIONS.map(option => option.id)).toEqual([
      'resolved-color',
      'color-overrides',
      'base-height',
      'resolved-height',
      'height-steps',
      'tile-type',
      'surface-material'
    ]);

    expect(getTerrainRenderLegend('color-overrides', editConfig)).toEqual([
      { color: '#17212e', label: 'Auto' },
      { color: '#1f7a8c', label: 'Teal' },
      { color: '#f28f3b', label: 'Amber' }
    ]);

    expect(getTerrainRenderLegend('tile-type', editConfig)).toEqual([
      {
        color: rgbToHex(getTileTypeLayerRgb('normal', editConfig)),
        label: 'Normal'
      },
      {
        color: rgbToHex(getTileTypeLayerRgb('landing-pad', editConfig)),
        label: 'Landing Pad'
      }
    ]);

    expect(getTerrainRenderLegend('surface-material', editConfig)).toHaveLength(
      MAP_SURFACE_MATERIALS.length
    );
  });

  test('computes viewport-wide base and resolved height ranges including draft edits', () => {
    const chunks = new Map([['0:0', createChunk()]]);

    expect(
      computeVisibleHeightRange({
        chunks,
        editConfig,
        layer: 'base-height',
        map
      })
    ).toEqual({
      max: 10,
      min: 10
    });

    expect(
      computeVisibleHeightRange({
        chunks,
        editConfig,
        layer: 'resolved-height',
        map
      })
    ).toEqual({
      max: 10,
      min: 10
    });

    const resolvedWithDraft = computeVisibleHeightRange({
      chunks,
      draftEdits: {
        '0:0': {
          colorIndex: null,
          heightSteps: 3,
          tileX: 0,
          tileZ: 0,
          typeId: 'normal'
        }
      },
      editConfig,
      layer: 'resolved-height',
      map
    });

    expect(resolvedWithDraft).not.toBeNull();
    expect(resolvedWithDraft!.max).toBeGreaterThan(10);
    expect(resolvedWithDraft!.max).toBeGreaterThan(resolvedWithDraft!.min);
    expect(
      computeVisibleHeightRange({
        chunks,
        editConfig,
        layer: 'tile-type',
        map
      })
    ).toBeNull();
  });
});
