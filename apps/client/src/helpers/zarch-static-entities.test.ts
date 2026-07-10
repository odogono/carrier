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
  getStaticEntityScenePosition,
  shouldUseStaticEntityInstancing
} from './zarch-static-entities';

const groundingFixture = await Bun.file(
  new URL('../../../../fixtures/static-entity-grounding.json', import.meta.url)
).json();

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

  test('uses individual entity objects in edit mode so visible entities stay pickable', () => {
    expect(
      shouldUseStaticEntityInstancing({
        entityEditEnabled: false,
        instancedRuntimeAvailable: true,
        instancingEligible: true
      })
    ).toBe(true);

    expect(
      shouldUseStaticEntityInstancing({
        entityEditEnabled: true,
        instancedRuntimeAvailable: true,
        instancingEligible: true
      })
    ).toBe(false);
  });

  test('grounds static entities on averaged footprint height and scaled yOffset', () => {
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
      averageTerrainHeightMeters: 3.6,
      effectiveHeightMeters: 5.6,
      maxHeightDeltaMeters: 8,
      scaledYOffsetMeters: 2,
      sceneY: 8.4,
      valid: false
    });
  });

  test('projects canonical effective height into client scene Y', () => {
    const fixtureMap = {
      ...map,
      resolution: {
        ...map.resolution,
        metersPerTile: groundingFixture.map.metersPerTile
      }
    };
    const sceneScale = getSceneMetersScale(fixtureMap);
    const terrain = {
      sampleHeightAtWorld: (sceneX: number, sceneZ: number) => {
        const x = sceneX / sceneScale;
        const z = sceneZ / sceneScale;
        return (
          groundingFixture.terrainPlane.baseHeightMeters +
          groundingFixture.terrainPlane.xSlope * x +
          groundingFixture.terrainPlane.zSlope * z
        );
      }
    };

    const grounding = getStaticEntityGrounding({
      assetVersion: groundingFixture.assetVersion,
      entity: groundingFixture.placement,
      map: fixtureMap,
      terrain
    });

    expect(sceneScale).toBeCloseTo(groundingFixture.expected.sceneScale, 8);
    expect(grounding?.effectiveHeightMeters).toBeCloseTo(
      groundingFixture.expected.effectiveHeightMeters,
      8
    );
    expect(grounding?.sceneY).toBeCloseTo(groundingFixture.expected.sceneY, 8);
    expect(grounding?.valid).toBe(groundingFixture.expected.valid);
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
      })?.sceneY
    ).toBe(4.5);
  });
});
