import { describe, expect, test } from 'bun:test';

import {
  ApplyBooleanOutput,
  ApplyBooleanInput,
  ArchetypeCategorySchema,
  ArchetypeSchema,
  AssetVersionSchema,
  CreateMapExportInput,
  CreateControlPointOutput,
  CreateControlPointInput,
  CreateSourcePolygonOutput,
  CreateSourcePolygonInput,
  MapMetadataSchema,
  MapOverviewSchema,
  StaticEntitySchema
} from './index';

describe('authored map schemas', () => {
  test('validates authored write inputs and revision-bearing metadata', () => {
    expect(
      CreateSourcePolygonInput.parse({
        expectedRevision: 0,
        mapId: 'map-1',
        params: {
          maxDisplacementMeters: 12,
          noiseScaleMeters: 64,
          roughness: 0.5
        },
        vertices: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 }
        ]
      })
    ).toBeDefined();

    expect(() =>
      CreateSourcePolygonInput.parse({
        expectedRevision: 0,
        mapId: 'map-1',
        params: {
          maxDisplacementMeters: 12,
          noiseScaleMeters: 64,
          roughness: 0.5
        },
        vertices: [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 10, z: 10 }
        ]
      })
    ).toThrow();

    expect(
      CreateControlPointInput.parse({
        elevationMeters: 90,
        expectedRevision: 2,
        influenceMeters: 120,
        mapId: 'map-1',
        strength: 1,
        type: 'peak',
        x: 120,
        z: 40
      })
    ).toBeDefined();

    expect(
      ApplyBooleanInput.parse({
        expectedRevision: 3,
        mapId: 'map-1',
        operation: 'xor',
        polygonIds: ['a', 'b']
      }).operation
    ).toBe('xor');

    expect(
      MapMetadataSchema.parse({
        createdAt: new Date().toISOString(),
        extent: {
          heightMeters: 640,
          heightTiles: 64,
          kind: 'finite',
          widthMeters: 640,
          widthTiles: 64,
          wrapX: false,
          wrapZ: false
        },
        export: {
          bounds: {
            maxX: 640,
            maxZ: 640,
            minX: 0,
            minZ: 0
          },
          exportedAt: new Date().toISOString(),
          sourceMapId: 'source-1',
          sourceRevision: 2
        },
        id: 'map-1',
        kind: 'finite-vector-slice',
        name: 'World',
        resolution: {
          chunkSizeTiles: 32,
          metersPerTile: 10
        },
        revision: 4,
        seed: 'seed-1',
        updatedAt: new Date().toISOString()
      }).revision
    ).toBe(4);

    expect(
      CreateMapExportInput.parse({
        bounds: {
          maxX: 640,
          maxZ: 640,
          minX: 0,
          minZ: 0
        },
        chunkSizeTiles: 32,
        expectedRevision: 4,
        kind: 'finite-vector-slice',
        mapId: 'map-1',
        metersPerTile: 10
      }).kind
    ).toBe('finite-vector-slice');
  });

  test('validates overview payloads with nullable bounds', () => {
    expect(
      MapOverviewSchema.parse({
        bounds: null,
        clusters: [],
        counts: {
          controlPoints: 0,
          derivedIslands: 0,
          sourcePolygons: 0
        },
        mapId: 'map-1',
        revision: 0
      }).bounds
    ).toBeNull();
  });

  test('validates static entity catalog record shapes', () => {
    const now = new Date().toISOString();

    expect(
      AssetVersionSchema.parse({
        collisionBox: {
          depthMeters: 18,
          heightMeters: 24,
          widthMeters: 20
        },
        collisionClass: 'building-solid',
        createdAt: now,
        diagnostics: ['auto-derived footprint'],
        footprint: {
          depthMeters: 18,
          widthMeters: 20
        },
        groundingPolicy: 'terrain-average-footprint',
        id: 'watchtower-v1',
        instancingEligible: false,
        maxHeightDeltaMeters: 2.5,
        originalFile: {
          contentType: 'model/gltf-binary',
          path: 'uploads/watchtower/source.glb',
          sizeBytes: 1024
        },
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: 'runtime/watchtower/normalized.glb',
          sizeBytes: 2048
        },
        status: 'review',
        updatedAt: now
      }).status
    ).toBe('review');

    expect(
      ArchetypeSchema.parse({
        assetVersionId: 'watchtower-v1',
        category: 'landmark',
        createdAt: now,
        id: 'watchtower',
        name: 'Watchtower',
        status: 'active',
        tags: ['coastal', 'defensive'],
        updatedAt: now
      }).category
    ).toBe('landmark');

    expect(
      StaticEntitySchema.parse({
        archetypeId: 'watchtower',
        createdAt: now,
        id: 'watchtower-north',
        label: null,
        mapId: 'map-1',
        position: {
          x: 120,
          z: -40
        },
        rotation: {
          yaw: 90
        },
        scale: 1,
        state: 'active',
        updatedAt: now,
        yOffset: 0.25
      }).position
    ).toEqual({
      x: 120,
      z: -40
    });

    expect(() => ArchetypeCategorySchema.parse('bridge')).toThrow();
    expect(() =>
      StaticEntitySchema.parse({
        archetypeId: 'watchtower',
        createdAt: now,
        id: 'bad-entity',
        label: 'Bad entity',
        mapId: 'map-1',
        position: {
          x: 0,
          z: 0
        },
        rotation: {
          yaw: 0
        },
        scale: 0,
        state: 'active',
        updatedAt: now,
        yOffset: 0
      })
    ).toThrow();
  });

  test('validates terrain mutation outputs with dirty bounds', () => {
    const dirtyBounds = {
      maxX: 100,
      maxZ: 120,
      minX: -40,
      minZ: -60
    };

    expect(
      CreateSourcePolygonOutput.parse({
        dirtyBounds,
        mapRevision: 1,
        polygon: {
          bbox: dirtyBounds,
          createdAt: new Date().toISOString(),
          id: 'polygon-1',
          mapId: 'map-1',
          params: {
            maxDisplacementMeters: 12,
            noiseScaleMeters: 64,
            roughness: 0.5
          },
          retiredAt: null,
          status: 'active',
          updatedAt: new Date().toISOString(),
          vertices: [
            { x: -40, z: -60 },
            { x: 100, z: -60 },
            { x: 100, z: 120 }
          ]
        }
      }).dirtyBounds
    ).toEqual(dirtyBounds);

    expect(
      CreateControlPointOutput.parse({
        controlPoint: {
          createdAt: new Date().toISOString(),
          elevationMeters: 42,
          id: 'control-1',
          influenceMeters: 80,
          mapId: 'map-1',
          strength: 1,
          type: 'plain',
          updatedAt: new Date().toISOString(),
          x: 12,
          z: -8
        },
        dirtyBounds,
        mapRevision: 2
      }).dirtyBounds
    ).toEqual(dirtyBounds);

    expect(
      ApplyBooleanOutput.parse({
        createdPolygons: [],
        dirtyBounds,
        mapRevision: 3,
        retiredPolygonIds: ['polygon-1']
      }).dirtyBounds
    ).toEqual(dirtyBounds);
  });
});
