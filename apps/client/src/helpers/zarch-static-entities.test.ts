import { describe, expect, test } from 'bun:test';
import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity
} from 'carrier-contracts/types';

import {
  collectChunkStaticEntities,
  getSceneMetersScale,
  getStaticEntityGrounding,
  getStaticEntityScenePosition,
  getTerrainGrids
} from './zarch-static-entities';

const map: MapMetadata = {
  createdAt: '2026-03-24T00:00:00.000Z',
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
  name: 'Test map',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 1,
  seed: 'seed',
  updatedAt: '2026-03-24T00:00:00.000Z'
};

const baseEntity: StaticEntity = {
  archetypeId: 'watchtower',
  createdAt: '2026-03-24T00:00:00.000Z',
  id: 'watchtower-1',
  label: null,
  mapId: map.id,
  position: {
    x: 5,
    z: 5
  },
  rotation: {
    yaw: 0
  },
  scale: 1,
  state: 'active',
  updatedAt: '2026-03-24T00:00:00.000Z',
  yOffset: 2
};

const chunk: RuntimeMapChunk = {
  chunkX: 0,
  chunkZ: 0,
  heights: new Float32Array([1, 1, 1, 1, 3, 1, 1, 1, 1]),
  layers: {
    height: {
      encoding: 'float32',
      unit: 'metres'
    }
  },
  mapId: map.id,
  originTileX: 0,
  originTileZ: 0,
  samplesHigh: 3,
  samplesWide: 3,
  staticEntities: [],
  tileHeight: 2,
  tileWidth: 2
};

const assetVersion: AssetVersion = {
  collisionBox: {
    depthMeters: 4,
    heightMeters: 8,
    widthMeters: 4
  },
  collisionClass: 'prop',
  createdAt: '2026-03-24T00:00:00.000Z',
  diagnostics: [],
  footprint: {
    depthMeters: 4,
    widthMeters: 4
  },
  groundingPolicy: 'footprint-average',
  id: 'watchtower-v1',
  instancingEligible: false,
  maxHeightDeltaMeters: 1.5,
  originalFile: {
    contentType: 'model/gltf-binary',
    path: 'source.glb',
    sizeBytes: 100
  },
  runtimeFile: {
    contentType: 'model/gltf-binary',
    path: 'runtime.glb',
    sizeBytes: 80
  },
  status: 'ready',
  updatedAt: '2026-03-24T00:00:00.000Z'
};

describe('zarch static entity helpers', () => {
  test('deduplicates chunk entities and hides disabled placements', () => {
    const disabledEntity = {
      ...baseEntity,
      id: 'watchtower-2',
      state: 'disabled' as const
    };
    const chunks: RuntimeMapChunk[] = [
      {
        ...chunk,
        staticEntities: [baseEntity, disabledEntity]
      },
      {
        ...chunk,
        chunkX: 1,
        staticEntities: [baseEntity]
      }
    ];

    expect(collectChunkStaticEntities(chunks)).toEqual([baseEntity]);
  });

  test('converts world positions into scene positions', () => {
    expect(getSceneMetersScale(map)).toBeCloseTo(2.4, 5);
    expect(
      getStaticEntityScenePosition({
        entity: baseEntity,
        map
      })
    ).toEqual({
      x: 12,
      z: 12
    });
  });

  test('computes footprint-aware grounding and applies yOffset', () => {
    expect(
      getStaticEntityGrounding({
        assetVersion,
        entity: baseEntity,
        terrains: getTerrainGrids([chunk], map)
      })
    ).toEqual({
      effectiveY: 3.5,
      valid: true
    });
  });
});
