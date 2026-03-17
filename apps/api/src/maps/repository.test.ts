import { describe, expect, test } from 'bun:test';

import { MapRepository } from './repository';

describe('map repository', () => {
  test('creates, lists, fetches, and deletes wrapped-classic maps with on-demand cached chunks', () => {
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

      expect(created.extent.kind).toBe('finite');
      if (created.extent.kind === 'finite') {
        expect(created.extent.widthMeters).toBe(960);
        expect(created.extent.heightMeters).toBe(640);
        expect(created.extent.wrapX).toBe(true);
        expect(created.extent.wrapZ).toBe(true);
      }

      const listed = repository.listMaps();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(created.id);

      const fetched = repository.getMap(created.id);
      expect(fetched?.seed).toBe('alpha-seed');
      expect(
        repository.db
          .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM map_chunks')
          .get()?.count
      ).toBe(0);

      const chunk = repository.getMapChunk(created.id, 2, 1);
      expect(chunk).not.toBeNull();
      expect(chunk?.tileWidth).toBe(32);
      expect(chunk?.tileHeight).toBe(32);
      expect(chunk?.samplesWide).toBe(33);
      expect(chunk?.samplesHigh).toBe(33);
      expect(
        repository.db
          .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM map_chunks')
          .get()?.count
      ).toBe(1);

      const aliasedChunk = repository.getMapChunk(created.id, -1, 1);
      expect(aliasedChunk).not.toBeNull();
      expect(Array.from(aliasedChunk!.heights)).toEqual(Array.from(chunk!.heights));

      expect(repository.deleteMap(created.id)).toBe(true);
      expect(repository.getMap(created.id)).toBeNull();
      expect(repository.getMapChunk(created.id, 0, 0)).toBeNull();
    } finally {
      repository.close();
    }
  });

  test('persists maps created with the island preset', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'wrapped-classic',
        generator: 'island-clusters',
        heightMeters: 960,
        name: 'Archipelago',
        seed: 'archipelago-seed',
        widthMeters: 1280
      });

      expect(created.generator).toBe('island-clusters');

      const fetched = repository.getMap(created.id);
      expect(fetched?.generator).toBe('island-clusters');
      expect(fetched?.seed).toBe('archipelago-seed');

      const chunk = repository.getMapChunk(created.id, 1, 1);
      expect(chunk).not.toBeNull();
      expect(chunk?.mapId).toBe(created.id);
      expect((chunk?.heights.length ?? 0) > 0).toBe(true);
    } finally {
      repository.close();
    }
  });

  test('creates infinite-vector maps without chunks', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        kind: 'infinite-vector',
        name: 'Infinite World',
        seed: 'infinite-seed'
      });

      expect(created.kind).toBe('infinite-vector');
      expect(created.extent.kind).toBe('infinite');
      expect(created.generator).toBeUndefined();

      const fetched = repository.getMap(created.id);
      expect(fetched?.kind).toBe('infinite-vector');
      expect(fetched?.extent.kind).toBe('infinite');

      // No chunks should exist
      expect(repository.getMapChunk(created.id, 0, 0)).toBeNull();
    } finally {
      repository.close();
    }
  });
});
