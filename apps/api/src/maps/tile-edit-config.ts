import type { ZarchTileEditConfig } from 'carrier-contracts';
import {
  DEFAULT_ZARCH_TILE_TYPE_ID,
  LANDING_PAD_ZARCH_TILE_TYPE_ID,
  ZARCH_TILE_EDIT_HEIGHT_STEP_METERS,
  ZARCH_TILE_EDIT_MAX_ABS_HEIGHT_STEPS
} from 'carrier-contracts';

export { DEFAULT_ZARCH_TILE_TYPE_ID, LANDING_PAD_ZARCH_TILE_TYPE_ID };

export const ZARCH_TILE_EDIT_CONFIG: ZarchTileEditConfig = {
  heightStepMeters: ZARCH_TILE_EDIT_HEIGHT_STEP_METERS,
  maxAbsHeightSteps: ZARCH_TILE_EDIT_MAX_ABS_HEIGHT_STEPS,
  palette: [
    { hex: '#c8b878', id: 'sand', label: 'Sand' },
    { hex: '#6aaa38', id: 'grass', label: 'Grass' },
    { hex: '#8c7a58', id: 'rock', label: 'Rock' },
    { hex: '#605a54', id: 'road', label: 'Road' },
    { hex: '#d6c64a', id: 'pad-yellow', label: 'Pad Yellow' },
    { hex: '#d1822b', id: 'warning-orange', label: 'Warning Orange' },
    { hex: '#b84a32', id: 'beacon-red', label: 'Beacon Red' },
    { hex: '#4aa3b8', id: 'signal-cyan', label: 'Signal Cyan' }
  ],
  tileTypes: [
    { id: DEFAULT_ZARCH_TILE_TYPE_ID, label: 'Normal' },
    { id: LANDING_PAD_ZARCH_TILE_TYPE_ID, label: 'Landing Pad' }
  ]
};

const tileTypeIndexById = new Map(
  ZARCH_TILE_EDIT_CONFIG.tileTypes.map((tileType, index) => [tileType.id, index])
);

export const getTileTypeIndex = (typeId: string) =>
  tileTypeIndexById.get(typeId) ?? null;

