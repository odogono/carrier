import { describe, expect, test } from 'bun:test';

import {
  QUERY_CACHE_BUSTER,
  shouldPersistQuery
} from '@/contexts/query/persistence';

describe('query persistence', () => {
  test('uses the latest cache buster', () => {
    expect(QUERY_CACHE_BUSTER).toBe(
      'carrier-client-2026-03-27-zarch-model-cache'
    );
  });

  test('excludes map chunks from persistence', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['map-chunk', 'map-1', 0, 0],
        state: { status: 'success' }
      })
    ).toBe(false);
  });

  test('excludes hydrated zarch runtime models from persistence', () => {
    expect(
      shouldPersistQuery({
        queryKey: [
          'zarch-runtime-entity-model',
          'zarch-player-ship',
          'asset-1'
        ],
        state: { status: 'success' }
      })
    ).toBe(false);
  });

  test('keeps successful serializable queries persisted', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['zarch-runtime-entity', 'zarch-player-ship'],
        state: { status: 'success' }
      })
    ).toBe(true);
  });
});
