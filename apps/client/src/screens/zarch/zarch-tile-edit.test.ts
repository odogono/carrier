import { describe, expect, test } from 'bun:test';

import type { ZarchTileEditConfig } from 'carrier-contracts/types';
import { Color } from 'three';

import type { ZarchTerrain } from '@/helpers/zarch-terrain';

import {
  createEditedTerrain,
  createZarchTileEditState,
  getMergedTileState,
  reduceZarchTileEditState
} from './zarch-tile-edit';

const editConfig: ZarchTileEditConfig = {
  heightStepMeters: 4,
  maxAbsHeightSteps: 16,
  palette: [{ hex: '#d6c64a', id: 'pad-yellow', label: 'Pad Yellow' }],
  tileTypes: [
    { id: 'normal', label: 'Normal' },
    { id: 'landing-pad', label: 'Landing Pad' }
  ]
};

const terrain: ZarchTerrain = {
  chunkSizeTiles: 32,
  containsTile: () => true,
  getTileAverageHeight: () => 10,
  getTileColorHex: () => null,
  getTileColorIndex: () => null,
  getTileHeightSteps: () => 0,
  getTileTypeId: () => 'normal',
  heightTiles: 64,
  id: 'terrain',
  isTileLoaded: () => true,
  isWaterAtWorld: () => false,
  isWaterTile: () => false,
  isWorldPointLoaded: () => true,
  requestVisibleChunks: () => {},
  resolveTileMaterial: () => 'grass-mid',
  sampleHeight: () => 10,
  sampleHeightAtWorld: () => 10,
  sampleNormalAtWorld: () => ({ x: 0, y: 1, z: 0 }),
  shouldHaveTree: () => true,
  tileColor: (_gx, _gz, _elevation, target) => (target ?? new Color()),
  treeType: () => 0,
  widthTiles: 64,
  wrapX: false,
  wrapZ: false
};

describe('zarch tile edit reducer', () => {
  test('applies tools, tracks undo/redo, and removes default resets from the draft', () => {
    let state = createZarchTileEditState(editConfig);

    state = reduceZarchTileEditState(state, {
      selectedTypeId: 'landing-pad',
      type: 'set-selected-type-id'
    });
    state = reduceZarchTileEditState(state, {
      current: getMergedTileState(terrain, state.edits, 2, 3),
      tileX: 2,
      tileZ: 3,
      type: 'apply-tool'
    });

    expect(state.edits['2:3']?.typeId).toBe('landing-pad');
    expect(state.canUndo).toBe(true);

    state = reduceZarchTileEditState(state, { type: 'undo' });
    expect(state.edits['2:3']).toBeUndefined();
    expect(state.canRedo).toBe(true);

    state = reduceZarchTileEditState(state, { type: 'redo' });
    expect(state.edits['2:3']?.typeId).toBe('landing-pad');

    state = reduceZarchTileEditState(state, {
      selectedTypeId: 'normal',
      type: 'set-selected-type-id'
    });
    state = reduceZarchTileEditState(state, {
      current: getMergedTileState(terrain, state.edits, 2, 3),
      tileX: 2,
      tileZ: 3,
      type: 'apply-tool'
    });

    expect(state.edits['2:3']).toBeUndefined();
  });
});

describe('zarch edited terrain', () => {
  test('merges draft edits into sampled terrain state', () => {
    const edited = createEditedTerrain({
      editConfig,
      edits: {
        '1:1': {
          colorIndex: 0,
          heightSteps: 2,
          tileX: 1,
          tileZ: 1,
          typeId: 'landing-pad'
        }
      },
      terrain
    });

    expect(edited.getTileHeightSteps(1, 1)).toBe(2);
    expect(edited.getTileTypeId(1, 1)).toBe('landing-pad');
    expect(edited.getTileColorIndex(1, 1)).toBe(0);
    expect(edited.sampleHeight(1, 1)).toBe(12);
    expect(edited.sampleHeight(2, 1)).toBe(12);
    expect(edited.getTileAverageHeight(1, 1)).toBe(12);
    expect(edited.sampleHeightAtWorld(25, 25)).toBe(12);
  });
});
