import { describe, expect, test } from 'bun:test';
import type { MapMetadata, RuntimeMapChunk } from 'carrier-contracts/types';

import {
  buildChunkPhysicsGeometry,
  getNearestWrapOffsets
} from './zarch-physics-geometry';

const map: MapMetadata = {
  createdAt: '2026-07-15T00:00:00.000Z',
  extent: {
    heightMeters: 20,
    heightTiles: 2,
    kind: 'finite',
    widthMeters: 20,
    widthTiles: 2,
    wrapX: false,
    wrapZ: false
  },
  id: 'map-1',
  kind: 'wrapped-classic',
  name: 'Physics test',
  resolution: {
    chunkSizeTiles: 2,
    metersPerTile: 10
  },
  revision: 1,
  seed: 'seed',
  updatedAt: '2026-07-15T00:00:00.000Z'
};

const chunk: RuntimeMapChunk = {
  chunkX: 0,
  chunkZ: 0,
  heights: new Float32Array([2, 4, 6, 8]),
  layers: {
    height: {
      encoding: 'float32',
      unit: 'metres'
    }
  },
  mapId: map.id,
  originTileX: 0,
  originTileZ: 0,
  samplesHigh: 2,
  samplesWide: 2,
  staticEntities: [],
  tileHeight: 1,
  tileWidth: 1
};

describe('zarch physics geometry', () => {
  test('builds chunk terrain in canonical map metres', () => {
    const geometry = buildChunkPhysicsGeometry({ chunk, map, seaY: -12 });

    expect(geometry.terrain.positions).toEqual([
      0, 2, 0, 10, 4, 0, 0, 6, 10, 10, 8, 10
    ]);
    expect(geometry.terrain.indices).toEqual([0, 2, 1, 1, 2, 3]);
    expect(geometry.waterSurface).toBeNull();
    expect(geometry.shoreline).toBeNull();
  });

  test('separates shell water surfaces from tank shoreline barriers', () => {
    const waterChunk = {
      ...chunk,
      heights: new Float32Array([-2, -2, -2, -2])
    };
    const geometry = buildChunkPhysicsGeometry({
      chunk: waterChunk,
      map,
      seaY: -12
    });

    expect(geometry.waterSurface?.indices).toHaveLength(6);
    expect(
      geometry.waterSurface?.positions.every((value, index) =>
        index % 3 === 1 ? value === -12 : true
      )
    ).toBeTrue();
    expect(geometry.shoreline?.indices.length).toBeGreaterThan(0);
  });

  test('materializes nearest wrap images around an unwrapped focus', () => {
    expect(
      getNearestWrapOffsets({
        focusX: 39,
        focusZ: -1,
        map: {
          ...map,
          extent: {
            kind: 'finite',
            widthMeters: 40,
            heightMeters: 20,
            widthTiles: 4,
            heightTiles: 2,
            wrapX: true,
            wrapZ: true
          }
        }
      })
    ).toContainEqual({ x: 40, z: -20 });
  });
});
