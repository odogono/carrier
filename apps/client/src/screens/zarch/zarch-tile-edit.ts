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

export type ZarchTileEditTool = 'height' | 'set-color' | 'set-type';

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
  heightSelectionAnchor: { tileX: number; tileZ: number } | null;
  heightSelection: Record<string, { tileX: number; tileZ: number }>;
  hoveredTile: { tileX: number; tileZ: number } | null;
  lastSolvedPlaneHeight: number | null;
  maxAbsHeightSteps: number;
  previewHaloTiles: Record<string, { tileX: number; tileZ: number }>;
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
  /** Pre-computed height edits for flattening (height tool only). */
  heightEdits?: { current: ZarchTileState; heightSteps: number }[];
  lastSolvedPlaneHeight?: number | null;
  previewHaloTiles?: { tileX: number; tileZ: number }[];
  selectedColorIndexOverride?: number | null;
  selectedTypeIdOverride?: string;
  tileEdits?: { current: ZarchTileState }[];
  tileX: number;
  tileZ: number;
  type: 'apply-tool';
};

type ZarchTileEditAction =
  | ApplyTileEditAction
  | { tileX: number; tileZ: number; type: 'begin-height-selection-box' }
  | { type: 'clear-height-selection' }
  | { enabled: boolean; type: 'set-enabled' }
  | { hoveredTile: { tileX: number; tileZ: number } | null; type: 'set-hovered-tile' }
  | { tileX: number; tileZ: number; type: 'update-height-selection-box' }
  | {
      lastSolvedPlaneHeight: number | null;
      previewHaloTiles: { tileX: number; tileZ: number }[];
      type: 'set-height-preview';
    }
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
  heightSelectionAnchor: null,
  heightSelection: {},
  hoveredTile: null,
  lastSolvedPlaneHeight: null,
  maxAbsHeightSteps: editConfig.maxAbsHeightSteps,
  previewHaloTiles: {},
  redoStack: [],
  saveError: null,
  selectedColorIndex: null,
  selectedTile: null,
  selectedTypeId: editConfig.tileTypes[0]?.id ?? DEFAULT_ZARCH_TILE_TYPE_ID,
  tool: 'height',
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
  current: ZarchTileState,
  overrides?: {
    selectedColorIndexOverride?: number | null;
    selectedTypeIdOverride?: string;
  }
): ZarchTileState => {
  const selectedColorIndex =
    overrides?.selectedColorIndexOverride ?? state.selectedColorIndex;
  const selectedTypeId =
    overrides?.selectedTypeIdOverride ?? state.selectedTypeId;

  if (state.tool === 'set-color') {
    return {
      ...current,
      colorIndex: selectedColorIndex
    };
  }

  return {
    ...current,
    typeId: selectedTypeId
  };
};

const buildHeightSelectionBox = (
  startTileX: number,
  startTileZ: number,
  endTileX: number,
  endTileZ: number
) => {
  const minTileX = Math.min(startTileX, endTileX);
  const maxTileX = Math.max(startTileX, endTileX);
  const minTileZ = Math.min(startTileZ, endTileZ);
  const maxTileZ = Math.max(startTileZ, endTileZ);
  const selection: Record<string, { tileX: number; tileZ: number }> = {};

  for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      selection[tileEditKey(tileX, tileZ)] = { tileX, tileZ };
    }
  }

  return selection;
};

