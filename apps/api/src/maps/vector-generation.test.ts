import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_SOURCE_POLYGON_PARAMS,
  normalizeSourcePolygonParams,
  type MapMetadata,
  type SourcePolygon
} from '../../../../packages/contracts/src/schema/maps';
import { MAP_WATER_LEVEL } from './generation';
import {
  clearCompiledVectorTerrainArtifact,
  generateVectorChunk,
  getCompiledVectorTerrainArtifact
} from './vector-generation';

const testMap = (id: string, seed: string): MapMetadata => ({
  createdAt: new Date().toISOString(),
  extent: { kind: 'infinite' },
  id,
  kind: 'infinite-vector',
  name: 'Vector Test',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed,
  updatedAt: new Date().toISOString()
});

const square = (
  id: string,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  interiorFill: number,
  overrides: Partial<SourcePolygon['params']> = {}
): SourcePolygon => ({
  bbox: {
    maxX,
    maxZ,
    minX,
    minZ
  },
  createdAt: new Date().toISOString(),
  id,
  mapId: 'map-1',
  params: normalizeSourcePolygonParams({
    ...DEFAULT_SOURCE_POLYGON_PARAMS,
    ...overrides,
    interiorFill
  }),
  retiredAt: null,
  status: 'active',
  updatedAt: new Date().toISOString(),
  vertices: [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ }
  ]
});

const countLandSamples = (heights: Float32Array) =>
  Array.from(heights).filter(height => height > MAP_WATER_LEVEL).length;

const sampleHeight = (
  heights: Float32Array,
  samplesWide: number,
  sampleX: number,
  sampleZ: number
) => heights[sampleZ * samplesWide + sampleX] ?? MAP_WATER_LEVEL;

describe('vector terrain generation', () => {
  test('higher interior fill raises near-shore terrain sooner for the same polygon', () => {
    const lowArtifact = getCompiledVectorTerrainArtifact({
      controlPoints: [],
      derivedIslands: [],
      map: testMap('map-low', 'fill-seed'),
      polygons: [
        square('polygon-low', 0, 0, 240, 240, 0.5, {
          maxDisplacementMeters: 0,
          roughness: 0
        })
      ],
      terrainRevision: 1
    });
    const legacyArtifact = getCompiledVectorTerrainArtifact({
      controlPoints: [],
      derivedIslands: [],
      map: testMap('map-legacy', 'fill-seed'),
      polygons: [
        square('polygon-legacy', 0, 0, 240, 240, 1, {
          maxDisplacementMeters: 0,
          roughness: 0
        })
      ],
      terrainRevision: 1
    });
    const defaultArtifact = getCompiledVectorTerrainArtifact({
      controlPoints: [],
      derivedIslands: [],
      map: testMap('map-default', 'fill-seed'),
      polygons: [
        square('polygon-default', 0, 0, 240, 240, 1.5, {
          maxDisplacementMeters: 0,
          roughness: 0
        })
      ],
      terrainRevision: 1
    });

    const lowChunk = generateVectorChunk(lowArtifact, 0, 0);
    const legacyChunk = generateVectorChunk(legacyArtifact, 0, 0);
    const defaultChunk = generateVectorChunk(defaultArtifact, 0, 0);
    const sampleX = 1;
    const sampleZ = 12;
    const lowHeight = sampleHeight(
      lowChunk.heights,
      lowChunk.samplesWide,
      sampleX,
      sampleZ
    );
    const legacyHeight = sampleHeight(
      legacyChunk.heights,
      legacyChunk.samplesWide,
      sampleX,
      sampleZ
    );
    const defaultHeight = sampleHeight(
      defaultChunk.heights,
      defaultChunk.samplesWide,
      sampleX,
      sampleZ
    );

    expect(lowHeight).toBeLessThan(legacyHeight);
    expect(legacyHeight).toBeLessThan(defaultHeight);
    expect(countLandSamples(defaultChunk.heights)).toBeGreaterThanOrEqual(
      countLandSamples(legacyChunk.heights)
    );

    clearCompiledVectorTerrainArtifact('map-low', 1);
    clearCompiledVectorTerrainArtifact('map-legacy', 1);
    clearCompiledVectorTerrainArtifact('map-default', 1);
  });

  test('very large interior fill values continue to increase fill beyond the default range', () => {
    const defaultArtifact = getCompiledVectorTerrainArtifact({
      controlPoints: [],
      derivedIslands: [],
      map: testMap('map-default-large', 'fill-seed-large'),
      polygons: [
        square('polygon-default-large', 0, 0, 240, 240, 1.5, {
          maxDisplacementMeters: 0,
          roughness: 0
        })
      ],
      terrainRevision: 1
    });
    const extremeArtifact = getCompiledVectorTerrainArtifact({
      controlPoints: [],
      derivedIslands: [],
      map: testMap('map-extreme-large', 'fill-seed-large'),
      polygons: [
        square('polygon-extreme-large', 0, 0, 240, 240, 400, {
          maxDisplacementMeters: 0,
          roughness: 0
        })
      ],
      terrainRevision: 1
    });

    const defaultChunk = generateVectorChunk(defaultArtifact, 0, 0);
    const extremeChunk = generateVectorChunk(extremeArtifact, 0, 0);
    const sampleX = 1;
    const sampleZ = 12;

    expect(
      sampleHeight(
        extremeChunk.heights,
        extremeChunk.samplesWide,
        sampleX,
        sampleZ
      )
    ).toBeGreaterThan(
      sampleHeight(
        defaultChunk.heights,
        defaultChunk.samplesWide,
        sampleX,
        sampleZ
      )
    );

    clearCompiledVectorTerrainArtifact('map-default-large', 1);
    clearCompiledVectorTerrainArtifact('map-extreme-large', 1);
  });

  test('connected polygons with different interior fill values still produce continuous land', () => {
    const artifact = getCompiledVectorTerrainArtifact({
      controlPoints: [],
      derivedIslands: [],
      map: testMap('map-joined', 'joined-fill-seed'),
      polygons: [
        square('polygon-left', 0, 0, 180, 180, 0.75),
        square('polygon-right', 140, 0, 320, 180, 2.25)
      ],
      terrainRevision: 1
    });

    const chunk = generateVectorChunk(artifact, 0, 0);

    expect(
      sampleHeight(chunk.heights, chunk.samplesWide, 8, 9)
    ).toBeGreaterThan(MAP_WATER_LEVEL);
    expect(
      sampleHeight(chunk.heights, chunk.samplesWide, 16, 9)
    ).toBeGreaterThan(MAP_WATER_LEVEL);
    expect(
      sampleHeight(chunk.heights, chunk.samplesWide, 24, 9)
    ).toBeGreaterThan(MAP_WATER_LEVEL);

    clearCompiledVectorTerrainArtifact('map-joined', 1);
  });
});
