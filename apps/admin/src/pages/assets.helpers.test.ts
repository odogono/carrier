/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import type { AssetVersionListItem } from 'carrier-contracts/types';

import {
  filterAssetItems,
  matchesAssetWorkflowFilter,
  sortAssetItems
} from './assets.helpers';

const createItem = (
  id: string,
  overrides: Partial<AssetVersionListItem> = {}
): AssetVersionListItem => ({
  asset: {
    collisionBox: {
      depthMeters: 10,
      heightMeters: 10,
      widthMeters: 10
    },
    collisionClass: 'building-solid',
    createdAt: '2026-03-20T10:00:00.000Z',
    diagnostics: [],
    footprint: {
      depthMeters: 10,
      widthMeters: 10
    },
    groundingPolicy: 'terrain-average-footprint',
    id,
    instancingEligible: false,
    maxHeightDeltaMeters: 1,
    obstacleMode: 'solid',
    originalFile: {
      contentType: 'model/gltf-binary',
      path: `uploads/${id}.glb`,
      sizeBytes: 128
    },
    runtimeFile: {
      contentType: 'model/gltf-binary',
      path: `runtime/${id}.glb`,
      sizeBytes: 128
    },
    status: 'review',
    updatedAt: '2026-03-20T10:00:00.000Z'
  },
  isDeletable: true,
  runtimeArtifactPresent: true,
  usage: {
    archetypeIds: [],
    runtimeEntityIds: []
  },
  ...overrides
});

describe('assets helpers', () => {
  test('matches workflow filters for review queue, bound, unbound, and archived', () => {
    const review = createItem('review-1');
    const bound = createItem('bound-1', {
      isDeletable: false,
      usage: {
        archetypeIds: ['watchtower'],
        runtimeEntityIds: []
      }
    });
    const archived = createItem('archived-1', {
      asset: {
        ...createItem('archived-1').asset,
        status: 'archived'
      }
    });

    expect(matchesAssetWorkflowFilter(review, 'review')).toBe(true);
    expect(matchesAssetWorkflowFilter(bound, 'bound')).toBe(true);
    expect(matchesAssetWorkflowFilter(bound, 'unbound')).toBe(false);
    expect(matchesAssetWorkflowFilter(archived, 'archived')).toBe(true);
  });

  test('filters by search text across asset ids and relationships', () => {
    const items = [
      createItem('watchtower-v1', {
        usage: {
          archetypeIds: ['watchtower'],
          runtimeEntityIds: []
        }
      }),
      createItem('ship-v1', {
        usage: {
          archetypeIds: [],
          runtimeEntityIds: ['zarch-player-ship']
        }
      })
    ];

    expect(
      filterAssetItems({
        items,
        search: 'player-ship',
        status: 'all',
        workflow: 'all'
      }).map(item => item.asset.id)
    ).toEqual(['ship-v1']);
  });

  test('sorts most recently updated assets first', () => {
    const older = createItem('older', {
      asset: {
        ...createItem('older').asset,
        updatedAt: '2026-03-20T10:00:00.000Z'
      }
    });
    const newer = createItem('newer', {
      asset: {
        ...createItem('newer').asset,
        updatedAt: '2026-03-21T10:00:00.000Z'
      }
    });

    expect(sortAssetItems([older, newer]).map(item => item.asset.id)).toEqual([
      'newer',
      'older'
    ]);
  });
});
