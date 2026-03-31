import { Color } from 'three';

import type { ZarchTileEditConfig, ZarchTileOverride } from 'carrier-contracts/types';

import {
  DEFAULT_ZARCH_TILE_TYPE_ID,
  TILE,
  WATER_LEVEL,
  applyTileColor,
  getHeightStepOffsetAtGrid,
  sampleHeightAtWorldFromGrid,
  sampleNormalAtWorldFromGrid,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

export type ZarchTileEditTool = 'lower' | 'raise' | 'set-color' | 'set-type';

export type ZarchTileState = ZarchTileOverride;

export type ZarchTileDraftEdits = Record<string, ZarchTileState>;

export type ZarchTileEditSnapshot = {
  edits: ZarchTileDraftEdits;
};

export type ZarchTileEditState = {
  canRedo: boolean;
  canUndo: boolean;
  edits: ZarchTileDraftEdits;
  enabled: boolean;
  hoveredTile: { tileX: number; tileZ: number } | null;
  maxAbsHeightSteps: number;
  redoStack: ZarchTileEditSnapshot[];
  saveError: string | null;
  selectedColorIndex: number | null;
  selectedTile: { tileX: number; tileZ: number } | null;
  selectedTypeId: string;
  tool: ZarchTileEditTool;
  undoStack: ZarchTileEditSnapshot[];
};

type ApplyTileEditAction = {
  current: ZarchTileState;
  tileX: number;
  tileZ: number;
  type: 'apply-tool';
};

type ZarchTileEditAction =
  | ApplyTileEditAction
  | { enabled: boolean; type: 'set-enabled' }
  | { hoveredTile: { tileX: number; tileZ: number } | null; type: 'set-hovered-tile' }
  | { saveError: string | null; type: 'set-save-error' }
  | { selectedColorIndex: number | null; type: 'set-selected-color-index' }
  | { selectedTile: { tileX: number; tileZ: number } | null; type: 'set-selected-tile' }
  | { selectedTypeId: string; type: 'set-selected-type-id' }
  | { tool: ZarchTileEditTool; type: 'set-tool' }
  | { type: 'reset-draft' }
  | { type: 'redo' }
  | { type: 'undo' };

const tileEditKey = (tileX: number, tileZ: number) => `${tileX}:${tileZ}`;

const cloneEdits = (edits: ZarchTileDraftEdits): ZarchTileDraftEdits => ({ ...edits });

const snapshotEdits = (edits: ZarchTileDraftEdits): ZarchTileEditSnapshot => ({
  edits: cloneEdits(edits)
});

const isDefaultTileState = (tile: Pick<ZarchTileState, 'colorIndex' | 'heightSteps' | 'typeId'>) =>
  tile.heightSteps === 0 &&
  tile.typeId === DEFAULT_ZARCH_TILE_TYPE_ID &&
  tile.colorIndex === null;

export const createZarchTileEditState = (
  editConfig: ZarchTileEditConfig
): ZarchTileEditState => ({
  canRedo: false,
  canUndo: false,
  edits: {},
  enabled: false,
  hoveredTile: null,
  maxAbsHeightSteps: editConfig.maxAbsHeightSteps,
  redoStack: [],
  saveError: null,
  selectedColorIndex: null,
  selectedTile: null,
  selectedTypeId: editConfig.tileTypes[0]?.id ?? DEFAULT_ZARCH_TILE_TYPE_ID,
  tool: 'set-type',
  undoStack: []
});

export const getTerrainTileState = (
  terrain: ZarchTerrain,
  tileX: number,
  tileZ: number
): ZarchTileState => ({
  colorIndex: terrain.getTileColorIndex(tileX, tileZ),
  heightSteps: terrain.getTileHeightSteps(tileX, tileZ),
  tileX,
  tileZ,
  typeId: terrain.getTileTypeId(tileX, tileZ)
});

export const getMergedTileState = (
  terrain: ZarchTerrain,
  edits: ZarchTileDraftEdits,
  tileX: number,
  tileZ: number
): ZarchTileState =>
  edits[tileEditKey(tileX, tileZ)] ?? getTerrainTileState(terrain, tileX, tileZ);

const applyToolToTile = (
  state: ZarchTileEditState,
  current: ZarchTileState
): ZarchTileState => {
  if (state.tool === 'raise') {
    return {
      ...current,
      heightSteps: Math.min(current.heightSteps + 1, state.maxAbsHeightSteps)
    };
  }

  if (state.tool === 'lower') {
    return {
      ...current,
      heightSteps: Math.max(current.heightSteps - 1, -state.maxAbsHeightSteps)
    };
  }

  if (state.tool === 'set-color') {
    return {
      ...current,
      colorIndex: state.selectedColorIndex
    };
  }

  return {
    ...current,
    typeId: state.selectedTypeId
  };
};

export const reduceZarchTileEditState = (
  state: ZarchTileEditState,
  action: ZarchTileEditAction
): ZarchTileEditState => {
  if (action.type === 'set-enabled') {
    return {
      ...state,
      enabled: action.enabled,
      hoveredTile: action.enabled ? state.hoveredTile : null,
      saveError: action.enabled ? state.saveError : null
    };
  }

  if (action.type === 'set-hovered-tile') {
    if (
      action.hoveredTile?.tileX === state.hoveredTile?.tileX &&
      action.hoveredTile?.tileZ === state.hoveredTile?.tileZ
    ) {
      return state;
    }

    return {
      ...state,
      hoveredTile: action.hoveredTile
    };
  }

  if (action.type === 'set-save-error') {
    return {
      ...state,
      saveError: action.saveError
    };
  }

  if (action.type === 'set-selected-color-index') {
    return {
      ...state,
      selectedColorIndex: action.selectedColorIndex
    };
  }

  if (action.type === 'set-selected-tile') {
    return {
      ...state,
      selectedTile: action.selectedTile
    };
  }

  if (action.type === 'set-selected-type-id') {
    return {
      ...state,
      selectedTypeId: action.selectedTypeId
    };
  }

  if (action.type === 'set-tool') {
    return {
      ...state,
      tool: action.tool
    };
  }

  if (action.type === 'reset-draft') {
    return {
      ...state,
      canRedo: false,
      canUndo: false,
      edits: {},
      redoStack: [],
      saveError: null,
      undoStack: []
    };
  }

  if (action.type === 'undo') {
    const previous = state.undoStack.at(-1);

    if (!previous) {
      return state;
    }

    const undoStack = state.undoStack.slice(0, -1);
    const redoStack = [...state.redoStack, snapshotEdits(state.edits)];

    return {
      ...state,
      canRedo: true,
      canUndo: undoStack.length > 0,
      edits: cloneEdits(previous.edits),
      redoStack,
      undoStack
    };
  }

  if (action.type === 'redo') {
    const next = state.redoStack.at(-1);

    if (!next) {
      return state;
    }

    const redoStack = state.redoStack.slice(0, -1);
    const undoStack = [...state.undoStack, snapshotEdits(state.edits)];

    return {
      ...state,
      canRedo: redoStack.length > 0,
      canUndo: true,
      edits: cloneEdits(next.edits),
      redoStack,
      undoStack
    };
  }

  const nextTile = applyToolToTile(state, action.current);
  const key = tileEditKey(action.tileX, action.tileZ);

  if (
    nextTile.heightSteps === action.current.heightSteps &&
    nextTile.typeId === action.current.typeId &&
    nextTile.colorIndex === action.current.colorIndex
  ) {
    return {
      ...state,
      selectedTile: { tileX: action.tileX, tileZ: action.tileZ }
    };
  }

  const edits = cloneEdits(state.edits);

  if (isDefaultTileState(nextTile)) {
    delete edits[key];
  } else {
    edits[key] = nextTile;
  }

  const undoStack = [...state.undoStack, snapshotEdits(state.edits)];

  return {
    ...state,
    canRedo: false,
    canUndo: true,
    edits,
    redoStack: [],
    selectedTile: { tileX: action.tileX, tileZ: action.tileZ },
    undoStack
  };
};

export const getDraftEdits = (state: ZarchTileEditState) =>
  Object.values(state.edits);

export const createEditedTerrain = ({
  editConfig,
  edits,
  terrain
}: {
  editConfig: ZarchTileEditConfig;
  edits: ZarchTileDraftEdits;
  terrain: ZarchTerrain;
}): ZarchTerrain => {
  const tileHeightStepCache = new Map<string, number>();
  const baseHeightCache = new Map<string, number | null>();
  const connectedHeightCache = new Map<string, number | null>();
  const tileAverageHeightCache = new Map<string, number | null>();

  const getTileHeightSteps = (tileX: number, tileZ: number) => {
    const key = tileEditKey(tileX, tileZ);
    const cachedHeightStep = tileHeightStepCache.get(key);

    if (cachedHeightStep !== undefined) {
      return cachedHeightStep;
    }

    const value =
      edits[key]?.heightSteps ??
      terrain.getTileHeightSteps(tileX, tileZ);
    tileHeightStepCache.set(key, value);
    return value;
  };

  const getTileTypeId = (tileX: number, tileZ: number) =>
    edits[tileEditKey(tileX, tileZ)]?.typeId ??
    terrain.getTileTypeId(tileX, tileZ);

  const getTileColorHex = (tileX: number, tileZ: number) => {
    const colorIndex = edits[tileEditKey(tileX, tileZ)]?.colorIndex;

    if (colorIndex !== undefined) {
      return colorIndex === null ? null : (editConfig.palette[colorIndex]?.hex ?? null);
    }

    return terrain.getTileColorHex(tileX, tileZ);
  };

  const getTileColorIndex = (tileX: number, tileZ: number) => {
    const colorIndex = edits[tileEditKey(tileX, tileZ)]?.colorIndex;
    return colorIndex === undefined
      ? terrain.getTileColorIndex(tileX, tileZ)
      : colorIndex;
  };

  const sampleBaseHeight = (gx: number, gz: number) => {
    const key = tileEditKey(gx, gz);
    const cachedBaseHeight = baseHeightCache.get(key);

    if (cachedBaseHeight !== undefined) {
      return cachedBaseHeight;
    }

    const connectedHeight = terrain.sampleHeight(gx, gz);

    if (connectedHeight === null) {
      baseHeightCache.set(key, null);
      return null;
    }

    const value = (
      connectedHeight -
      getHeightStepOffsetAtGrid({
        containsTile: terrain.containsTile,
        getTileHeightSteps: terrain.getTileHeightSteps,
        gx,
        gz,
        heightStepMeters: editConfig.heightStepMeters
      })
    );
    baseHeightCache.set(key, value);
    return value;
  };

  const sampleHeight = (gx: number, gz: number) => {
    const key = tileEditKey(gx, gz);
    const cachedHeight = connectedHeightCache.get(key);

    if (cachedHeight !== undefined) {
      return cachedHeight;
    }

    const baseHeight = sampleBaseHeight(gx, gz);

    if (baseHeight === null) {
      connectedHeightCache.set(key, null);
      return null;
    }

    const value = (
      baseHeight +
      getHeightStepOffsetAtGrid({
        containsTile: terrain.containsTile,
        getTileHeightSteps,
        gx,
        gz,
        heightStepMeters: editConfig.heightStepMeters
      })
    );
    connectedHeightCache.set(key, value);
    return value;
  };

  const getTileAverageHeight = (tileX: number, tileZ: number) => {
    const key = tileEditKey(tileX, tileZ);
    const cachedAverage = tileAverageHeightCache.get(key);

    if (cachedAverage !== undefined) {
      return cachedAverage;
    }

    const h00 = sampleHeight(tileX, tileZ);
    const h10 = sampleHeight(tileX + 1, tileZ);
    const h01 = sampleHeight(tileX, tileZ + 1);
    const h11 = sampleHeight(tileX + 1, tileZ + 1);

    if (
      h00 === null ||
      h10 === null ||
      h01 === null ||
      h11 === null
    ) {
      tileAverageHeightCache.set(key, null);
      return null;
    }

    const value = (h00 + h10 + h01 + h11) * 0.25;
    tileAverageHeightCache.set(key, value);
    return value;
  };

  const sampleHeightAtWorld = (worldX: number, worldZ: number) =>
    sampleHeightAtWorldFromGrid(sampleHeight, worldX, worldZ);

  return {
    ...terrain,
    getTileAverageHeight,
    getTileColorHex,
    getTileColorIndex,
    getTileHeightSteps,
    getTileTypeId,
    isWaterAtWorld: (worldX, worldZ) => {
      const tileX = Math.floor(worldX / TILE);
      const tileZ = Math.floor(worldZ / TILE);
      return (
        terrain.containsTile(tileX, tileZ) &&
        (getTileAverageHeight(tileX, tileZ) ?? 0) < WATER_LEVEL
      );
    },
    isWaterTile: (tileX, tileZ) => {
      const average = getTileAverageHeight(tileX, tileZ);
      return average !== null && average < WATER_LEVEL;
    },
    sampleHeight,
    sampleHeightAtWorld,
    sampleNormalAtWorld: (worldX, worldZ) =>
      sampleNormalAtWorldFromGrid(sampleHeightAtWorld, worldX, worldZ),
    shouldHaveTree: (tileX, tileZ) =>
      getTileTypeId(tileX, tileZ) === DEFAULT_ZARCH_TILE_TYPE_ID &&
      terrain.shouldHaveTree(tileX, tileZ),
    tileColor: (tileX, tileZ, elevation, target) => {
      const colorHex = getTileColorHex(tileX, tileZ);
      const average = getTileAverageHeight(tileX, tileZ) ?? elevation;

      if (colorHex) {
        return (target ?? new Color()).set(colorHex);
      }

      return applyTileColor(
        target,
        tileX,
        tileZ,
        average,
        terrain.resolveTileMaterial(tileX, tileZ, average)
      );
    }
  };
};
