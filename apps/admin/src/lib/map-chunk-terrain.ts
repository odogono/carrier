import {
  MAP_SURFACE_MATERIALS,
  ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
  ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
  resolveSurfaceMaterial,
  type MapMetadata,
  type MapSurfaceMaterial,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';
import {
  DEFAULT_ZARCH_TILE_TYPE_ID,
  getHeightStepOffsetAtGrid,
  tileEditKey,
  type ZarchTileDraftEdits
} from 'carrier-terrain-edit';

type ChunkMapTerrainOptions = {
  chunks: Map<string, RuntimeMapChunk>;
  draftEdits?: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig | null;
  map: MapMetadata;
};

export type ChunkMapTerrain = ReturnType<typeof createChunkMapTerrain>;

const getChunkForSample = (
  chunks: Map<string, RuntimeMapChunk>,
  sampleX: number,
  sampleZ: number
) => {
  for (const chunk of chunks.values()) {
    const localX = sampleX - chunk.originTileX;
    const localZ = sampleZ - chunk.originTileZ;

    if (
      localX >= 0 &&
      localZ >= 0 &&
      localX < chunk.samplesWide &&
      localZ < chunk.samplesHigh
    ) {
      return chunk;
    }
  }

  return null;
};

const getTileChunk = (
  chunks: Map<string, RuntimeMapChunk>,
  gx: number,
  gz: number
) => {
  for (const chunk of chunks.values()) {
    const localX = gx - chunk.originTileX;
    const localZ = gz - chunk.originTileZ;

    if (
      localX >= 0 &&
      localZ >= 0 &&
      localX < chunk.tileWidth &&
      localZ < chunk.tileHeight
    ) {
      return chunk;
    }
  }

  return null;
};

const getTileLayerIndex = (
  chunk: Pick<
    RuntimeMapChunk,
    'originTileX' | 'originTileZ' | 'tileHeight' | 'tileWidth'
  >,
  gx: number,
  gz: number
) => {
  const localX = gx - chunk.originTileX;
  const localZ = gz - chunk.originTileZ;

  if (
    localX < 0 ||
    localZ < 0 ||
    localX >= chunk.tileWidth ||
    localZ >= chunk.tileHeight
  ) {
    return null;
  }

  return localZ * chunk.tileWidth + localX;
};

export const createChunkMapTerrain = ({
  chunks,
  draftEdits,
  editConfig,
  map
}: ChunkMapTerrainOptions) => {
  const containsTile = (gx: number, gz: number) =>
    map.extent.kind === 'finite'
      ? gx >= 0 &&
        gz >= 0 &&
        gx < map.extent.widthTiles &&
        gz < map.extent.heightTiles
      : true;

  const sampleBaseHeight = (sampleX: number, sampleZ: number) => {
    const chunk = getChunkForSample(chunks, sampleX, sampleZ);

    if (!chunk) {
      return null;
    }

    const localX = sampleX - chunk.originTileX;
    const localZ = sampleZ - chunk.originTileZ;
    return chunk.heights[localZ * chunk.samplesWide + localX] ?? null;
  };

  const getTileHeightSteps = (gx: number, gz: number) => {
    const draftHeightSteps = draftEdits?.[tileEditKey(gx, gz)]?.heightSteps;

    if (draftHeightSteps !== undefined) {
      return draftHeightSteps;
    }

    const chunk = getTileChunk(chunks, gx, gz);

    if (!chunk?.tileHeightSteps) {
      return 0;
    }

    const index = getTileLayerIndex(chunk, gx, gz);
    return index === null ? 0 : (chunk.tileHeightSteps[index] ?? 0);
  };

  const getTileTypeId = (gx: number, gz: number) => {
    const draftTypeId = draftEdits?.[tileEditKey(gx, gz)]?.typeId;

    if (draftTypeId !== undefined) {
      return draftTypeId;
    }

    const chunk = getTileChunk(chunks, gx, gz);

    if (!chunk?.tileTypeIndexes || !editConfig) {
      return DEFAULT_ZARCH_TILE_TYPE_ID;
    }

    const index = getTileLayerIndex(chunk, gx, gz);
    const typeIndex =
      index === null ? ZARCH_TILE_OVERRIDE_TYPE_SENTINEL : chunk.tileTypeIndexes[index];

    if (
      typeIndex === undefined ||
      typeIndex === ZARCH_TILE_OVERRIDE_TYPE_SENTINEL
    ) {
      return DEFAULT_ZARCH_TILE_TYPE_ID;
    }

    return editConfig.tileTypes[typeIndex]?.id ?? DEFAULT_ZARCH_TILE_TYPE_ID;
  };

  const getTileColorIndex = (gx: number, gz: number) => {
    const draftColorIndex = draftEdits?.[tileEditKey(gx, gz)]?.colorIndex;

    if (draftColorIndex !== undefined) {
      return draftColorIndex;
    }

    const chunk = getTileChunk(chunks, gx, gz);

    if (!chunk?.tileColorIndexes) {
      return null;
    }

    const index = getTileLayerIndex(chunk, gx, gz);
    const colorIndex =
      index === null ? ZARCH_TILE_OVERRIDE_COLOR_SENTINEL : chunk.tileColorIndexes[index];

    if (
      colorIndex === undefined ||
      colorIndex === ZARCH_TILE_OVERRIDE_COLOR_SENTINEL
    ) {
      return null;
    }

    return colorIndex;
  };

  const getTileColorHex = (gx: number, gz: number) => {
    if (!editConfig) {
      return null;
    }

    const colorIndex = getTileColorIndex(gx, gz);
    return colorIndex === null ? null : (editConfig.palette[colorIndex]?.hex ?? null);
  };

  const sampleHeight = (sampleX: number, sampleZ: number) => {
    const baseHeight = sampleBaseHeight(sampleX, sampleZ);

    if (baseHeight === null || !editConfig) {
      return baseHeight;
    }

    return (
      baseHeight +
      getHeightStepOffsetAtGrid({
        containsTile,
        getTileHeightSteps,
        gx: sampleX,
        gz: sampleZ,
        heightStepMeters: editConfig.heightStepMeters
      })
    );
  };

  const getTileAverageHeight = (gx: number, gz: number) => {
    const h00 = sampleHeight(gx, gz);
    const h10 = sampleHeight(gx + 1, gz);
    const h01 = sampleHeight(gx, gz + 1);
    const h11 = sampleHeight(gx + 1, gz + 1);

    if (h00 === null || h10 === null || h01 === null || h11 === null) {
      return null;
    }

    return (h00 + h10 + h01 + h11) * 0.25;
  };

  const getTileBaseAverageHeight = (gx: number, gz: number) => {
    const h00 = sampleBaseHeight(gx, gz);
    const h10 = sampleBaseHeight(gx + 1, gz);
    const h01 = sampleBaseHeight(gx, gz + 1);
    const h11 = sampleBaseHeight(gx + 1, gz + 1);

    if (h00 === null || h10 === null || h01 === null || h11 === null) {
      return null;
    }

    return (h00 + h10 + h01 + h11) * 0.25;
  };

  const getTileMaterial = (gx: number, gz: number) => {
    const chunk = getTileChunk(chunks, gx, gz);

    if (!chunk?.materials) {
      return null;
    }

    const index = getTileLayerIndex(chunk, gx, gz);
    return index === null ? null : (chunk.materials[index] ?? null);
  };

  const resolveTileMaterial = (gx: number, gz: number, elevation: number) =>
    resolveSurfaceMaterial(gx, gz, elevation, getTileMaterial(gx, gz));

  return {
    containsTile,
    getTileAverageHeight,
    getTileBaseAverageHeight,
    getTileColorHex,
    getTileColorIndex,
    getTileHeightSteps,
    getTileMaterial,
    getTileTypeId,
    resolveTileMaterial,
    sampleBaseHeight,
    sampleHeight
  };
};

export const getChunkTileCoordinates = (chunk: RuntimeMapChunk) => {
  const tiles: Array<{ tileX: number; tileZ: number }> = [];

  for (let localZ = 0; localZ < chunk.tileHeight; localZ += 1) {
    for (let localX = 0; localX < chunk.tileWidth; localX += 1) {
      tiles.push({
        tileX: chunk.originTileX + localX,
        tileZ: chunk.originTileZ + localZ
      });
    }
  }

  return tiles;
};

export const getSurfaceMaterialIndex = (material: MapSurfaceMaterial | null) =>
  material ? MAP_SURFACE_MATERIALS.indexOf(material) : -1;