export const reduceZarchTileEditState = (
  state: ZarchTileEditState,
  action: ZarchTileEditAction
): ZarchTileEditState => {
  if (action.type === 'set-enabled') {
    return {
      ...state,
      enabled: action.enabled,
      heightSelectionAnchor: action.enabled ? state.heightSelectionAnchor : null,
      heightSelection: action.enabled ? state.heightSelection : {},
      hoveredTile: action.enabled ? state.hoveredTile : null,
      lastSolvedPlaneHeight: action.enabled ? state.lastSolvedPlaneHeight : null,
      previewHaloTiles: action.enabled ? state.previewHaloTiles : {},
      saveError: action.enabled ? state.saveError : null
    };
  }

  if (action.type === 'begin-height-selection-box') {
    return {
      ...state,
      heightSelectionAnchor: { tileX: action.tileX, tileZ: action.tileZ },
      heightSelection: buildHeightSelectionBox(
        action.tileX,
        action.tileZ,
        action.tileX,
        action.tileZ
      ),
      selectedTile: { tileX: action.tileX, tileZ: action.tileZ }
    };
  }

  if (action.type === 'update-height-selection-box') {
    const anchor = state.heightSelectionAnchor;

    if (!anchor) {
      return state;
    }

    return {
      ...state,
      heightSelection: buildHeightSelectionBox(
        anchor.tileX,
        anchor.tileZ,
        action.tileX,
        action.tileZ
      ),
      selectedTile: { tileX: action.tileX, tileZ: action.tileZ }
    };
  }

  if (action.type === 'clear-height-selection') {
    if (
      Object.keys(state.heightSelection).length === 0 &&
      Object.keys(state.previewHaloTiles).length === 0 &&
      state.lastSolvedPlaneHeight === null
    ) {
      return state;
    }

    return {
      ...state,
      heightSelectionAnchor: null,
      heightSelection: {},
      lastSolvedPlaneHeight: null,
      previewHaloTiles: {}
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
      heightSelectionAnchor: state.heightSelectionAnchor,
      heightSelection: state.heightSelection,
      lastSolvedPlaneHeight: action.tool === 'height' ? state.lastSolvedPlaneHeight : null,
      previewHaloTiles: action.tool === 'height' ? state.previewHaloTiles : {},
      tool: action.tool
    };
  }

  if (action.type === 'set-height-preview') {
    const nextPreviewHaloTiles = Object.fromEntries(
      action.previewHaloTiles.map(tile => [tileEditKey(tile.tileX, tile.tileZ), tile])
    );

    if (
      state.lastSolvedPlaneHeight === action.lastSolvedPlaneHeight &&
      Object.keys(state.previewHaloTiles).length === Object.keys(nextPreviewHaloTiles).length &&
      Object.keys(nextPreviewHaloTiles).every(key => state.previewHaloTiles[key])
    ) {
      return state;
    }

    return {
      ...state,
      lastSolvedPlaneHeight: action.lastSolvedPlaneHeight,
      previewHaloTiles: nextPreviewHaloTiles
    };
  }

  if (action.type === 'reset-draft') {
    return {
      ...state,
      canRedo: false,
      canUndo: false,
      edits: {},
      heightSelectionAnchor: null,
      heightSelection: {},
      lastSolvedPlaneHeight: null,
      previewHaloTiles: {},
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

  if (state.tool === 'height' && action.heightEdits) {
    const edits = cloneEdits(state.edits);
    let changed = false;

    for (const entry of action.heightEdits) {
      const k = tileEditKey(entry.current.tileX, entry.current.tileZ);
      const next: ZarchTileState = { ...entry.current, heightSteps: entry.heightSteps };

      if (next.heightSteps !== entry.current.heightSteps) {
        changed = true;
      }

      if (isDefaultTileState(next)) {
        delete edits[k];
      } else {
        edits[k] = next;
      }
    }

    if (!changed) {
      return {
        ...state,
        selectedTile: { tileX: action.tileX, tileZ: action.tileZ }
      };
    }

    const undoStack = [...state.undoStack, snapshotEdits(state.edits)];

    return {
      ...state,
      canRedo: false,
      canUndo: true,
      edits,
      lastSolvedPlaneHeight: action.lastSolvedPlaneHeight ?? state.lastSolvedPlaneHeight,
      previewHaloTiles: Object.fromEntries(
        (action.previewHaloTiles ?? []).map(tile => [tileEditKey(tile.tileX, tile.tileZ), tile])
      ),
      redoStack: [],
      selectedTile: { tileX: action.tileX, tileZ: action.tileZ },
      undoStack
    };
  }

  if (action.tileEdits) {
    const edits = cloneEdits(state.edits);
    let changed = false;

    for (const entry of action.tileEdits) {
      const nextTile = applyToolToTile(state, entry.current, {
        selectedColorIndexOverride: action.selectedColorIndexOverride,
        selectedTypeIdOverride: action.selectedTypeIdOverride
      });
      const key = tileEditKey(entry.current.tileX, entry.current.tileZ);

      if (
        nextTile.heightSteps !== entry.current.heightSteps ||
        nextTile.typeId !== entry.current.typeId ||
        nextTile.colorIndex !== entry.current.colorIndex
      ) {
        changed = true;
      }

      if (isDefaultTileState(nextTile)) {
        delete edits[key];
      } else {
        edits[key] = nextTile;
      }
    }

    if (!changed) {
      return {
        ...state,
        selectedTile: { tileX: action.tileX, tileZ: action.tileZ }
      };
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
  }

  const nextTile = applyToolToTile(state, action.current, {
    selectedColorIndexOverride: action.selectedColorIndexOverride,
    selectedTypeIdOverride: action.selectedTypeIdOverride
  });
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

export const getHeightSelectionTiles = (state: ZarchTileEditState) =>
  Object.values(state.heightSelection);

export const getPreviewHaloTiles = (state: ZarchTileEditState) =>
  Object.values(state.previewHaloTiles);

const FLAT_TOLERANCE = 0.01;
const SOLVER_REGULARIZATION = 0.02;
const SOLVER_ITERATIONS = 8;

const isTileFlat = (cornerHeights: (number | null)[]): boolean => {
  const valid = cornerHeights.filter((h): h is number => h !== null);

  if (valid.length < 2) {
    return true;
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return max - min < FLAT_TOLERANCE;
};

const sampleBaseHeight = (
  terrain: ZarchTerrain,
  gx: number,
  gz: number,
  heightStepMeters: number
) => {
  const connectedHeight = terrain.sampleHeight(gx, gz);

  if (connectedHeight === null) {
    return null;
  }

  return (
    connectedHeight -
    getHeightStepOffsetAtGrid({
      containsTile: terrain.containsTile,
      getTileHeightSteps: terrain.getTileHeightSteps,
      gx,
      gz,
      heightStepMeters
    })
  );
};

const getCurrentTileHeightSteps = (
  terrain: ZarchTerrain,
  edits: ZarchTileDraftEdits,
  tileX: number,
  tileZ: number
) => edits[tileEditKey(tileX, tileZ)]?.heightSteps ?? terrain.getTileHeightSteps(tileX, tileZ);

const getSelectionAndHaloTiles = (
  terrain: ZarchTerrain,
  selection: readonly { tileX: number; tileZ: number }[]
) => {
  const selected = new Map<string, { tileX: number; tileZ: number }>();
  const halo = new Map<string, { tileX: number; tileZ: number }>();

  for (const tile of selection) {
    const key = tileEditKey(tile.tileX, tile.tileZ);
    selected.set(key, tile);
  }

  for (const tile of selection) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tileX = tile.tileX + dx;
        const tileZ = tile.tileZ + dz;

        if (!terrain.containsTile(tileX, tileZ)) {
          continue;
        }

        const key = tileEditKey(tileX, tileZ);

        if (selected.has(key)) {
          continue;
        }

        halo.set(key, { tileX, tileZ });
      }
    }
  }

  return {
    haloTiles: Array.from(halo.values()),
    selectedTiles: Array.from(selected.values())
  };
};

const getSelectionVertexKeys = (selection: readonly { tileX: number; tileZ: number }[]) => {
  const keys = new Set<string>();

  for (const tile of selection) {
    keys.add(tileEditKey(tile.tileX, tile.tileZ));
    keys.add(tileEditKey(tile.tileX + 1, tile.tileZ));
    keys.add(tileEditKey(tile.tileX, tile.tileZ + 1));
    keys.add(tileEditKey(tile.tileX + 1, tile.tileZ + 1));
  }

  return Array.from(keys);
};

const getCurrentVertexHeight = ({
  edits,
  editConfig,
  terrain,
  vertexX,
  vertexZ
}: {
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  terrain: ZarchTerrain;
  vertexX: number;
  vertexZ: number;
}) => {
  const baseHeight = sampleBaseHeight(terrain, vertexX, vertexZ, editConfig.heightStepMeters);

  if (baseHeight === null) {
    return null;
  }

  return (
    baseHeight +
    getHeightStepOffsetAtGrid({
      containsTile: terrain.containsTile,
      getTileHeightSteps: (tileX, tileZ) =>
        getCurrentTileHeightSteps(terrain, edits, tileX, tileZ),
      gx: vertexX,
      gz: vertexZ,
      heightStepMeters: editConfig.heightStepMeters
    })
  );
};

const createLinearSystem = ({
  affectedTiles,
  edits,
  editConfig,
  selection,
  targetHeight,
  terrain
}: {
  affectedTiles: readonly { tileX: number; tileZ: number }[];
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  selection: readonly { tileX: number; tileZ: number }[];
  targetHeight: number;
  terrain: ZarchTerrain;
}) => {
  const unknownIndex = new Map<string, number>();

  affectedTiles.forEach((tile, index) => {
    unknownIndex.set(tileEditKey(tile.tileX, tile.tileZ), index);
  });

  const rows: { coefficients: number[]; rhs: number }[] = [];

  for (const vertexKey of getSelectionVertexKeys(selection)) {
    const [vertexXString, vertexZString] = vertexKey.split(':');
    const vertexX = Number(vertexXString);
    const vertexZ = Number(vertexZString);
    const baseHeight = sampleBaseHeight(terrain, vertexX, vertexZ, editConfig.heightStepMeters);

    if (baseHeight === null) {
      continue;
    }

    const incidentTiles = [
      [vertexX - 1, vertexZ - 1],
      [vertexX, vertexZ - 1],
      [vertexX - 1, vertexZ],
      [vertexX, vertexZ]
    ].filter(([tileX, tileZ]) => terrain.containsTile(tileX, tileZ));

    if (incidentTiles.length === 0) {
      continue;
    }

    const coefficients = new Array<number>(affectedTiles.length).fill(0);
    let fixedContribution = 0;

    for (const [tileX, tileZ] of incidentTiles) {
      const key = tileEditKey(tileX, tileZ);
      const currentValue = getCurrentTileHeightSteps(terrain, edits, tileX, tileZ);
      const index = unknownIndex.get(key);

      if (index === undefined) {
        fixedContribution += currentValue;
      } else {
        coefficients[index] += 1;
      }
    }

    rows.push({
      coefficients,
      rhs:
        ((targetHeight - baseHeight) / editConfig.heightStepMeters) * incidentTiles.length -
        fixedContribution
    });
  }

  return rows;
};

const solveLinearSystem = (
  matrix: number[][],
  vector: number[]
) => {
  const size = vector.length;
  const a = matrix.map(row => [...row]);
  const b = [...vector];

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    let maxValue = Math.abs(a[pivot]?.[pivot] ?? 0);

    for (let row = pivot + 1; row < size; row += 1) {
      const value = Math.abs(a[row]?.[pivot] ?? 0);

      if (value > maxValue) {
        maxValue = value;
        maxRow = row;
      }
    }

    if (maxValue < 1e-9) {
      continue;
    }

    if (maxRow !== pivot) {
      [a[pivot], a[maxRow]] = [a[maxRow]!, a[pivot]!];
      [b[pivot], b[maxRow]] = [b[maxRow]!, b[pivot]!];
    }

    const pivotValue = a[pivot]![pivot]!;

    for (let column = pivot; column < size; column += 1) {
      a[pivot]![column] = a[pivot]![column]! / pivotValue;
    }

    b[pivot] /= pivotValue;

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = a[row]![pivot]!;

      if (Math.abs(factor) < 1e-9) {
        continue;
      }

      for (let column = pivot; column < size; column += 1) {
        a[row]![column] -= factor * a[pivot]![column]!;
      }

      b[row] -= factor * b[pivot]!;
    }
  }

  return b;
};

