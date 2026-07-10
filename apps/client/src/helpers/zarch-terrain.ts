import { Color } from 'three';

import {
  getSurfaceMaterialColorRgb,
  resolveSurfaceMaterial,
  tileHash,
  type MapSurfaceMaterial
} from 'carrier-contracts';

export { DEFAULT_ZARCH_TILE_TYPE_ID, LANDING_PAD_ZARCH_TILE_TYPE_ID, tileHash } from 'carrier-contracts';

export const TILE = 24;
export const GRID = 32;
export const VIEW_R_BASE = 6;
export const WATER_LEVEL = 0;
export const SEA_Y = -12;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.5;
export const LANDSCAPE_CLIP_SCALE_MIN = 1;
export const LANDSCAPE_CLIP_SCALE_MAX = 10;
export const SCORE_POLL_MS = 100;
export const MINIMAP_POLL_MS = 150;
export const DEFAULT_WAVE = 1;
export const DEFAULT_BEST = 652;
export const MAX_VIEW_RADIUS = Math.ceil(
  VIEW_R_BASE * ZOOM_MAX * LANDSCAPE_CLIP_SCALE_MAX
);
export const TILE_POOL_SIZE = (MAX_VIEW_RADIUS * 2 + 1) ** 2;
export const TREE_POOL_SIZE = TILE_POOL_SIZE;

export type ZarchTreeType = 0 | 1;

export type ZarchTerrain = {
  chunkSizeTiles: number;
  containsTile: (gx: number, gz: number) => boolean;
  getTileAverageHeight: (gx: number, gz: number) => number | null;
  getTileColorHex: (gx: number, gz: number) => string | null;
  getTileColorIndex: (gx: number, gz: number) => number | null;
  getTileHeightSteps: (gx: number, gz: number) => number;
  getTileTypeId: (gx: number, gz: number) => string;
  heightTiles: number | null;
  id: string;
  isTileLoaded: (gx: number, gz: number) => boolean;
  isWaterAtWorld: (worldX: number, worldZ: number) => boolean;
  isWaterTile: (gx: number, gz: number) => boolean;
  isWorldPointLoaded: (worldX: number, worldZ: number) => boolean;
  requestVisibleChunks: (
    centerTileX: number,
    centerTileZ: number,
    viewRadiusTiles: number
  ) => void;
  resolveTileMaterial: (
    gx: number,
    gz: number,
    elevation: number
  ) => MapSurfaceMaterial;
  sampleHeight: (gx: number, gz: number) => number | null;
  sampleHeightAtWorld: (worldX: number, worldZ: number) => number | null;
  sampleNormalAtWorld: (
    worldX: number,
    worldZ: number
  ) => {
    x: number;
    y: number;
    z: number;
  } | null;
  shouldHaveTree: (gx: number, gz: number) => boolean;
  tileColor: (
    gx: number,
    gz: number,
    elevation: number,
    target?: Color
  ) => Color;
  treeType: (gx: number, gz: number) => ZarchTreeType;
  widthTiles: number | null;
  wrapX: boolean;
  wrapZ: boolean;
};
export const clampZoom = (zoom: number, min = ZOOM_MIN, max = ZOOM_MAX) =>
  Math.max(min, Math.min(max, zoom));

export const getLandscapeViewMetrics = ({
  landscapeClipScale,
  viewRadiusBase,
  zoom
}: {
  landscapeClipScale: number;
  viewRadiusBase: number;
  zoom: number;
}) => {
  const cameraZoomRadius = viewRadiusBase * zoom;
  const visibleZoomRadius = cameraZoomRadius * landscapeClipScale;

  return {
    cameraClipRadius: Math.max((cameraZoomRadius - 0.6) * TILE, TILE),
    cameraZoomRadius,
    clipRadius: Math.max((visibleZoomRadius - 0.6) * TILE, TILE),
    viewRadius: Math.ceil(visibleZoomRadius),
    visibleZoomRadius
  };
};

export const toroidalIndex = (gx: number, gz: number, grid = GRID) =>
  (gz & (grid - 1)) * grid + (gx & (grid - 1));

export const sampleHeightFromHeights = (
  heights: Float32Array,
  gx: number,
  gz: number,
  grid = GRID
) => heights[toroidalIndex(gx, gz, grid)];

