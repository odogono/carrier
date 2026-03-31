import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import {
  isFiniteMap,
  stringifyStaticEntityExportManifest
} from 'carrier-contracts/types';

import { MapRepository, MapRepositoryError } from './repository';

const polygonParams = {
  maxDisplacementMeters: 18,
  noiseScaleMeters: 96,
  roughness: 0.55
} as const;

const square = (minX: number, minZ: number, maxX: number, maxZ: number) => [
  { x: minX, z: minZ },
  { x: maxX, z: minZ },
  { x: maxX, z: maxZ },
  { x: minX, z: maxZ }
];

const getChunkCount = (repository: MapRepository) =>
  repository.db
    .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM map_chunks')
    .get()?.count ?? 0;

const hasTable = (repository: MapRepository, name: string) =>
  Boolean(
    repository.db
      .query<
        { name: string },
        [string]
      >(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name)
  );

describe('map repository', () => {
  test('keeps wrapped-classic behavior while exposing revision metadata', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'wrapped-classic',
        generator: 'diamond-square',
        heightMeters: 640,
        name: 'Alpha',
        seed: 'alpha-seed',
        widthMeters: 960
      });

      expect(created.revision).toBe(0);
      expect(created.extent.kind).toBe('finite');
      expect(getChunkCount(repository)).toBe(0);

      const chunk = repository.getMapChunk(created.id, 2, 1);
      expect(chunk).not.toBeNull();
      expect(chunk?.samplesWide).toBe(33);
      expect(chunk?.samplesHigh).toBe(33);
      expect(getChunkCount(repository)).toBe(1);

      const aliasedChunk = repository.getMapChunk(created.id, -1, 1);
      expect(aliasedChunk?.heights).toEqual(chunk?.heights);

      expect(repository.deleteMap(created.id)).toBe(true);
      expect(repository.getMap(created.id)).toBeNull();
    } finally {
      repository.close();
    }
  });

  test('supports authored polygon/control-point lifecycle, revision conflicts, and localized invalidation', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Infinite World',
        seed: 'infinite-seed'
      });

      expect(created.revision).toBe(0);

      const emptyChunk = repository.getMapChunk(created.id, 0, 0);
      expect(emptyChunk).not.toBeNull();
      expect(emptyChunk?.heights).toHaveLength(33 * 33);
      expect(getChunkCount(repository)).toBe(1);

      const createdPolygon = repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: created.id,
        params: polygonParams,
        vertices: square(40, 40, 240, 240)
      });
      expect(createdPolygon.mapRevision).toBe(1);
      expect(createdPolygon.dirtyBounds).toEqual({
        maxX: 258,
        maxZ: 258,
        minX: 22,
        minZ: 22
      });

      expect(() =>
        repository.createControlPoint({
          elevationMeters: 90,
          expectedRevision: 0,
          influenceMeters: 120,
          mapId: created.id,
          strength: 0.9,
          type: 'peak',
          x: 120,
          z: 120
        })
      ).toThrow(MapRepositoryError);

      const createdControl = repository.createControlPoint({
        elevationMeters: 90,
        expectedRevision: 1,
        influenceMeters: 120,
        mapId: created.id,
        strength: 0.9,
        type: 'peak',
        x: 120,
        z: 120
      });
      expect(createdControl.mapRevision).toBe(2);
      expect(createdControl.dirtyBounds).toEqual({
        maxX: 378,
        maxZ: 378,
        minX: -138,
        minZ: -138
      });

      const terrainChunk = repository.getMapChunk(created.id, 0, 0);
      const farChunk = repository.getMapChunk(created.id, 10, 10);
      expect(terrainChunk).not.toBeNull();
      expect(farChunk).not.toBeNull();
      expect(getChunkCount(repository)).toBe(2);

      const updatedControl = repository.updateControlPoint({
        expectedRevision: 2,
        id: createdControl.controlPoint.id,
        influenceMeters: 140,
        mapId: created.id,
        x: 140,
        z: 140
      });
      expect(updatedControl.mapRevision).toBe(3);
      expect(updatedControl.dirtyBounds).toEqual({
        maxX: 438,
        maxZ: 438,
        minX: -158,
        minZ: -158
      });
      expect(getChunkCount(repository)).toBe(1);

      const islands = repository.listDerivedIslands(created.id);
      expect(islands).toHaveLength(1);

      const updatedIsland = repository.updateDerivedIslandMetadata({
        defaultFaction: 'red',
        defaultOwner: 'admin',
        expectedRevision: 3,
        id: islands[0]!.id,
        mapId: created.id,
        name: 'Central Isle'
      });
      expect(updatedIsland.mapRevision).toBe(4);
      expect(updatedIsland.island.name).toBe('Central Isle');
      expect(getChunkCount(repository)).toBe(1);

      const deletedPolygon = repository.deleteSourcePolygon({
        expectedRevision: 4,
        id: createdPolygon.polygon.id,
        mapId: created.id
      });
      expect(deletedPolygon.mapRevision).toBe(5);
      expect(deletedPolygon.polygon.status).toBe('retired');
      expect(deletedPolygon.dirtyBounds).toEqual({
        maxX: 380,
        maxZ: 380,
        minX: -100,
        minZ: -100
      });
      expect(repository.listDerivedIslands(created.id)).toHaveLength(0);
    } finally {
      repository.close();
    }
  });

  test('stores wrapped tile overrides in canonical coordinates and removes default resets', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const map = repository.createMap({
        kind: 'wrapped-classic',
        generator: 'diamond-square',
        heightMeters: 640,
        seed: 'wrapped-edits',
        widthMeters: 960
      });

      const updated = repository.updateMapTiles({
        edits: [
          {
            colorIndex: 0,
            heightSteps: 2,
            tileX: -1,
            tileZ: 1,
            typeId: 'landing-pad'
          }
        ],
        expectedRevision: 0,
        mapId: map.id
      });

      expect(updated.mapRevision).toBe(1);
      expect(updated.dirtyBounds).toEqual({
        maxX: 960,
        maxZ: 20,
        minX: 950,
        minZ: 10
      });

      const chunk = repository.getMapChunk(map.id, 2, 0);
      expect(chunk?.layers.tileHeightStep?.encoding).toBe('int8');
      expect(chunk?.layers.tileType?.encoding).toBe('uint8');
      expect(chunk?.layers.tileColor?.encoding).toBe('uint8');
      expect(chunk?.tileHeightSteps?.[63]).toBe(2);
      expect(chunk?.tileTypeIndexes?.[63]).toBe(1);
      expect(chunk?.tileColorIndexes?.[63]).toBe(0);

      const reset = repository.updateMapTiles({
        edits: [
          {
            colorIndex: null,
            heightSteps: 0,
            tileX: -1,
            tileZ: 1,
            typeId: 'normal'
          }
        ],
        expectedRevision: 1,
        mapId: map.id
      });

      expect(reset.mapRevision).toBe(2);
      expect(repository.getMapChunk(map.id, 2, 0)?.tileHeightSteps).toBeUndefined();
    } finally {
      repository.close();
    }
  });

  test('supports tile overrides for infinite maps and exported finite slices', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const infinite = repository.createMap({
        kind: 'infinite-vector',
        name: 'Infinite Tiles',
        seed: 'infinite-tiles'
      });

      const updatedInfinite = repository.updateMapTiles({
        edits: [
          {
            colorIndex: null,
            heightSteps: -1,
            tileX: -3,
            tileZ: 4,
            typeId: 'landing-pad'
          }
        ],
        expectedRevision: 0,
        mapId: infinite.id
      });

      expect(updatedInfinite.mapRevision).toBe(1);
      const infiniteChunk = repository.getMapChunk(infinite.id, -1, 0);
      expect(infiniteChunk?.tileHeightSteps?.[157]).toBe(-1);
      expect(infiniteChunk?.tileTypeIndexes?.[157]).toBe(1);

      const exported = repository.createMapExport({
        bounds: {
          maxX: 320,
          maxZ: 320,
          minX: 0,
          minZ: 0
        },
        chunkSizeTiles: 32,
        expectedRevision: 1,
        kind: 'finite-vector-slice',
        mapId: infinite.id,
        metersPerTile: 10,
        name: 'Slice'
      });

      const updatedSlice = repository.updateMapTiles({
        edits: [
          {
            colorIndex: 0,
            heightSteps: 1,
            tileX: 0,
            tileZ: 0,
            typeId: 'landing-pad'
          }
        ],
        expectedRevision: 0,
        mapId: exported.id
      });

      expect(updatedSlice.mapRevision).toBe(1);
      expect(updatedSlice.dirtyBounds).toEqual({
        maxX: 10,
        maxZ: 10,
        minX: 0,
        minZ: 0
      });
      expect(repository.getMapChunk(exported.id, 0, 0)?.tileHeightSteps?.[0]).toBe(1);

      expect(() =>
        repository.updateMapTiles({
          edits: [
            {
              colorIndex: null,
              heightSteps: 0,
              tileX: 40,
              tileZ: 0,
              typeId: 'normal'
            }
          ],
          expectedRevision: 1,
          mapId: exported.id
        })
      ).toThrow(MapRepositoryError);
    } finally {
      repository.close();
    }
  });

  test('supports boolean xor fan-out and rejects hole-producing results atomically', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Boolean World',
        seed: 'boolean-seed'
      });

      const left = repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: created.id,
        params: polygonParams,
        vertices: square(0, 0, 180, 180)
      });
      const right = repository.createSourcePolygon({
        expectedRevision: 1,
        mapId: created.id,
        params: polygonParams,
        vertices: square(120, 0, 300, 180)
      });

      const xorResult = repository.applyBoolean({
        expectedRevision: 2,
        mapId: created.id,
        operation: 'xor',
        polygonIds: [left.polygon.id, right.polygon.id]
      });

      expect(xorResult.createdPolygons).toHaveLength(2);
      expect(xorResult.dirtyBounds).toEqual({
        maxX: 318,
        maxZ: 198,
        minX: -18,
        minZ: -18
      });
      expect(xorResult.retiredPolygonIds).toEqual([
        left.polygon.id,
        right.polygon.id
      ]);
      expect(repository.listSourcePolygons(created.id, 'active')).toHaveLength(
        2
      );
      expect(repository.listSourcePolygons(created.id)).toHaveLength(4);

      const rejectMap = repository.createMap({
        kind: 'infinite-vector',
        name: 'Reject Holes',
        seed: 'reject-seed'
      });

      const outer = repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: rejectMap.id,
        params: polygonParams,
        vertices: square(0, 0, 300, 300)
      });
      const inner = repository.createSourcePolygon({
        expectedRevision: 1,
        mapId: rejectMap.id,
        params: polygonParams,
        vertices: square(80, 80, 220, 220)
      });

      expect(() =>
        repository.applyBoolean({
          expectedRevision: 2,
          mapId: rejectMap.id,
          operation: 'difference',
          polygonIds: [outer.polygon.id, inner.polygon.id]
        })
      ).toThrow(MapRepositoryError);

      expect(rejectMap.id).toBeTruthy();
      expect(
        repository.listSourcePolygons(rejectMap.id, 'active')
      ).toHaveLength(2);
      expect(repository.getMap(rejectMap.id)?.revision).toBe(2);
    } finally {
      repository.close();
    }
  });

  test('bootstraps static entity tables and enforces catalog constraints', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      expect(hasTable(repository, 'asset_versions')).toBe(true);
      expect(hasTable(repository, 'zarch_runtime_entities')).toBe(true);
      expect(hasTable(repository, 'archetypes')).toBe(true);
      expect(hasTable(repository, 'map_static_entities')).toBe(true);

      const assetVersion = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 16,
          heightMeters: 22,
          widthMeters: 18
        },
        collisionClass: 'building-solid',
        diagnostics: [],
        footprint: {
          depthMeters: 16,
          widthMeters: 18
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'warehouse-v1',
        instancingEligible: false,
        maxHeightDeltaMeters: 1.5,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/warehouse.glb',
          sizeBytes: 1000
        },
        runtimeFile: null,
        status: 'uploaded'
      });
      expect(repository.listAssetVersions()).toEqual([assetVersion]);
      expect(repository.getAssetVersion(assetVersion.id)).toEqual(assetVersion);

      const updatedAssetVersion = repository.updateAssetVersion({
        diagnostics: ['normalized'],
        id: assetVersion.id,
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/warehouse-v1.glb',
          sizeBytes: 1200
        },
        status: 'review'
      });
      expect(updatedAssetVersion.status).toBe('review');
      expect(updatedAssetVersion.runtimeFile?.path).toBe(
        'runtime/warehouse-v1.glb'
      );

      const reviewedAssetVersion = repository.reviewAssetVersion({
        collisionBox: {
          depthMeters: 14,
          heightMeters: 24,
          widthMeters: 19
        },
        diagnostics: ['normalized', 'reviewed by admin'],
        footprint: {
          depthMeters: 14,
          widthMeters: 19
        },
        id: assetVersion.id,
        instancingEligible: true,
        maxHeightDeltaMeters: 1.25
      });
      expect(reviewedAssetVersion.footprint.widthMeters).toBe(19);
      expect(reviewedAssetVersion.instancingEligible).toBe(true);

      expect(() =>
        repository.createArchetype({
          assetVersionId: assetVersion.id,
          category: 'industrial',
          id: 'warehouse-before-ready',
          name: 'Warehouse Before Ready',
          status: 'active',
          tags: []
        })
      ).toThrow(MapRepositoryError);

      const readyAssetVersion = repository.approveAssetVersion(assetVersion.id);
      expect(readyAssetVersion.status).toBe('ready');

      expect(() =>
        repository.reviewAssetVersion({
          id: assetVersion.id,
          maxHeightDeltaMeters: 2
        })
      ).toThrow(MapRepositoryError);

      expect(() =>
        repository.updateAssetVersion({
          id: assetVersion.id,
          maxHeightDeltaMeters: 2
        })
      ).toThrow(MapRepositoryError);

      const archetype = repository.createArchetype({
        assetVersionId: assetVersion.id,
        category: 'industrial',
        id: 'warehouse',
        name: 'Warehouse',
        status: 'active',
        tags: ['cargo']
      });
      expect(repository.listArchetypes()).toEqual([archetype]);
      expect(repository.listArchetypes('active')).toEqual([archetype]);
      expect(repository.getArchetype(archetype.id)).toEqual(archetype);

      const updatedArchetype = repository.updateArchetype({
        category: 'building',
        id: archetype.id,
        name: 'Warehouse Depot',
        status: 'deprecated',
        tags: ['cargo', 'legacy']
      });
      expect(updatedArchetype.name).toBe('Warehouse Depot');
      expect(updatedArchetype.category).toBe('building');
      expect(updatedArchetype.status).toBe('deprecated');
      expect(updatedArchetype.tags).toEqual(['cargo', 'legacy']);
      expect(
        new Date(updatedArchetype.updatedAt).getTime()
      ).toBeGreaterThanOrEqual(new Date(archetype.updatedAt).getTime());
      expect(repository.listArchetypes('deprecated')).toEqual([
        updatedArchetype
      ]);

      expect(() =>
        repository.updateArchetype({
          id: 'missing-archetype',
          name: 'Missing'
        })
      ).toThrow(MapRepositoryError);

      expect(() =>
        repository.createArchetype({
          assetVersionId: assetVersion.id,
          category: 'industrial',
          id: 'warehouse-copy',
          name: 'Warehouse Copy',
          status: 'active',
          tags: []
        })
      ).toThrow(MapRepositoryError);

      expect(() =>
        repository.createArchetype({
          assetVersionId: 'missing-asset-version',
          category: 'industrial',
          id: 'bad-archetype',
          name: 'Broken',
          status: 'active',
          tags: []
        })
      ).toThrow(MapRepositoryError);

      const map = repository.createMap({
        kind: 'infinite-vector',
        name: 'Referenced subset map',
        seed: 'subset-seed'
      });

      expect(repository.listReferencedArchetypes(map.id)).toEqual([]);

      const activeArchetype = repository.updateArchetype({
        id: archetype.id,
        status: 'active'
      });

      repository.createStaticEntity({
        archetypeId: activeArchetype.id,
        expectedRevision: 0,
        id: 'warehouse-1',
        label: null,
        mapId: map.id,
        position: {
          x: 0,
          z: 0
        },
        rotation: {
          yaw: 0
        },
        scale: 1,
        state: 'active',
        yOffset: 0
      });

      const archivedArchetype = repository.updateArchetype({
        id: activeArchetype.id,
        status: 'archived'
      });

      expect(repository.listReferencedArchetypes(map.id)).toEqual([
        archivedArchetype
      ]);
      expect(() => repository.listReferencedArchetypes('missing-map')).toThrow(
        MapRepositoryError
      );
    } finally {
      repository.close();
    }
  });

  test('tracks static entity mutations in map revision and chunk payloads', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const map = repository.createMap({
        kind: 'infinite-vector',
        name: 'Static entity world',
        seed: 'entity-seed'
      });
      const assetVersion = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 20,
          heightMeters: 30,
          widthMeters: 20
        },
        collisionClass: 'building-solid',
        diagnostics: ['review pending'],
        footprint: {
          depthMeters: 20,
          widthMeters: 20
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'watchtower-v1',
        instancingEligible: true,
        maxHeightDeltaMeters: 2,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/watchtower.glb',
          sizeBytes: 1234
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/watchtower.glb',
          sizeBytes: 2345
        },
        status: 'ready'
      });
      const archetype = repository.createArchetype({
        assetVersionId: assetVersion.id,
        category: 'landmark',
        id: 'watchtower',
        name: 'Watchtower',
        status: 'active',
        tags: ['stone']
      });

      const created = repository.createStaticEntity({
        archetypeId: archetype.id,
        expectedRevision: 0,
        label: null,
        mapId: map.id,
        position: {
          x: 315,
          z: 20
        },
        rotation: {
          yaw: 45
        },
        scale: 1,
        state: 'active',
        yOffset: 0.5
      });
      expect(created.mapRevision).toBe(1);
      expect(created.result.id).toBe('watchtower-1');

      const chunk = repository.getMapChunk(map.id, 0, 0);
      expect(chunk?.staticEntities).toHaveLength(1);
      expect(chunk?.staticEntities[0]?.id).toBe('watchtower-1');
      expect(repository.getMapChunk(map.id, 1, 0)?.staticEntities).toHaveLength(1);

      const binaryChunk = repository.getMapChunkBinary(map.id, 0, 0);
      expect(binaryChunk?.staticEntities).toHaveLength(1);
      expect(binaryChunk?.staticEntities[0]?.rotation.yaw).toBe(45);

      const createdWithGeneratedSuffix = repository.createStaticEntity({
        archetypeId: archetype.id,
        expectedRevision: 1,
        label: 'South tower',
        mapId: map.id,
        position: {
          x: 32,
          z: 48
        },
        rotation: {
          yaw: 0
        },
        scale: 1,
        state: 'active',
        yOffset: 0
      });
      expect(createdWithGeneratedSuffix.result.id).toBe('watchtower-2');

      expect(repository.listStaticEntityItems(map.id)).toEqual([
        {
          archetype: {
            assetVersionId: assetVersion.id,
            category: 'landmark',
            id: archetype.id,
            name: 'Watchtower',
            status: 'active'
          },
          entity: created.result
        },
        {
          archetype: {
            assetVersionId: assetVersion.id,
            category: 'landmark',
            id: archetype.id,
            name: 'Watchtower',
            status: 'active'
          },
          entity: createdWithGeneratedSuffix.result
        }
      ]);

      const updated = repository.updateStaticEntity({
        expectedRevision: 2,
        id: 'watchtower-1',
        mapId: map.id,
        position: {
          x: 360,
          z: 15
        },
        rotation: {
          yaw: 90
        },
        state: 'disabled'
      });
      expect(updated.mapRevision).toBe(3);
      expect(updated.result.state).toBe('disabled');

      expect(repository.getMapChunk(map.id, 0, 0)?.staticEntities).toHaveLength(
        1
      );
      expect(repository.getMapChunk(map.id, 1, 0)?.staticEntities).toHaveLength(
        1
      );

      expect(() =>
        repository.createStaticEntity({
          archetypeId: 'missing-archetype',
          expectedRevision: 3,
          id: 'broken',
          label: null,
          mapId: map.id,
          position: {
            x: 0,
            z: 0
          },
          rotation: {
            yaw: 0
          },
          scale: 1,
          state: 'active',
          yOffset: 0
        })
      ).toThrow(MapRepositoryError);

      expect(() =>
        repository.createStaticEntity({
          archetypeId: archetype.id,
          expectedRevision: 3,
          id: 'watchtower-2',
          label: 'Duplicate',
          mapId: map.id,
          position: {
            x: 0,
            z: 0
          },
          rotation: {
            yaw: 0
          },
          scale: 1,
          state: 'active',
          yOffset: 0
        })
      ).toThrow(MapRepositoryError);

      repository.updateArchetype({
        id: archetype.id,
        status: 'archived'
      });
      expect(repository.listStaticEntityItems(map.id)[0]?.archetype.status).toBe(
        'archived'
      );
      expect(() =>
        repository.createStaticEntity({
          archetypeId: archetype.id,
          expectedRevision: 3,
          label: null,
          mapId: map.id,
          position: {
            x: 64,
            z: 64
          },
          rotation: {
            yaw: 0
          },
          scale: 1,
          state: 'active',
          yOffset: 0
        })
      ).toThrow(MapRepositoryError);
      expect(() =>
        repository.updateStaticEntity({
          expectedRevision: 3,
          id: 'watchtower-1',
          mapId: map.id,
          state: 'active'
        })
      ).toThrow(MapRepositoryError);

      const deleted = repository.deleteStaticEntity({
        expectedRevision: 3,
        id: 'watchtower-1',
        mapId: map.id
      });
      expect(deleted.mapRevision).toBe(4);
      expect(repository.listStaticEntities(map.id)).toHaveLength(1);
      expect(repository.getMap(map.id)?.revision).toBe(4);
    } finally {
      repository.close();
    }
  });

  test('creates immutable exported finite slices from infinite-vector maps', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Export World',
        seed: 'export-seed'
      });

      repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: created.id,
        params: polygonParams,
        vertices: square(0, 0, 320, 320)
      });

      const beforeExportChunk = repository.getMapChunk(created.id, 0, 0);
      expect(beforeExportChunk).not.toBeNull();

      const exported = repository.createMapExport({
        bounds: {
          maxX: 320,
          maxZ: 320,
          minX: 0,
          minZ: 0
        },
        chunkSizeTiles: 16,
        expectedRevision: 1,
        kind: 'finite-vector-slice',
        mapId: created.id,
        metersPerTile: 10,
        name: 'Playable Slice'
      });

      expect(exported.kind).toBe('finite-vector-slice');
      expect(exported.export?.sourceMapId).toBe(created.id);
      expect(exported.export?.sourceRevision).toBe(1);
      expect(exported.extent.kind).toBe('finite');
      expect(isFiniteMap(exported)).toBe(true);
      if (!isFiniteMap(exported)) {
        throw new Error('Expected exported map to be finite');
      }
      expect(exported.extent.widthTiles).toBe(32);
      expect(repository.listExports(created.id)).toHaveLength(1);
      expect(repository.findExport(exported.id)?.id).toBe(exported.id);
      expect(repository.getMapChunk(exported.id, -1, 0)).toBeNull();
      expect(repository.getMapChunk(exported.id, 2, 0)).toBeNull();

      const exportedChunk = repository.getMapChunk(exported.id, 0, 0);
      expect(exportedChunk).not.toBeNull();
      expect(exportedChunk?.mapId).toBe(exported.id);

      const snapshotCount =
        repository.db
          .query<
            { count: number },
            [string]
          >('SELECT COUNT(*) AS count FROM map_derived_islands WHERE map_id = ?')
          .get(exported.id)?.count ?? 0;
      expect(snapshotCount).toBeGreaterThan(0);

      expect(() =>
        repository.createMapExport({
          bounds: {
            maxX: 320,
            maxZ: 320,
            minX: 0,
            minZ: 0
          },
          chunkSizeTiles: 16,
          expectedRevision: 0,
          kind: 'finite-vector-slice',
          mapId: created.id,
          metersPerTile: 10
        })
      ).toThrow(MapRepositoryError);

      repository.createControlPoint({
        elevationMeters: 120,
        expectedRevision: 1,
        influenceMeters: 120,
        mapId: created.id,
        strength: 1,
        type: 'peak',
        x: 160,
        z: 160
      });

      expect(repository.findExport(exported.id)?.export?.sourceRevision).toBe(
        1
      );
      expect(repository.getMapChunk(exported.id, 0, 0)?.heights).toEqual(
        exportedChunk?.heights
      );
      expect(repository.getMapChunk(created.id, 0, 0)?.heights).not.toEqual(
        beforeExportChunk?.heights
      );
    } finally {
      repository.close();
    }
  });

  test('creates and rebinds zarch runtime entities against ready asset versions', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const uploaded = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 8,
          heightMeters: 4,
          widthMeters: 18
        },
        collisionClass: 'vehicle-light',
        diagnostics: [],
        footprint: {
          depthMeters: 8,
          widthMeters: 18
        },
        groundingPolicy: 'none',
        id: 'zarch-player-ship-v0',
        instancingEligible: false,
        maxHeightDeltaMeters: 0,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/zarch-player-ship-v0.glb',
          sizeBytes: 1024
        },
        runtimeFile: null,
        status: 'uploaded'
      });

      expect(() =>
        repository.upsertZarchRuntimeEntity({
          assetVersionId: uploaded.id,
          id: 'zarch-player-ship',
          kind: 'player-ship',
          name: 'Zarch Player Ship',
          renderDimensions: {
            lengthMeters: 18
          },
          status: 'active'
        })
      ).toThrow(MapRepositoryError);

      const firstReady = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 8,
          heightMeters: 4,
          widthMeters: 18
        },
        collisionClass: 'vehicle-light',
        diagnostics: [],
        footprint: {
          depthMeters: 8,
          widthMeters: 18
        },
        groundingPolicy: 'none',
        id: 'zarch-player-ship-v1',
        instancingEligible: false,
        maxHeightDeltaMeters: 0,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/zarch-player-ship-v1.glb',
          sizeBytes: 1024
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/zarch-player-ship-v1.glb',
          sizeBytes: 2048
        },
        status: 'ready'
      });

      const runtimeEntity = repository.upsertZarchRuntimeEntity({
        assetVersionId: firstReady.id,
        id: 'zarch-player-ship',
        kind: 'player-ship',
        name: 'Zarch Player Ship',
        renderDimensions: {
          lengthMeters: 18
        },
        status: 'active'
      });

      expect(repository.getZarchRuntimeEntity(runtimeEntity.id)).toEqual(
        runtimeEntity
      );
      expect(repository.listZarchRuntimeEntities()).toEqual([runtimeEntity]);

      const secondReady = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 8,
          heightMeters: 5,
          widthMeters: 18
        },
        collisionClass: 'vehicle-light',
        diagnostics: [],
        footprint: {
          depthMeters: 8,
          widthMeters: 18
        },
        groundingPolicy: 'none',
        id: 'zarch-player-ship-v2',
        instancingEligible: false,
        maxHeightDeltaMeters: 0,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/zarch-player-ship-v2.glb',
          sizeBytes: 1024
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/zarch-player-ship-v2.glb',
          sizeBytes: 2048
        },
        status: 'ready'
      });

      const rebound = repository.upsertZarchRuntimeEntity({
        assetVersionId: secondReady.id,
        id: runtimeEntity.id,
        kind: runtimeEntity.kind,
        name: runtimeEntity.name,
        renderDimensions: {
          lengthMeters: 18
        },
        status: 'active'
      });

      expect(rebound.assetVersionId).toBe(secondReady.id);
      expect(repository.listZarchRuntimeEntities('active')).toEqual([rebound]);
    } finally {
      repository.close();
    }
  });

  test('archives assets and only deletes unreferenced asset versions', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const referenced = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 12,
          heightMeters: 12,
          widthMeters: 12
        },
        collisionClass: 'building-solid',
        diagnostics: [],
        footprint: {
          depthMeters: 12,
          widthMeters: 12
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'referenced-v1',
        instancingEligible: false,
        maxHeightDeltaMeters: 1,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/referenced.glb',
          sizeBytes: 100
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/referenced.glb',
          sizeBytes: 100
        },
        status: 'ready'
      });

      repository.createArchetype({
        assetVersionId: referenced.id,
        category: 'building',
        id: 'referenced-archetype',
        name: 'Referenced Archetype',
        status: 'active',
        tags: []
      });

      expect(repository.archiveAssetVersion(referenced.id).status).toBe('archived');
      expect(repository.listAssetVersionItems('archived')).toHaveLength(1);
      expect(() => repository.deleteAssetVersion(referenced.id)).toThrow(
        MapRepositoryError
      );

      const unreferenced = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 10,
          heightMeters: 8,
          widthMeters: 10
        },
        collisionClass: 'prop',
        diagnostics: [],
        footprint: {
          depthMeters: 10,
          widthMeters: 10
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'free-v1',
        instancingEligible: false,
        maxHeightDeltaMeters: 1,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/free.glb',
          sizeBytes: 100
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/free.glb',
          sizeBytes: 100
        },
        status: 'ready'
      });

      const deleted = repository.deleteAssetVersion(unreferenced.id);
      expect(deleted.id).toBe(unreferenced.id);
      expect(repository.getAssetVersion(unreferenced.id)).toBeNull();
    } finally {
      repository.close();
    }
  });

  test('snapshots overlapping static entities and manifest hashes into exports', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Static export world',
        seed: 'static-export-seed'
      });
      const watchtowerAsset = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 24,
          heightMeters: 32,
          widthMeters: 24
        },
        collisionClass: 'building-solid',
        diagnostics: [],
        footprint: {
          depthMeters: 24,
          widthMeters: 24
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'watchtower-v1',
        instancingEligible: true,
        maxHeightDeltaMeters: 1,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/watchtower.glb',
          sizeBytes: 256
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/watchtower-v1.glb',
          sizeBytes: 128
        },
        status: 'ready'
      });
      const windmillAsset = repository.createAssetVersion({
        collisionBox: {
          depthMeters: 20,
          heightMeters: 28,
          widthMeters: 20
        },
        collisionClass: 'building-solid',
        diagnostics: [],
        footprint: {
          depthMeters: 20,
          widthMeters: 20
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'windmill-v1',
        instancingEligible: false,
        maxHeightDeltaMeters: 1,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/windmill.glb',
          sizeBytes: 200
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/windmill-v1.glb',
          sizeBytes: 150
        },
        status: 'ready'
      });
      const watchtower = repository.createArchetype({
        assetVersionId: watchtowerAsset.id,
        category: 'landmark',
        id: 'watchtower',
        name: 'Watchtower',
        status: 'active',
        tags: ['stone', 'coastal']
      });
      const windmill = repository.createArchetype({
        assetVersionId: windmillAsset.id,
        category: 'industrial',
        id: 'windmill',
        name: 'Windmill',
        status: 'active',
        tags: ['farm']
      });

      repository.createStaticEntity({
        archetypeId: windmill.id,
        expectedRevision: 0,
        id: 'windmill-edge',
        label: 'Edge windmill',
        mapId: created.id,
        position: {
          x: 405,
          z: 90
        },
        rotation: {
          yaw: 0
        },
        scale: 1,
        state: 'active',
        yOffset: 0
      });
      repository.createStaticEntity({
        archetypeId: watchtower.id,
        expectedRevision: 1,
        id: 'watchtower-center',
        label: null,
        mapId: created.id,
        position: {
          x: 100,
          z: 100
        },
        rotation: {
          yaw: 45
        },
        scale: 1,
        state: 'active',
        yOffset: 0.5
      });
      repository.createStaticEntity({
        archetypeId: watchtower.id,
        expectedRevision: 2,
        id: 'watchtower-outside',
        label: null,
        mapId: created.id,
        position: {
          x: 450,
          z: 90
        },
        rotation: {
          yaw: 0
        },
        scale: 1,
        state: 'disabled',
        yOffset: 0
      });

      const exported = repository.createMapExport({
        bounds: {
          maxX: 400,
          maxZ: 360,
          minX: 80,
          minZ: 40
        },
        chunkSizeTiles: 16,
        expectedRevision: 3,
        kind: 'finite-vector-slice',
        mapId: created.id,
        metersPerTile: 10,
        name: 'Static Slice'
      });

      expect(exported.export?.staticEntities?.entityCount).toBe(2);
      expect(exported.export?.staticEntities?.archetypeCount).toBe(2);
      expect(exported.export?.staticEntities?.manifest.map(entry => entry.archetype.id)).toEqual([
        'watchtower',
        'windmill'
      ]);

      const manifest = exported.export?.staticEntities?.manifest ?? [];
      const expectedHash = createHash('sha256')
        .update(stringifyStaticEntityExportManifest(manifest))
        .digest('hex');
      expect(exported.export?.staticEntities?.fullManifestHash).toBe(
        expectedHash
      );

      const exportedEntities = repository.listStaticEntities(exported.id);
      expect(
        exportedEntities.map(entity => entity.id).sort((left, right) =>
          left.localeCompare(right)
        )
      ).toEqual(['watchtower-center', 'windmill-edge']);
      expect(
        exportedEntities.find(entity => entity.id === 'watchtower-center')
      ).toMatchObject({
        position: {
          x: 20,
          z: 60
        }
      });
      expect(
        exportedEntities.find(entity => entity.id === 'windmill-edge')
      ).toMatchObject({
        position: {
          x: 325,
          z: 50
        }
      });

      expect(
        repository.getMapChunk(exported.id, 0, 0)?.staticEntities.map(
          entity => entity.id
        )
      ).toEqual(['watchtower-center']);
      expect(
        repository.getMapChunk(exported.id, 1, 0)?.staticEntities.map(
          entity => entity.id
        )
      ).toContain('windmill-edge');

      const listedExport = repository.listExports(created.id)[0];
      expect(listedExport?.export?.staticEntities?.manifest).toBeUndefined();
      expect(listedExport?.export?.staticEntities?.entityCount).toBe(2);

      expect(
        repository.findExport(exported.id)?.export?.staticEntities?.manifest
      ).toEqual(manifest);
      expect(repository.getMap(exported.id)?.export?.staticEntities?.manifest).toEqual(
        manifest
      );
    } finally {
      repository.close();
    }
  });

  test('stores a stable empty static-entity manifest hash for exports without entities', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Empty export world',
        seed: 'empty-export-seed'
      });

      const exported = repository.createMapExport({
        bounds: {
          maxX: 320,
          maxZ: 320,
          minX: 0,
          minZ: 0
        },
        chunkSizeTiles: 16,
        expectedRevision: 0,
        kind: 'finite-vector-slice',
        mapId: created.id,
        metersPerTile: 10,
        name: 'Empty Slice'
      });

      expect(exported.export?.staticEntities).toEqual({
        archetypeCount: 0,
        entityCount: 0,
        fullManifestHash: createHash('sha256').update('[]').digest('hex'),
        manifest: []
      });
      expect(
        repository.listExports(created.id)[0]?.export?.staticEntities?.manifest
      ).toBeUndefined();
    } finally {
      repository.close();
    }
  });

  test('keeps derived island ids stable across merges and splits and records lineage', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Lineage World',
        seed: 'lineage-seed'
      });

      const large = repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: created.id,
        params: polygonParams,
        vertices: square(0, 0, 200, 200)
      });
      const small = repository.createSourcePolygon({
        expectedRevision: 1,
        mapId: created.id,
        params: polygonParams,
        vertices: square(230, 0, 310, 120)
      });

      const initialIslands = repository.listDerivedIslands(created.id);
      expect(initialIslands).toHaveLength(2);
      const largeIsland = initialIslands.find(island =>
        island.sourcePolygonIds.includes(large.polygon.id)
      );
      const smallIsland = initialIslands.find(island =>
        island.sourcePolygonIds.includes(small.polygon.id)
      );
      expect(largeIsland).toBeDefined();
      expect(smallIsland).toBeDefined();

      const merged = repository.updateSourcePolygon({
        expectedRevision: 2,
        id: small.polygon.id,
        mapId: created.id,
        vertices: square(170, 0, 250, 120)
      });
      expect(merged.mapRevision).toBe(3);

      const mergedIslands = repository.listDerivedIslands(created.id);
      expect(mergedIslands).toHaveLength(1);
      expect(mergedIslands[0]?.id).toBe(largeIsland?.id);

      const split = repository.updateSourcePolygon({
        expectedRevision: 3,
        id: small.polygon.id,
        mapId: created.id,
        vertices: square(220, 0, 320, 120)
      });
      expect(split.mapRevision).toBe(4);

      const splitIslands = repository.listDerivedIslands(created.id);
      expect(splitIslands).toHaveLength(2);
      expect(splitIslands.some(island => island.id === largeIsland?.id)).toBe(
        true
      );
      expect(splitIslands.some(island => island.id === smallIsland?.id)).toBe(
        false
      );

      const lineage = repository.listDerivedIslandLineage(created.id);
      expect(lineage.some(row => row.operation === 'merge')).toBe(true);
      expect(lineage.some(row => row.operation === 'split')).toBe(true);
    } finally {
      repository.close();
    }
  });

  test('generates deterministic infinite-vector chunks with seam-aligned borders and signed coordinates', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Chunk World',
        seed: 'chunk-seed'
      });

      repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: created.id,
        params: {
          maxDisplacementMeters: 24,
          noiseScaleMeters: 72,
          roughness: 0.7
        },
        vertices: square(-40, -40, 420, 220)
      });

      repository.createControlPoint({
        elevationMeters: 110,
        expectedRevision: 1,
        influenceMeters: 180,
        mapId: created.id,
        strength: 1,
        type: 'peak',
        x: 120,
        z: 120
      });

      const chunkA = repository.getMapChunk(created.id, 0, 0);
      const chunkB = repository.getMapChunk(created.id, 0, 0);
      const adjacent = repository.getMapChunk(created.id, 1, 0);
      const negative = repository.getMapChunk(created.id, -1, 0);

      expect(chunkA?.heights).toEqual(chunkB?.heights);
      expect(adjacent?.chunkX).toBe(1);
      expect(negative?.chunkX).toBe(-1);

      for (let row = 0; row < 33; row += 1) {
        expect(chunkA?.heights[row * 33 + 32]).toBe(
          adjacent?.heights[row * 33]
        );
      }
    } finally {
      repository.close();
    }
  });

  test('returns authored overview bounds, counts, and stable clusters', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Overview World',
        seed: 'overview-seed'
      });

      repository.createSourcePolygon({
        expectedRevision: 0,
        mapId: created.id,
        params: polygonParams,
        vertices: square(0, 0, 180, 180)
      });
      repository.createControlPoint({
        elevationMeters: 80,
        expectedRevision: 1,
        influenceMeters: 90,
        mapId: created.id,
        strength: 1,
        type: 'plain',
        x: 100,
        z: 100
      });
      repository.createSourcePolygon({
        expectedRevision: 2,
        mapId: created.id,
        params: polygonParams,
        vertices: square(2000, 2000, 2200, 2200)
      });

      const overview = repository.getOverview(created.id);
      expect(overview.revision).toBe(3);
      expect(overview.counts.sourcePolygons).toBe(2);
      expect(overview.counts.controlPoints).toBe(1);
      expect(overview.counts.derivedIslands).toBe(2);
      expect(overview.clusters).toHaveLength(2);
      expect(overview.bounds?.minX).toBe(0);
      expect(overview.bounds?.maxX).toBe(2200);
    } finally {
      repository.close();
    }
  });
});
