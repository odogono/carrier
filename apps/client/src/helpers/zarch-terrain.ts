import { Color } from 'three';

export const TILE = 24;
export const GRID = 32;
export const VIEW_R_BASE = 6;
export const WATER_LEVEL = -10;
export const SEA_Y = -12;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.5;
export const SCORE_POLL_MS = 100;
export const MINIMAP_POLL_MS = 150;
export const DEFAULT_WAVE = 1;
export const DEFAULT_BEST = 652;
export const TREE_POOL_SIZE = 160;
export const MAX_VIEW_RADIUS = Math.round(VIEW_R_BASE * ZOOM_MAX);
export const TILE_POOL_SIZE = (MAX_VIEW_RADIUS * 2 + 1) ** 2;

export type ZarchTreeType = 0 | 1;

export type ZarchTerrain = {
  chunkSizeTiles: number;
  containsTile: (gx: number, gz: number) => boolean;
  getTileAverageHeight: (gx: number, gz: number) => number | null;
  heightTiles: number;
  id: string;
  isTileLoaded: (gx: number, gz: number) => boolean;
  isWaterTile: (gx: number, gz: number) => boolean;
  requestVisibleChunks: (
    centerTileX: number,
    centerTileZ: number,
    viewRadiusTiles: number
  ) => void;
  sampleHeight: (gx: number, gz: number) => number | null;
  shouldHaveTree: (gx: number, gz: number) => boolean;
  tileColor: (
    gx: number,
    gz: number,
    elevation: number,
    target?: Color
  ) => Color;
  treeType: (gx: number, gz: number) => ZarchTreeType;
  widthTiles: number;
};
const BASE_WATER_COLOR = 0x18_58_a0;
const HIGH_ROCK_COLOR = 0x8c_7a_58;
const UPPER_GRASS_COLOR = 0x7a_98_48;
const MID_GRASS_COLOR = 0x6a_aa_38;
const LOW_GRASS_COLOR = 0x88_b8_50;
const SHORE_COLOR = 0xc8_b8_78;

export const clampZoom = (zoom: number) =>
  Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));

export const toroidalIndex = (gx: number, gz: number, grid = GRID) =>
  (gz & (grid - 1)) * grid + (gx & (grid - 1));

export const sampleHeightFromHeights = (
  heights: Float32Array,
  gx: number,
  gz: number,
  grid = GRID
) => heights[toroidalIndex(gx, gz, grid)];

export const getTileAverageHeightFromHeights = (
  heights: Float32Array,
  gx: number,
  gz: number,
  grid = GRID
) =>
  (sampleHeightFromHeights(heights, gx, gz, grid) +
    sampleHeightFromHeights(heights, gx + 1, gz, grid) +
    sampleHeightFromHeights(heights, gx, gz + 1, grid) +
    sampleHeightFromHeights(heights, gx + 1, gz + 1, grid)) *
  0.25;

export const isWaterTileFromHeights = (
  heights: Float32Array,
  gx: number,
  gz: number,
  grid = GRID
) => getTileAverageHeightFromHeights(heights, gx, gz, grid) < WATER_LEVEL;

export const tileHash = (gx: number, gz: number) => {
  const value = Math.sin(gx * 127.1 + gz * 311.7) * 43_758.5453;
  return value - Math.floor(value);
};

export const shouldHaveTree = (gx: number, gz: number) =>
  tileHash(gx, gz) < 0.1;

export const getTreeType = (gx: number, gz: number): ZarchTreeType => {
  const value = Math.sin(gx * 311.7 + gz * 127.1) * 43_758.5453;
  return value - Math.floor(value) < 0.5 ? 0 : 1;
};

export const applyTileColor = (
  target: Color = new Color(),
  gx: number,
  gz: number,
  elevation: number
) => {
  if (elevation < WATER_LEVEL) {
    const depthVariation = tileHash(gx, gz) * 0.08;
    return target.setHex(BASE_WATER_COLOR).offsetHSL(0, 0, depthVariation - 0.04);
  }

  const jitteredElevation = elevation + (tileHash(gx, gz) - 0.5) * 6;

  if (jitteredElevation > 18) {
    target.setHex(HIGH_ROCK_COLOR);
  } else if (jitteredElevation > 10) {
    target.setHex(UPPER_GRASS_COLOR);
  } else if (jitteredElevation > 2) {
    target.setHex(MID_GRASS_COLOR);
  } else if (jitteredElevation > -4) {
    target.setHex(LOW_GRASS_COLOR);
  } else {
    target.setHex(SHORE_COLOR);
  }

  const brightnessVariation = 0.88 + tileHash(gz * 3 + 5, gx * 7 + 3) * 0.24;
  return target.multiplyScalar(brightnessVariation);
};
