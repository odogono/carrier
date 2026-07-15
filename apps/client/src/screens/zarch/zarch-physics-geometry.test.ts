/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import type { MapMetadata, RuntimeMapChunk } from 'carrier-contracts/types';

import {
  buildChunkPhysicsGeometry,
  buildStreamBoundaryPatchGeometry,
  getNearestWrapOffsets,
  getTerrainPatchContentSignature
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

const getObstaclePatchSignature = (halfExtents: [number, number, number]) =>
  getTerrainPatchContentSignature({
    centerTileX: 0,
    centerTileZ: 0,
    obstacleColliders: [
      {
        center: [5, 5, 5],
        halfExtents,
        id: 'tower',
        yawRadians: 0
      }
    ],
    radiusTiles: 0,
    seaY: -12,
    terrain: {
      isTileLoaded: () => true,
      isWaterTile: () => false,
      sampleHeight: () => 1,
      shouldHaveTree: () => false,
      treeType: () => 0
    },
    tileMeters: 10,
    wrapOffsets: [{ x: 0, z: 0 }]
  });

const getEnvironmentPatchSignature = (seaY: number, tileMeters: number) =>
  getTerrainPatchContentSignature({
    centerTileX: 0,
    centerTileZ: 0,
    obstacleColliders: [],
    radiusTiles: 0,
    seaY,
    terrain: {
      isTileLoaded: () => true,
      isWaterTile: () => true,
      sampleHeight: () => -1,
      shouldHaveTree: () => false,
      treeType: () => 0
    },
    tileMeters,
    wrapOffsets: [{ x: 0, z: 0 }]
  });

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
            heightMeters: 20,
            heightTiles: 2,
            kind: 'finite',
            widthMeters: 40,
            widthTiles: 4,
            wrapX: true,
            wrapZ: true
          }
        }
      })
    ).toContainEqual({ x: 40, z: -20 });
  });

  test('invalidates collider patches when loaded topology or heights change', () => {
    const tiles = new Map<string, number | null>([
      ['0:0', 1],
      ['1:0', 1]
    ]);
    const signature = () =>
      getTerrainPatchContentSignature({
        centerTileX: 0,
        centerTileZ: 0,
        obstacleColliders: [],
        radiusTiles: 0,
        seaY: -12,
        terrain: {
          isTileLoaded: (x, z) =>
            tiles.has(`${x}:${z}`) && tiles.get(`${x}:${z}`) !== null,
          isWaterTile: () => false,
          sampleHeight: (x, z) => tiles.get(`${x}:${z}`) ?? null,
          shouldHaveTree: () => false,
          treeType: () => 0
        },
        tileMeters: 10,
        wrapOffsets: [{ x: 0, z: 0 }]
      });

    const initial = signature();
    tiles.set('0:0', null);
    tiles.set('1:0', 2);

    expect(signature()).not.toBe(initial);
  });

  test('invalidates collider patches when only obstacle dimensions change', () => {
    expect(getObstaclePatchSignature([1, 2, 1])).not.toBe(
      getObstaclePatchSignature([2, 2, 1])
    );
  });

  test('invalidates collider patches when sea level or tile scale changes', () => {
    expect(getEnvironmentPatchSignature(-12, 10)).not.toBe(
      getEnvironmentPatchSignature(-8, 10)
    );
    expect(getEnvironmentPatchSignature(-12, 10)).not.toBe(
      getEnvironmentPatchSignature(-12, 24)
    );
  });

  test('builds fail-closed barriers around internal unloaded edges', () => {
    const geometry = buildStreamBoundaryPatchGeometry({
      centerTileX: 0,
      centerTileZ: 0,
      radiusTiles: 1,
      terrain: {
        isTileLoaded: (x, z) => !(x === 0 && z === 0)
      },
      tileMeters: 10
    });

    expect(geometry.indices.length).toBeGreaterThanOrEqual(24);
    expect(geometry.positions).toContain(0);
    expect(geometry.positions).toContain(10);
  });
});
