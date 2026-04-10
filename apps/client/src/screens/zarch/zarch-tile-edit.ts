import { Color } from 'three';

import type { ZarchTileEditConfig } from 'carrier-contracts/types';
import {
  DEFAULT_ZARCH_TILE_TYPE_ID,
  computeAreaHeightEdits,
  computeHeightEdits,
  createZarchTileEditState,
  getAreaHeightPreview,
  getDraftEdits,
  getHeightSelectionTiles,
  getHeightStepOffsetAtGrid,
  getMergedTileState,
  getPreviewHaloTiles,
  getTerrainTileState,
  reduceZarchTileEditState,
  tileEditKey,
  type ZarchTileDraftEdits,
  type ZarchTileEditAction,
  type ZarchTileEditSnapshot,
  type ZarchTileEditState,
  type ZarchTileEditTool,
  type ZarchTileState
} from 'carrier-terrain-edit';

import {
  TILE,
  WATER_LEVEL,
  applyTileColor,
  sampleHeightAtWorldFromGrid,
  sampleNormalAtWorldFromGrid,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

export {
  computeAreaHeightEdits,
  computeHeightEdits,
  createZarchTileEditState,
  getAreaHeightPreview,
  getDraftEdits,
  getHeightSelectionTiles,
  getMergedTileState,
  getPreviewHaloTiles,
  getTerrainTileState,
  reduceZarchTileEditState,
  type ZarchTileDraftEdits,
  type ZarchTileEditAction,
  type ZarchTileEditSnapshot,
  type ZarchTileEditState,
  type ZarchTileEditTool,
  type ZarchTileState
};

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