const optimizeRoundedSolution = ({
  initial,
  maxAbsHeightSteps,
  objective
}: {
  initial: number[];
  maxAbsHeightSteps: number;
  objective: (candidate: readonly number[]) => number;
}) => {
  const candidate = [...initial];

  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
    let improved = false;

    for (let index = 0; index < candidate.length; index += 1) {
      let bestValue = candidate[index]!;
      let bestScore = objective(candidate);

      for (const delta of [-2, -1, 1, 2]) {
        const nextValue = Math.max(
          -maxAbsHeightSteps,
          Math.min(maxAbsHeightSteps, bestValue + delta)
        );

        if (nextValue === candidate[index]) {
          continue;
        }

        candidate[index] = nextValue;
        const score = objective(candidate);

        if (score + 1e-6 < bestScore) {
          bestScore = score;
          bestValue = nextValue;
          improved = true;
        }
      }

      candidate[index] = bestValue;
    }

    if (!improved) {
      break;
    }
  }

  return candidate;
};

const getSelectionVertexHeightsForCandidate = ({
  affectedTiles,
  candidate,
  edits,
  editConfig,
  selection,
  terrain
}: {
  affectedTiles: readonly { tileX: number; tileZ: number }[];
  candidate: readonly number[];
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  const candidateSteps = new Map<string, number>();

  affectedTiles.forEach((tile, index) => {
    candidateSteps.set(tileEditKey(tile.tileX, tile.tileZ), candidate[index]!);
  });

  return getSelectionVertexKeys(selection)
    .map(vertexKey => {
      const [vertexXString, vertexZString] = vertexKey.split(':');
      const vertexX = Number(vertexXString);
      const vertexZ = Number(vertexZString);
      const baseHeight = sampleBaseHeight(terrain, vertexX, vertexZ, editConfig.heightStepMeters);

      if (baseHeight === null) {
        return null;
      }

      return (
        baseHeight +
        getHeightStepOffsetAtGrid({
          containsTile: terrain.containsTile,
          getTileHeightSteps: (tileX, tileZ) =>
            candidateSteps.get(tileEditKey(tileX, tileZ)) ??
            getCurrentTileHeightSteps(terrain, edits, tileX, tileZ),
          gx: vertexX,
          gz: vertexZ,
          heightStepMeters: editConfig.heightStepMeters
        })
      );
    })
    .filter((height): height is number => height !== null);
};

const createBestFitPlaneLinearSystem = ({
  affectedTiles,
  edits,
  editConfig,
  selection,
  terrain
}: {
  affectedTiles: readonly { tileX: number; tileZ: number }[];
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  const unknownIndex = new Map<string, number>();

  affectedTiles.forEach((tile, index) => {
    unknownIndex.set(tileEditKey(tile.tileX, tile.tileZ), index);
  });

  const planeIndex = affectedTiles.length;
  const rows: { coefficients: number[]; rhs: number }[] = [];

  for (const vertexKey of getSelectionVertexKeys(selection)) {
    const [vertexXString, vertexZString] = vertexKey.split(':');
    const vertexX = Number(vertexXString);
    const vertexZ = Number(vertexZString);
    const baseHeight = sampleBaseHeight(terrain, vertexX, vertexZ, editConfig.heightStepMeters);

    if (baseHeight === null) {
      continue;
    }

    const incidentTiles = [
      [vertexX - 1, vertexZ - 1],
      [vertexX, vertexZ - 1],
      [vertexX - 1, vertexZ],
      [vertexX, vertexZ]
    ].filter(([tileX, tileZ]) => terrain.containsTile(tileX, tileZ));

    if (incidentTiles.length === 0) {
      continue;
    }

    const coefficients = new Array<number>(affectedTiles.length + 1).fill(0);
    let fixedContribution = 0;

    for (const [tileX, tileZ] of incidentTiles) {
      const key = tileEditKey(tileX, tileZ);
      const currentValue = getCurrentTileHeightSteps(terrain, edits, tileX, tileZ);
      const index = unknownIndex.get(key);

      if (index === undefined) {
        fixedContribution += currentValue;
      } else {
        coefficients[index] += 1;
      }
    }

    coefficients[planeIndex] = -(incidentTiles.length / editConfig.heightStepMeters);

    rows.push({
      coefficients,
      rhs: -fixedContribution - (incidentTiles.length * baseHeight) / editConfig.heightStepMeters
    });
  }

  return rows;
};

const solveAreaHeightEditsForTarget = ({
  edits,
  editConfig,
  explicitTargetHeight,
  selection,
  terrain
}: {
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  explicitTargetHeight?: number | null;
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  const { haloTiles, selectedTiles } = getSelectionAndHaloTiles(terrain, selection);
  const affectedTiles = [...selectedTiles, ...haloTiles];

  if (affectedTiles.length === 0) {
    return {
      haloTiles,
      heightEdits: [] as { current: ZarchTileState; heightSteps: number }[],
      targetHeight: explicitTargetHeight ?? null
    };
  }

  const solvingForBestFitPlane = explicitTargetHeight === undefined || explicitTargetHeight === null;
  const rows = solvingForBestFitPlane
    ? createBestFitPlaneLinearSystem({
        affectedTiles,
        edits,
        editConfig,
        selection: selectedTiles,
        terrain
      })
    : createLinearSystem({
        affectedTiles,
        edits,
        editConfig,
        selection: selectedTiles,
        targetHeight: explicitTargetHeight,
        terrain
      });

  const currentValues = affectedTiles.map(tile =>
    getCurrentTileHeightSteps(terrain, edits, tile.tileX, tile.tileZ)
  );
  const variableCount = solvingForBestFitPlane ? affectedTiles.length + 1 : affectedTiles.length;
  const normalMatrix = Array.from({ length: variableCount }, (_, rowIndex) =>
    Array.from({ length: variableCount }, (_, columnIndex) =>
      rowIndex === columnIndex ? SOLVER_REGULARIZATION : 0
    )
  );
  const normalVector = Array.from({ length: variableCount }, (_, index) =>
    index < currentValues.length ? currentValues[index]! * SOLVER_REGULARIZATION : 0
  );

  for (const row of rows) {
    for (let left = 0; left < row.coefficients.length; left += 1) {
      const leftValue = row.coefficients[left]!;

      if (leftValue === 0) {
        continue;
      }

      normalVector[left] += leftValue * row.rhs;

      for (let right = 0; right < row.coefficients.length; right += 1) {
        const rightValue = row.coefficients[right]!;

        if (rightValue === 0) {
          continue;
        }

        normalMatrix[left]![right] += leftValue * rightValue;
      }
    }
  }

  const solved = solveLinearSystem(normalMatrix, normalVector);
  const solvedTileSteps = solved.slice(0, affectedTiles.length);
  const rounded = solvedTileSteps.map(value =>
    Math.max(-editConfig.maxAbsHeightSteps, Math.min(editConfig.maxAbsHeightSteps, Math.round(value)))
  );

  const optimized = optimizeRoundedSolution({
    initial: rounded,
    maxAbsHeightSteps: editConfig.maxAbsHeightSteps,
    objective: candidate => {
      const heights = getSelectionVertexHeightsForCandidate({
        affectedTiles,
        candidate,
        edits,
        editConfig,
        selection: selectedTiles,
        terrain
      });
      const targetHeight =
        explicitTargetHeight ??
        (heights.length === 0
          ? 0
          : heights.reduce((total, height) => total + height, 0) / heights.length);
      let score = 0;

      for (const height of heights) {
        const residual = height - targetHeight;
        score += residual * residual;
      }

      for (let index = 0; index < candidate.length; index += 1) {
        const delta = candidate[index]! - currentValues[index]!;
        score += delta * delta * SOLVER_REGULARIZATION;
      }

      return score;
    }
  });

  const heightEdits = affectedTiles.map((tile, index) => ({
    current: getMergedTileState(terrain, edits, tile.tileX, tile.tileZ),
    heightSteps: optimized[index]!
  }));
  const optimizedHeights = getSelectionVertexHeightsForCandidate({
    affectedTiles,
    candidate: optimized,
    edits,
    editConfig,
    selection: selectedTiles,
    terrain
  });
  const targetHeight =
    explicitTargetHeight ??
    (optimizedHeights.length === 0
      ? null
      : optimizedHeights.reduce((total, height) => total + height, 0) / optimizedHeights.length);

  return {
    haloTiles,
    heightEdits,
    targetHeight
  };
};

const getSelectionAverageHeight = ({
  edits,
  editConfig,
  selection,
  terrain
}: {
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  const heights = getSelectionVertexKeys(selection)
    .map(vertexKey => {
      const [vertexXString, vertexZString] = vertexKey.split(':');
      return getCurrentVertexHeight({
        edits,
        editConfig,
        terrain,
        vertexX: Number(vertexXString),
        vertexZ: Number(vertexZString)
      });
    })
    .filter((height): height is number => height !== null);

  if (heights.length === 0) {
    return null;
  }

  return heights.reduce((total, height) => total + height, 0) / heights.length;
};

const isSelectionFlat = ({
  edits,
  editConfig,
  selection,
  terrain
}: {
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  const heights = getSelectionVertexKeys(selection)
    .map(vertexKey => {
      const [vertexXString, vertexZString] = vertexKey.split(':');
      return getCurrentVertexHeight({
        edits,
        editConfig,
        terrain,
        vertexX: Number(vertexXString),
        vertexZ: Number(vertexZString)
      });
    })
    .filter((height): height is number => height !== null);

  return isTileFlat(heights);
};

export const getAreaHeightPreview = ({
  edits,
  editConfig,
  selection,
  terrain
}: {
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  if (selection.length === 0) {
    return {
      haloTiles: [] as { tileX: number; tileZ: number }[],
      targetHeight: null
    };
  }

  const targetHeight = getSelectionAverageHeight({
    edits,
    editConfig,
    selection,
    terrain
  });
  const { haloTiles } = getSelectionAndHaloTiles(terrain, selection);

  return {
    haloTiles,
    targetHeight
  };
};

/**
 * Compute height edits for a tile tap.
 *
 * - If the tile is NOT already flat: flatten it (no raise/lower).
 *   If any edge-adjacent neighbour is already flat, match its height.
 *   Otherwise flatten to the average of the tile's current corner heights.
 * - If the tile IS already flat: apply raise (+1) or lower (-1) step.
 */
export const computeAreaHeightEdits = ({
  currentPlaneHeight,
  edits,
  editConfig,
  mode,
  selection,
  terrain,
}: {
  currentPlaneHeight?: number | null;
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  mode: 'flatten' | 'lower' | 'raise';
  selection: readonly { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
}) => {
  if (selection.length === 0) {
    return {
      haloTiles: [] as { tileX: number; tileZ: number }[],
      heightEdits: [] as { current: ZarchTileState; heightSteps: number }[],
      targetHeight: null
    };
  }

  const averageHeight = getSelectionAverageHeight({
    edits,
    editConfig,
    selection,
    terrain
  });

  if (averageHeight === null) {
    return {
      haloTiles: [] as { tileX: number; tileZ: number }[],
      heightEdits: [] as { current: ZarchTileState; heightSteps: number }[],
      targetHeight: null
    };
  }

  const explicitTargetHeight =
    mode === 'flatten'
      ? null
      : (currentPlaneHeight ?? averageHeight) +
        (mode === 'raise' ? 1 : -1) * editConfig.heightStepMeters;

  const { haloTiles, heightEdits, targetHeight } = solveAreaHeightEditsForTarget({
    edits,
    editConfig,
    explicitTargetHeight,
    selection,
    terrain
  });

  return {
    haloTiles,
    heightEdits,
    targetHeight
  };
};

export const computeHeightEdits = ({
  edits,
  editConfig,
  lower,
  terrain,
  tileX,
  tileZ
}: {
  edits: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig;
  lower: boolean;
  terrain: ZarchTerrain;
  tileX: number;
  tileZ: number;
}) =>
  computeAreaHeightEdits({
    currentPlaneHeight: null,
    edits,
    editConfig,
    mode: lower ? 'lower' : 'flatten',
    selection: [{ tileX, tileZ }],
    terrain
  }).heightEdits;

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
        (getTileAverageHeight(tileX, tileZ) ?? 0) <= WATER_LEVEL
      );
    },
    isWaterTile: (tileX, tileZ) => {
      const average = getTileAverageHeight(tileX, tileZ);
      return average !== null && average <= WATER_LEVEL;
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
