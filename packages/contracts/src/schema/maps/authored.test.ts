import { describe, expect, test } from 'bun:test';

import {
  ApplyBooleanOutput,
  ApplyBooleanInput,
  CreateControlPointOutput,
  CreateControlPointInput,
  CreateSourcePolygonOutput,
  CreateSourcePolygonInput,
  MapMetadataSchema,
  MapOverviewSchema
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
        extent: { kind: 'infinite' },
        id: 'map-1',
        kind: 'infinite-vector',
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
