import { describe, expect, test } from 'bun:test';
import type { MapMetadata } from 'carrier-contracts/types';

import { TILE } from '@/helpers/zarch-terrain';

import { getEditPanelVisibility, getInitialCameraState } from './main';

const finiteMap: MapMetadata = {
  createdAt: '2026-03-18T00:00:00.000Z',
  extent: {
    heightMeters: 640,
    heightTiles: 64,
    kind: 'finite',
    widthMeters: 960,
    widthTiles: 96,
    wrapX: true,
    wrapZ: true
  },
  generator: 'diamond-square',
  id: 'finite-map',
  kind: 'wrapped-classic',
  name: 'Finite',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed: 'seed',
  updatedAt: '2026-03-18T00:00:00.000Z'
};

const infiniteMap: MapMetadata = {
  createdAt: '2026-03-18T00:00:00.000Z',
  extent: { kind: 'infinite' },
  id: 'infinite-map',
  kind: 'infinite-vector',
  name: 'Infinite',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 0,
  seed: 'seed',
  updatedAt: '2026-03-18T00:00:00.000Z'
};

describe('main camera initialization', () => {
  test('centers finite maps from extent tile dimensions', () => {
    if (finiteMap.extent.kind !== 'finite') {
      throw new Error('expected finite map extent');
    }

    expect(getInitialCameraState(finiteMap)).toEqual({
      camX: finiteMap.extent.widthTiles * TILE * 0.5,
      camZ: finiteMap.extent.heightTiles * TILE * 0.5
    });
  });

  test('starts infinite maps at the origin', () => {
    expect(getInitialCameraState(infiniteMap)).toEqual({
      camX: 0,
      camZ: 0
    });
  });
});

describe('main edit panel visibility', () => {
  test('keeps shared edit controls visible in entity edit mode', () => {
    expect(
      getEditPanelVisibility({
        catalogOpen: false,
        editEnabled: true,
        editorMode: 'entities'
      })
    ).toEqual({
      catalog: false,
      edit: true,
      entity: true
    });
  });

  test('keeps entity-specific panels behind entity edit state', () => {
    expect(
      getEditPanelVisibility({
        catalogOpen: true,
        editEnabled: false,
        editorMode: 'entities'
      })
    ).toEqual({
      catalog: false,
      edit: true,
      entity: false
    });

    expect(
      getEditPanelVisibility({
        catalogOpen: true,
        editEnabled: true,
        editorMode: 'terrain'
      })
    ).toEqual({
      catalog: false,
      edit: true,
      entity: false
    });
  });
});
