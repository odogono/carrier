import { describe, expect, test } from 'bun:test';

import type { ZarchTileEditConfig } from 'carrier-contracts/types';
import { Color } from 'three';

import type { ZarchTerrain } from '@/helpers/zarch-terrain';

import {
  computeAreaHeightEdits,
  createEditedTerrain,
  createZarchTileEditState,
  getHeightSelectionTiles,
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
      tool: 'set-type',
      type: 'set-tool'
    });
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

  test('builds a rectangular height selection box and clears it', () => {
    let state = createZarchTileEditState(editConfig);

    state = reduceZarchTileEditState(state, {
      tileX: 3,
      tileZ: 4,
      type: 'begin-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      tileX: 4,
      tileZ: 5,
      type: 'update-height-selection-box'
    });

    expect(getHeightSelectionTiles(state)).toEqual([
      { tileX: 3, tileZ: 4 },
      { tileX: 4, tileZ: 4 },
      { tileX: 3, tileZ: 5 },
      { tileX: 4, tileZ: 5 }
    ]);

    state = reduceZarchTileEditState(state, {
      tool: 'set-color',
      type: 'set-tool'
    });

    expect(getHeightSelectionTiles(state)).toEqual([
      { tileX: 3, tileZ: 4 },
      { tileX: 4, tileZ: 4 },
      { tileX: 3, tileZ: 5 },
      { tileX: 4, tileZ: 5 }
    ]);

    state = reduceZarchTileEditState(state, {
      type: 'clear-height-selection'
    });

    expect(getHeightSelectionTiles(state)).toEqual([]);
  });

  test('applies non-height tools across a selection batch', () => {
    let state = createZarchTileEditState(editConfig);

    state = reduceZarchTileEditState(state, {
      tileX: 1,
      tileZ: 1,
      type: 'begin-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      tileX: 2,
      tileZ: 1,
      type: 'update-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      selectedColorIndex: 0,
      type: 'set-selected-color-index'
    });
    state = reduceZarchTileEditState(state, {
      tool: 'set-color',
      type: 'set-tool'
    });
    state = reduceZarchTileEditState(state, {
      current: getMergedTileState(terrain, state.edits, 1, 1),
      tileEdits: getHeightSelectionTiles(state).map(tile => ({
        current: getMergedTileState(terrain, state.edits, tile.tileX, tile.tileZ)
      })),
      tileX: 1,
      tileZ: 1,
      type: 'apply-tool'
    });

    expect(state.edits['1:1']?.colorIndex).toBe(0);
    expect(state.edits['2:1']?.colorIndex).toBe(0);
  });

  test('applies non-height batch edits using explicit action overrides', () => {
    let state = createZarchTileEditState(editConfig);

    state = reduceZarchTileEditState(state, {
      tileX: 1,
      tileZ: 1,
      type: 'begin-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      tileX: 2,
      tileZ: 1,
      type: 'update-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      tool: 'set-type',
      type: 'set-tool'
    });
    state = reduceZarchTileEditState(state, {
      current: getMergedTileState(terrain, state.edits, 1, 1),
      selectedTypeIdOverride: 'landing-pad',
      tileEdits: getHeightSelectionTiles(state).map(tile => ({
        current: getMergedTileState(terrain, state.edits, tile.tileX, tile.tileZ)
      })),
      tileX: 1,
      tileZ: 1,
      type: 'apply-tool'
    });

    expect(state.edits['1:1']?.typeId).toBe('landing-pad');
    expect(state.edits['2:1']?.typeId).toBe('landing-pad');
  });

  test('applies color batch edits using an explicit tool override', () => {
    let state = createZarchTileEditState(editConfig);

    state = reduceZarchTileEditState(state, {
      tileX: 1,
      tileZ: 1,
      type: 'begin-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      tileX: 2,
      tileZ: 1,
      type: 'update-height-selection-box'
    });
    state = reduceZarchTileEditState(state, {
      current: getMergedTileState(terrain, state.edits, 1, 1),
      selectedColorIndexOverride: 0,
      tileEdits: getHeightSelectionTiles(state).map(tile => ({
        current: getMergedTileState(terrain, state.edits, tile.tileX, tile.tileZ)
      })),
      tileX: 1,
      tileZ: 1,
      toolOverride: 'set-color',
      type: 'apply-tool'
    });

    expect(state.edits['1:1']?.colorIndex).toBe(0);
    expect(state.edits['2:1']?.colorIndex).toBe(0);
  });
});

