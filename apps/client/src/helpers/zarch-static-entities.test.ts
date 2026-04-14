/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity
} from 'carrier-contracts/types';

import {
  createServerMapTerrain,
  getMapChunkQueryKey
} from '@/helpers/zarch-map-terrain';
import { QueryClient } from '@tanstack/react-query';

import {
  collectChunkStaticEntities,
  getSceneMetersScale,
  getStaticEntityGrounding,
  getStaticEntityScenePosition
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

  test('grounds static entities on the center terrain height and applies yOffset', () => {
    const terrain = {
      sampleHeightAtWorld: (x: number, z: number) =>
        x === 12 && z === 12 ? 10 : 2
    };

    expect(
      getStaticEntityGrounding({
        assetVersion,
        entity: baseEntity,
        map,
        terrain
      })
    ).toEqual({
      effectiveY: 12,
      valid: false
    });
  });

  test('grounds static entities against edited terrain height steps', () => {
    const queryClient = new QueryClient();
    const tileHeightSteps = new Int8Array(32 * 32);
    tileHeightSteps[1 + 32] = 2;

    queryClient.setQueryData(getMapChunkQueryKey(map.id, 0, 0, map.revision), {
      ...chunk,
      heights: new Float32Array(33 * 33),
      samplesHigh: 33,
      samplesWide: 33,
      tileHeight: 32,
      tileHeightSteps,
      tileWidth: 32
    } satisfies RuntimeMapChunk);

    const terrain = createServerMapTerrain({
      editConfig: {
        heightStepMeters: 4,
        maxAbsHeightSteps: 16,
        palette: [],
        tileTypes: [{ id: 'normal', label: 'Normal' }]
      },
      map,
      prefetchChunk: () => {},
      queryClient
    });

    expect(
      getStaticEntityGrounding({
        assetVersion,
        entity: {
          ...baseEntity,
          position: { x: 15, z: 15 },
          yOffset: 0
        },
        map,
        terrain
      })?.effectiveY
    ).toBe(4.5);
  });
});
