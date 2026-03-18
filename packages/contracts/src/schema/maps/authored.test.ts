import { describe, expect, test } from 'bun:test';

import {
  ApplyBooleanInput,
  CreateControlPointInput,
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
});