const collectSelectionHeights = (
  edited: ZarchTerrain,
  selection: { tileX: number; tileZ: number }[]
) => {
  const vertexKeys = new Set<string>();

  for (const tile of selection) {
    vertexKeys.add(`${tile.tileX}:${tile.tileZ}`);
    vertexKeys.add(`${tile.tileX + 1}:${tile.tileZ}`);
    vertexKeys.add(`${tile.tileX}:${tile.tileZ + 1}`);
    vertexKeys.add(`${tile.tileX + 1}:${tile.tileZ + 1}`);
  }

  return Array.from(vertexKeys)
    .map(key => {
      const [gxString, gzString] = key.split(':');
      return edited.sampleHeight(Number(gxString), Number(gzString));
    })
    .filter((height): height is number => height !== null);
};

describe('computeAreaHeightEdits', () => {
  test('flattens a single selected tile using halo edits and preserves non-height fields', () => {
    const baseHeights: Record<string, number> = {
      '5:5': 8, '6:5': 12, '5:6': 10, '6:6': 14
    };
    const unevenTerrain: ZarchTerrain = {
      ...terrain,
      sampleHeight: (gx, gz) => baseHeights[`${gx}:${gz}`] ?? 10
    };
    const selection = [{ tileX: 5, tileZ: 5 }];
    const edits = {
      '4:4': {
        colorIndex: 0,
        heightSteps: 1,
        tileX: 4,
        tileZ: 4,
        typeId: 'landing-pad'
      }
    };

    const result = computeAreaHeightEdits({
      edits,
      editConfig,
      mode: 'flatten',
      selection,
      terrain: unevenTerrain,
    });

    expect(result.haloTiles.length).toBeGreaterThan(0);
    expect(result.heightEdits.some(entry => entry.current.tileX === 4 && entry.current.tileZ === 4)).toBe(true);

    const nextEdits = Object.fromEntries(
      result.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const preservedHalo = nextEdits['4:4'];

    expect(preservedHalo?.colorIndex).toBe(0);
    expect(preservedHalo?.typeId).toBe('landing-pad');

    const edited = createEditedTerrain({
      editConfig,
      edits: nextEdits,
      terrain: unevenTerrain
    });
    const heights = collectSelectionHeights(edited, selection);
    const maxDiff = Math.max(...heights) - Math.min(...heights);

    expect(maxDiff).toBeLessThanOrEqual(editConfig.heightStepMeters * 0.5);
  });

  test('flattens a multi-tile area to one plane', () => {
    const baseHeights: Record<string, number> = {
      '5:5': 8, '6:5': 11, '7:5': 14,
      '5:6': 9, '6:6': 12, '7:6': 15,
      '5:7': 10, '6:7': 13, '7:7': 16
    };
    const unevenTerrain: ZarchTerrain = {
      ...terrain,
      sampleHeight: (gx, gz) => baseHeights[`${gx}:${gz}`] ?? 10
    };
    const selection = [
      { tileX: 5, tileZ: 5 },
      { tileX: 6, tileZ: 5 },
      { tileX: 5, tileZ: 6 },
      { tileX: 6, tileZ: 6 }
    ];

    const result = computeAreaHeightEdits({
      edits: {},
      editConfig,
      mode: 'flatten',
      selection,
      terrain: unevenTerrain
    });
    const nextEdits = Object.fromEntries(
      result.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const edited = createEditedTerrain({
      editConfig,
      edits: nextEdits,
      terrain: unevenTerrain
    });
    const heights = collectSelectionHeights(edited, selection);
    const maxDiff = Math.max(...heights) - Math.min(...heights);

    expect(maxDiff).toBeLessThanOrEqual(editConfig.heightStepMeters * 0.5);
  });

  test('raise moves an already flat selection up by one height step', () => {
    const selection = [
      { tileX: 2, tileZ: 2 },
      { tileX: 3, tileZ: 2 }
    ];
    const result = computeAreaHeightEdits({
      edits: {},
      editConfig,
      mode: 'raise',
      selection,
      terrain
    });
    const nextEdits = Object.fromEntries(
      result.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const edited = createEditedTerrain({
      editConfig,
      edits: nextEdits,
      terrain
    });
    const heights = collectSelectionHeights(edited, selection);

    expect(result.targetHeight).toBe(14);
    expect(Math.min(...heights)).toBe(14);
    expect(Math.max(...heights)).toBe(14);
  });

  test('raise keeps a flattened multi-tile selection on one exact plane', () => {
    const baseHeights: Record<string, number> = {
      '5:5': 8, '6:5': 11, '7:5': 14,
      '5:6': 9, '6:6': 12, '7:6': 15,
      '5:7': 10, '6:7': 13, '7:7': 16
    };
    const unevenTerrain: ZarchTerrain = {
      ...terrain,
      sampleHeight: (gx, gz) => baseHeights[`${gx}:${gz}`] ?? 10
    };
    const selection = [
      { tileX: 5, tileZ: 5 },
      { tileX: 6, tileZ: 5 },
      { tileX: 5, tileZ: 6 },
      { tileX: 6, tileZ: 6 }
    ];

    const flattened = computeAreaHeightEdits({
      edits: {},
      editConfig,
      mode: 'flatten',
      selection,
      terrain: unevenTerrain
    });
    const flattenedEdits = Object.fromEntries(
      flattened.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const raised = computeAreaHeightEdits({
      currentPlaneHeight: flattened.targetHeight,
      edits: flattenedEdits,
      editConfig,
      mode: 'raise',
      selection,
      terrain: unevenTerrain
    });
    const raisedEdits = Object.fromEntries(
      raised.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const edited = createEditedTerrain({
      editConfig,
      edits: raisedEdits,
      terrain: unevenTerrain
    });
    const heights = collectSelectionHeights(edited, selection);

    expect(raised.targetHeight).toBe((flattened.targetHeight ?? 0) + editConfig.heightStepMeters);
    expect(new Set(heights)).toEqual(new Set([raised.targetHeight]));
  });

  test('repeated raise keeps an uneven rectangular selection on a uniform interior plane', () => {
    const baseHeights: Record<string, number> = {
      '10:10': 6, '11:10': 8, '12:10': 10, '13:10': 13,
      '10:11': 7, '11:11': 9, '12:11': 12, '13:11': 14,
      '10:12': 8, '11:12': 11, '12:12': 13, '13:12': 16,
      '10:13': 9, '11:13': 12, '12:13': 15, '13:13': 17
    };
    const unevenTerrain: ZarchTerrain = {
      ...terrain,
      sampleHeight: (gx, gz) => baseHeights[`${gx}:${gz}`] ?? 10
    };
    const selection = [
      { tileX: 10, tileZ: 10 },
      { tileX: 11, tileZ: 10 },
      { tileX: 12, tileZ: 10 },
      { tileX: 10, tileZ: 11 },
      { tileX: 11, tileZ: 11 },
      { tileX: 12, tileZ: 11 },
      { tileX: 10, tileZ: 12 },
      { tileX: 11, tileZ: 12 },
      { tileX: 12, tileZ: 12 }
    ];

    let edits = {};
    let currentPlaneHeight: number | null = null;

    for (let index = 0; index < 3; index += 1) {
      const result = computeAreaHeightEdits({
        currentPlaneHeight,
        edits,
        editConfig,
        mode: 'raise',
        selection,
        terrain: unevenTerrain
      });

      edits = Object.fromEntries(
        result.heightEdits.map(entry => [
          `${entry.current.tileX}:${entry.current.tileZ}`,
          {
            ...entry.current,
            heightSteps: entry.heightSteps
          }
        ])
      );
      currentPlaneHeight = result.targetHeight;
    }

    const edited = createEditedTerrain({
      editConfig,
      edits,
      terrain: unevenTerrain
    });
    const heights = collectSelectionHeights(edited, selection);

    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.01);
  });

  test('lower stops at water level instead of crossing below zero', () => {
    const selection = [{ tileX: 2, tileZ: 2 }];
    const shallowTerrain: ZarchTerrain = {
      ...terrain,
      getTileAverageHeight: () => 2,
      sampleHeight: () => 2,
      sampleHeightAtWorld: () => 2
    };
    const result = computeAreaHeightEdits({
      edits: {},
      editConfig,
      mode: 'lower',
      selection,
      terrain: shallowTerrain
    });
    const nextEdits = Object.fromEntries(
      result.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const edited = createEditedTerrain({
      editConfig,
      edits: nextEdits,
      terrain: shallowTerrain
    });
    const heights = collectSelectionHeights(edited, selection);

    expect(result.targetHeight).toBe(0);
    expect(Math.min(...heights)).toBe(0);
    expect(Math.max(...heights)).toBe(0);
  });

  test('lower at water level does not create negative terrain', () => {
    const selection = [{ tileX: 2, tileZ: 2 }];
    const seaLevelTerrain: ZarchTerrain = {
      ...terrain,
      getTileAverageHeight: () => 0,
      sampleHeight: () => 0,
      sampleHeightAtWorld: () => 0
    };
    const result = computeAreaHeightEdits({
      edits: {},
      editConfig,
      mode: 'lower',
      selection,
      terrain: seaLevelTerrain
    });
    const nextEdits = Object.fromEntries(
      result.heightEdits.map(entry => [
        `${entry.current.tileX}:${entry.current.tileZ}`,
        {
          ...entry.current,
          heightSteps: entry.heightSteps
        }
      ])
    );
    const edited = createEditedTerrain({
      editConfig,
      edits: nextEdits,
      terrain: seaLevelTerrain
    });
    const heights = collectSelectionHeights(edited, selection);

    expect(result.targetHeight).toBe(0);
    expect(Math.min(...heights)).toBe(0);
    expect(Math.max(...heights)).toBe(0);
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
