import { describe, expect, test } from 'bun:test';

import { MapRepository } from './repository';

describe('map repository', () => {
  test('creates, lists, fetches, and deletes maps with persistent chunks', () => {
    const repository = new MapRepository({ dbPath: ':memory:' });

    try {
      const created = repository.createMap({
        generator: 'diamond-square',
        heightTiles: 64,
        name: 'Alpha',
        seed: 'alpha-seed',
        widthTiles: 96
      });

      expect(created.widthMeters).toBe(960);
      expect(created.heightMeters).toBe(640);

      const listed = repository.listMaps();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(created.id);

      const fetched = repository.getMap(created.id);
      expect(fetched?.seed).toBe('alpha-seed');

      const chunk = repository.getMapChunk(created.id, 2, 1);
      expect(chunk).not.toBeNull();
      expect(chunk?.tileWidth).toBe(32);
      expect(chunk?.tileHeight).toBe(32);
      expect(chunk?.samplesWide).toBe(33);
      expect(chunk?.samplesHigh).toBe(33);

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
        generator: 'island-clusters',
        heightTiles: 96,
        name: 'Archipelago',
        seed: 'archipelago-seed',
        widthTiles: 128
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
});
