import { describe, expect, test } from 'bun:test';

import {
  GetZarchTileEditConfigOutput,
  UpdateMapTilesOutput,
  decodeMapChunkBinary
} from './index';

describe('tile edit contracts', () => {
  test('validates the global tile edit configuration shape', () => {
    expect(
      GetZarchTileEditConfigOutput.parse({
        heightStepMeters: 4,
        maxAbsHeightSteps: 16,
        palette: [{ hex: '#c8b878', id: 'sand', label: 'Sand' }],
        tileTypes: [{ id: 'normal', label: 'Normal' }]
      })
    ).toEqual({
      heightStepMeters: 4,
      maxAbsHeightSteps: 16,
      palette: [{ hex: '#c8b878', id: 'sand', label: 'Sand' }],
      tileTypes: [{ id: 'normal', label: 'Normal' }]
    });
  });

  test('validates tile mutation outputs with dirty bounds', () => {
    expect(
      UpdateMapTilesOutput.parse({
        appliedTileCount: 3,
        dirtyBounds: {
          maxX: 40,
          maxZ: 60,
          minX: 0,
          minZ: 20
        },
        mapRevision: 9
      })
    ).toEqual({
      appliedTileCount: 3,
      dirtyBounds: {
        maxX: 40,
        maxZ: 60,
        minX: 0,
        minZ: 20
      },
      mapRevision: 9
    });
  });

  test('decodes binary chunk tile override layers', async () => {
    const chunk = await decodeMapChunkBinary({
      chunkX: 0,
      chunkZ: 0,
      heights: new Blob([new Float32Array([1, 2, 3, 4]).buffer]),
      layers: {
        height: {
          encoding: 'float32',
          unit: 'metres'
        },
        tileColor: {
          encoding: 'uint8',
          sentinel: 255,
          unit: 'tile-color-index'
        },
        tileHeightStep: {
          encoding: 'int8',
          unit: 'height-step'
        },
        tileType: {
          encoding: 'uint8',
          sentinel: 255,
          unit: 'tile-type-index'
        }
      },
      mapId: 'map-1',
      originTileX: 0,
      originTileZ: 0,
      samplesHigh: 2,
      samplesWide: 2,
      staticEntitiesJson: '[]',
      tileColorIndexes: new Blob([Uint8Array.from([255])]),
      tileHeight: 1,
      tileHeightSteps: new Blob([Int8Array.from([3])]),
      tileTypeIndexes: new Blob([Uint8Array.from([1])]),
      tileWidth: 1
    });

    expect(Array.from(chunk.heights)).toEqual([1, 2, 3, 4]);
    expect(Array.from(chunk.tileHeightSteps ?? [])).toEqual([3]);
    expect(Array.from(chunk.tileTypeIndexes ?? [])).toEqual([1]);
    expect(Array.from(chunk.tileColorIndexes ?? [])).toEqual([255]);
  });
});
