import { describe, expect, test } from 'bun:test';
import type { MapMetadataSummary } from 'carrier-contracts/types';

import { mergeCreatedMapIntoList } from './cache';

const createMap = (
  id: string,
  overrides: Partial<MapMetadataSummary> = {}
): MapMetadataSummary => ({
  createdAt: '2026-04-10T10:00:00.000Z',
  extent: { kind: 'infinite' },
  id,
  kind: 'infinite-vector',
  name: id,
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed: `${id}-seed`,
  updatedAt: '2026-04-10T10:00:00.000Z',
  ...overrides
});

describe('mergeCreatedMapIntoList', () => {
  test('prepends a newly created map ahead of older cached entries', () => {
    const current = [
      createMap('older', {
        createdAt: '2026-04-10T09:00:00.000Z',
        updatedAt: '2026-04-10T09:00:00.000Z'
      })
    ];
    const created = createMap('newer', {
      createdAt: '2026-04-10T11:00:00.000Z',
      updatedAt: '2026-04-10T11:00:00.000Z'
    });

    expect(mergeCreatedMapIntoList(current, created).map(map => map.id)).toEqual([
      'newer',
      'older'
    ]);
  });

  test('replaces an existing cached entry for the same map id', () => {
    const stale = createMap('map-1', {
      name: 'Old name',
      revision: 1,
      updatedAt: '2026-04-10T09:00:00.000Z'
    });
    const fresh = createMap('map-1', {
      name: 'Fresh name',
      revision: 2,
      updatedAt: '2026-04-10T11:00:00.000Z'
    });

    const merged = mergeCreatedMapIntoList([stale], fresh);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(fresh);
  });
});
