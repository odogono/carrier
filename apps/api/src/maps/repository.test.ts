import { describe, expect, test } from 'bun:test';

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
      expect(xorResult.retiredPolygonIds).toEqual([left.polygon.id, right.polygon.id]);
      expect(repository.listSourcePolygons(created.id, 'active')).toHaveLength(2);
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
      expect(repository.listSourcePolygons(rejectMap.id, 'active')).toHaveLength(2);
      expect(repository.getMap(rejectMap.id)?.revision).toBe(2);
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
      expect(splitIslands.some(island => island.id === largeIsland?.id)).toBe(true);
      expect(splitIslands.some(island => island.id === smallIsland?.id)).toBe(false);

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
        expect(chunkA?.heights[row * 33 + 32]).toBe(adjacent?.heights[row * 33]);
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