export const getHeightStepOffsetAtGrid = ({
  containsTile,
  getTileHeightSteps,
  gx,
  gz,
  heightStepMeters
}: {
  containsTile: (gx: number, gz: number) => boolean;
  getTileHeightSteps: (gx: number, gz: number) => number;
  gx: number;
  gz: number;
  heightStepMeters: number;
}) => {
  let totalOffset = 0;
  let count = 0;

  for (const [tileX, tileZ] of [
    [gx - 1, gz - 1],
    [gx, gz - 1],
    [gx - 1, gz],
    [gx, gz]
  ]) {
    if (!containsTile(tileX, tileZ)) {
      continue;
    }

    totalOffset += getTileHeightSteps(tileX, tileZ) * heightStepMeters;
    count += 1;
  }

  return count === 0 ? 0 : totalOffset / count;
};

export const sampleConnectedHeightFromGrid = ({
  containsTile,
  getTileHeightSteps,
  gx,
  gz,
  heightStepMeters,
  sampleBaseHeight
}: {
  containsTile: (gx: number, gz: number) => boolean;
  getTileHeightSteps: (gx: number, gz: number) => number;
  gx: number;
  gz: number;
  heightStepMeters: number;
  sampleBaseHeight: (gx: number, gz: number) => number | null;
}) => {
  const baseHeight = sampleBaseHeight(gx, gz);

  if (baseHeight === null) {
    return null;
  }

  return (
    baseHeight +
    getHeightStepOffsetAtGrid({
      containsTile,
      getTileHeightSteps,
      gx,
      gz,
      heightStepMeters
    })
  );
};

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
) => getTileAverageHeightFromHeights(heights, gx, gz, grid) <= WATER_LEVEL;

export const shouldHaveTree = (gx: number, gz: number) =>
  tileHash(gx, gz) < 0.1;

export const sampleHeightAtWorldFromGrid = (
  sampleHeight: (gx: number, gz: number) => number | null,
  worldX: number,
  worldZ: number
) => {
  const gridX = worldX / TILE;
  const gridZ = worldZ / TILE;
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = gridX - x0;
  const tz = gridZ - z0;
  const h00 = sampleHeight(x0, z0);
  const h10 = sampleHeight(x1, z0);
  const h01 = sampleHeight(x0, z1);
  const h11 = sampleHeight(x1, z1);

  if (h00 === null || h10 === null || h01 === null || h11 === null) {
    return null;
  }

  const top = h00 * (1 - tx) + h10 * tx;
  const bottom = h01 * (1 - tx) + h11 * tx;
  return top * (1 - tz) + bottom * tz;
};

export const createSampleHeightAtWorld = (
  getTileHeightSteps: (gx: number, gz: number) => number,
  getTileAverageHeight: (gx: number, gz: number) => number | null,
  sampleHeight: (gx: number, gz: number) => number | null
) => (worldX: number, worldZ: number) => {
  const gx = Math.floor(worldX / TILE);
  const gz = Math.floor(worldZ / TILE);

  if (getTileHeightSteps(gx, gz) !== 0) {
    return getTileAverageHeight(gx, gz);
  }

  return sampleHeightAtWorldFromGrid(sampleHeight, worldX, worldZ);
};

export const sampleNormalAtWorldFromGrid = (
  sampleHeightAtWorld: (worldX: number, worldZ: number) => number | null,
  worldX: number,
  worldZ: number,
  offset = TILE * 0.25
) => {
  const left = sampleHeightAtWorld(worldX - offset, worldZ);
  const right = sampleHeightAtWorld(worldX + offset, worldZ);
  const down = sampleHeightAtWorld(worldX, worldZ - offset);
  const up = sampleHeightAtWorld(worldX, worldZ + offset);

  if (left === null || right === null || down === null || up === null) {
    return null;
  }

  const dx = (right - left) / (offset * 2);
  const dz = (up - down) / (offset * 2);
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const length = Math.hypot(nx, ny, nz);

  if (length === 0) {
    return { x: 0, y: 1, z: 0 };
  }

  return {
    x: nx / length,
    y: ny / length,
    z: nz / length
  };
};

export const getTreeType = (gx: number, gz: number): ZarchTreeType => {
  const value = Math.sin(gx * 311.7 + gz * 127.1) * 43_758.5453;
  return value - Math.floor(value) < 0.5 ? 0 : 1;
};

export const applyTileColor = (
  target: Color = new Color(),
  gx: number,
  gz: number,
  elevation: number,
  material?: MapSurfaceMaterial | null
) => {
  const resolvedMaterial = resolveSurfaceMaterial(gx, gz, elevation, material);
  const [r, g, b] = getSurfaceMaterialColorRgb(resolvedMaterial, gx, gz);
  return target.setRGB(r / 255, g / 255, b / 255);
};
