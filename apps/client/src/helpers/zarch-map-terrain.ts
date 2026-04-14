import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
  ZARCH_TILE_OVERRIDE_TYPE_SENTINEL,
  isFiniteMap,
  resolveSurfaceMaterial,
  type MapMetadata,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';

import {
  DEFAULT_ZARCH_TILE_TYPE_ID,
  WATER_LEVEL,
  applyTileColor,
  getTreeType,
  sampleConnectedHeightFromGrid,
  sampleHeightAtWorldFromGrid,
  sampleNormalAtWorldFromGrid,
  shouldHaveTree,
  TILE,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

type ChunkPrefetcher = (chunkX: number, chunkZ: number) => void;

const positiveModulo = (value: number, modulus: number) =>
  ((value % modulus) + modulus) % modulus;

const isToroidalWrappedMap = (map: MapMetadata) =>
  isFiniteMap(map) && map.extent.wrapX && map.extent.wrapZ;

const getFiniteChunkCount = (tileCount: number, chunkSizeTiles: number) =>
  Math.max(Math.ceil(tileCount / chunkSizeTiles), 1);

const wrapCoordinate = (value: number, size: number) =>
  size <= 0 ? 0 : positiveModulo(value, size);

export const getMapChunkQueryKey = (
  mapId: string,
  chunkX: number,
  chunkZ: number,
  revision?: number
) =>
  revision === undefined
    ? (['map-chunk', mapId, chunkX, chunkZ] as const satisfies QueryKey)
    : ([
        'map-chunk',
        mapId,
        chunkX,
        chunkZ,
        revision
      ] as const satisfies QueryKey);

export const getMapMetadataQueryKey = (mapId: string) =>
  ['map', mapId] as const satisfies QueryKey;

export const getMapListQueryKey = () => ['maps'] as const satisfies QueryKey;

export const getVisibleChunkWindow = (
  map: MapMetadata,
  centerTileX: number,
  centerTileZ: number,
  viewRadiusTiles: number,
  extraChunkRing = 1
) => {
  const chunkSize = map.resolution.chunkSizeTiles;

  if (isFiniteMap(map)) {
    if (!map.extent.wrapX || !map.extent.wrapZ) {
      const maxChunkX = Math.max(Math.ceil(map.extent.widthTiles / chunkSize) - 1, 0);
      const maxChunkZ = Math.max(Math.ceil(map.extent.heightTiles / chunkSize) - 1, 0);
      const minTileX = Math.max(centerTileX - viewRadiusTiles, 0);
      const maxTileX = Math.min(centerTileX + viewRadiusTiles, map.extent.widthTiles - 1);
      const minTileZ = Math.max(centerTileZ - viewRadiusTiles, 0);
      const maxTileZ = Math.min(centerTileZ + viewRadiusTiles, map.extent.heightTiles - 1);

      return {
        maxChunkX: Math.min(Math.floor(maxTileX / chunkSize) + extraChunkRing, maxChunkX),
        maxChunkZ: Math.min(Math.floor(maxTileZ / chunkSize) + extraChunkRing, maxChunkZ),
        minChunkX: Math.max(Math.floor(minTileX / chunkSize) - extraChunkRing, 0),
        minChunkZ: Math.max(Math.floor(minTileZ / chunkSize) - extraChunkRing, 0)
      };
    }
  }

  // Infinite map: no bounds clamping, signed chunk coords
  const minTileX = centerTileX - viewRadiusTiles;
  const maxTileX = centerTileX + viewRadiusTiles;
  const minTileZ = centerTileZ - viewRadiusTiles;
  const maxTileZ = centerTileZ + viewRadiusTiles;

  return {
    maxChunkX: Math.floor(maxTileX / chunkSize) + extraChunkRing,
    maxChunkZ: Math.floor(maxTileZ / chunkSize) + extraChunkRing,
    minChunkX: Math.floor(minTileX / chunkSize) - extraChunkRing,
    minChunkZ: Math.floor(minTileZ / chunkSize) - extraChunkRing
  };
};

const getChunkForSample = (
  queryClient: QueryClient,
  map: MapMetadata,
  sampleX: number,
  sampleZ: number
) => {
  const chunkSize = map.resolution.chunkSizeTiles;

  if (isFiniteMap(map)) {
    if (!map.extent.wrapX || !map.extent.wrapZ) {
      if (
        sampleX < 0 ||
        sampleZ < 0 ||
        sampleX > map.extent.widthTiles ||
        sampleZ > map.extent.heightTiles
      ) {
        return null;
      }

      const maxChunkX = Math.max(Math.ceil(map.extent.widthTiles / chunkSize) - 1, 0);
      const maxChunkZ = Math.max(Math.ceil(map.extent.heightTiles / chunkSize) - 1, 0);
      const chunkX = Math.min(Math.floor(sampleX / chunkSize), maxChunkX);
      const chunkZ = Math.min(Math.floor(sampleZ / chunkSize), maxChunkZ);

      return (
        queryClient.getQueryData<RuntimeMapChunk>(
          getMapChunkQueryKey(map.id, chunkX, chunkZ, map.revision)
        ) ??
        null
      );
    }

    const canonicalSampleX = wrapCoordinate(sampleX, map.extent.widthTiles);
    const canonicalSampleZ = wrapCoordinate(sampleZ, map.extent.heightTiles);
    const chunkX = Math.min(
      Math.floor(canonicalSampleX / chunkSize),
      getFiniteChunkCount(map.extent.widthTiles, chunkSize) - 1
    );
    const chunkZ = Math.min(
      Math.floor(canonicalSampleZ / chunkSize),
      getFiniteChunkCount(map.extent.heightTiles, chunkSize) - 1
    );

    return (
      queryClient.getQueryData<RuntimeMapChunk>(
        getMapChunkQueryKey(map.id, chunkX, chunkZ, map.revision)
      ) ??
      null
    );
  }

  // Infinite map: signed chunk coords, no bounds check
  const chunkX = Math.floor(sampleX / chunkSize);
  const chunkZ = Math.floor(sampleZ / chunkSize);

  return (
    queryClient.getQueryData<RuntimeMapChunk>(
      getMapChunkQueryKey(map.id, chunkX, chunkZ, map.revision)
    ) ??
    null
  );
};

const sampleHeightFromChunk = (
  chunk: RuntimeMapChunk,
  sampleX: number,
  sampleZ: number
) => {
  const localX = sampleX - chunk.originTileX;
  const localZ = sampleZ - chunk.originTileZ;

  if (
    localX < 0 ||
    localZ < 0 ||
    localX >= chunk.samplesWide ||
    localZ >= chunk.samplesHigh
  ) {
    return null;
  }

  return chunk.heights[localZ * chunk.samplesWide + localX] ?? null;
};

const getMaterialFromChunk = (
  chunk: RuntimeMapChunk,
  gx: number,
  gz: number
) => {
  if (!chunk.materials) {
    return null;
  }

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

  return chunk.materials[localZ * chunk.tileWidth + localX] ?? null;
};

const getTileLayerIndexFromChunk = (
  chunk: Pick<RuntimeMapChunk, 'originTileX' | 'originTileZ' | 'tileWidth' | 'tileHeight'>,
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

export const createServerMapTerrain = ({
  editConfig,
  map,
  prefetchChunk,
  queryClient
}: {
  editConfig: ZarchTileEditConfig;
  map: MapMetadata;
  prefetchChunk: ChunkPrefetcher;
  queryClient: QueryClient;
}): ZarchTerrain => {
  const chunkLookupCache = new Map<string, RuntimeMapChunk | null>();
  const baseHeightLookupCache = new Map<string, number | null>();
  const connectedHeightLookupCache = new Map<string, number | null>();
  const tileAverageHeightLookupCache = new Map<string, number | null>();
  const tileHeightStepLookupCache = new Map<string, number>();
  const mapWidthTiles = isFiniteMap(map) ? map.extent.widthTiles : null;
  const mapHeightTiles = isFiniteMap(map) ? map.extent.heightTiles : null;
  const chunkSize = map.resolution.chunkSizeTiles;
  const wrappedFinite = isToroidalWrappedMap(map);
  const chunkCountX =
    wrappedFinite && mapWidthTiles !== null
      ? getFiniteChunkCount(mapWidthTiles, chunkSize)
      : null;
  const chunkCountZ =
    wrappedFinite && mapHeightTiles !== null
      ? getFiniteChunkCount(mapHeightTiles, chunkSize)
      : null;

  const canonicalize = (x: number, z: number) => {
    if (!wrappedFinite || mapWidthTiles === null || mapHeightTiles === null) {
      return { x, z };
    }

    return {
      x: wrapCoordinate(x, mapWidthTiles),
      z: wrapCoordinate(z, mapHeightTiles)
    };
  };

  const sampleBaseHeight = (sampleX: number, sampleZ: number) => {
    const c = canonicalize(sampleX, sampleZ);
    const heightKey = `${c.x}:${c.z}`;
    const cachedHeight = baseHeightLookupCache.get(heightKey);

    if (cachedHeight !== undefined) {
      return cachedHeight;
    }

    const chunkKey = `${Math.floor(c.x / chunkSize)}:${Math.floor(c.z / chunkSize)}`;
    let chunk = chunkLookupCache.get(chunkKey);

    if (chunk === undefined) {
      chunk = getChunkForSample(queryClient, map, c.x, c.z);
      chunkLookupCache.set(chunkKey, chunk);
    }

    if (!chunk) {
      baseHeightLookupCache.set(heightKey, null);
      return null;
    }

    const value = sampleHeightFromChunk(chunk, c.x, c.z);
    baseHeightLookupCache.set(heightKey, value);
    return value;
  };

  const getTileHeightSteps = (gx: number, gz: number) => {
    const c = canonicalize(gx, gz);
    const tileKey = `${c.x}:${c.z}`;
    const cachedHeightStep = tileHeightStepLookupCache.get(tileKey);

    if (cachedHeightStep !== undefined) {
      return cachedHeightStep;
    }

    const chunk = getChunkForSample(queryClient, map, c.x, c.z);

    if (!chunk?.tileHeightSteps) {
      tileHeightStepLookupCache.set(tileKey, 0);
      return 0;
    }

    const index = getTileLayerIndexFromChunk(chunk, c.x, c.z);
    const value = index === null ? 0 : (chunk.tileHeightSteps[index] ?? 0);
    tileHeightStepLookupCache.set(tileKey, value);
    return value;
  };

  const sampleHeight = (sampleX: number, sampleZ: number) => {
    const c = canonicalize(sampleX, sampleZ);
    const heightKey = `${c.x}:${c.z}`;
    const cachedHeight = connectedHeightLookupCache.get(heightKey);

    if (cachedHeight !== undefined) {
      return cachedHeight;
    }

    const value = sampleConnectedHeightFromGrid({
      containsTile,
      getTileHeightSteps,
      gx: c.x,
      gz: c.z,
      heightStepMeters: editConfig.heightStepMeters,
      sampleBaseHeight
    });
    connectedHeightLookupCache.set(heightKey, value);
    return value;
  };

  const getTileAverageHeight = (gx: number, gz: number) => {
    const c = canonicalize(gx, gz);
    const tileKey = `${c.x}:${c.z}`;
    const cachedAverage = tileAverageHeightLookupCache.get(tileKey);

    if (cachedAverage !== undefined) {
      return cachedAverage;
    }

    const h00 = sampleHeight(gx, gz);
    const h10 = sampleHeight(gx + 1, gz);
    const h01 = sampleHeight(gx, gz + 1);
    const h11 = sampleHeight(gx + 1, gz + 1);

    if (
      h00 === null ||
      h10 === null ||
      h01 === null ||
      h11 === null
    ) {
      tileAverageHeightLookupCache.set(tileKey, null);
      return null;
    }

    const value = (h00 + h10 + h01 + h11) * 0.25;
    tileAverageHeightLookupCache.set(tileKey, value);
    return value;
  };

  const getTileTypeId = (gx: number, gz: number) => {
    const c = canonicalize(gx, gz);
    const chunk = getChunkForSample(queryClient, map, c.x, c.z);

    if (!chunk?.tileTypeIndexes) {
      return DEFAULT_ZARCH_TILE_TYPE_ID;
    }

    const index = getTileLayerIndexFromChunk(chunk, c.x, c.z);
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
    const c = canonicalize(gx, gz);
    const chunk = getChunkForSample(queryClient, map, c.x, c.z);

    if (!chunk?.tileColorIndexes) {
      return null;
    }

    const index = getTileLayerIndexFromChunk(chunk, c.x, c.z);
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
    const colorIndex = getTileColorIndex(gx, gz);
    return colorIndex === null ? null : (editConfig.palette[colorIndex]?.hex ?? null);
  };

  const resolveTileMaterial = (gx: number, gz: number, elevation: number) => {
    const c = canonicalize(gx, gz);
    const chunk = getChunkForSample(queryClient, map, c.x, c.z);
    const material = chunk ? getMaterialFromChunk(chunk, c.x, c.z) : null;
    return resolveSurfaceMaterial(c.x, c.z, elevation, material);
  };

  const containsTile =
    wrappedFinite
      ? () => true
      : mapWidthTiles !== null && mapHeightTiles !== null
        ? (gx: number, gz: number) =>
            gx >= 0 && gz >= 0 && gx < mapWidthTiles && gz < mapHeightTiles
        : () => true;

  const isTileLoaded = (gx: number, gz: number) =>
    containsTile(gx, gz) && getTileAverageHeight(gx, gz) !== null;

  const sampleHeightAtWorld = (worldX: number, worldZ: number) =>
    sampleHeightAtWorldFromGrid(sampleHeight, worldX, worldZ);

  const isWorldPointLoaded = (worldX: number, worldZ: number) =>
    sampleHeightAtWorld(worldX, worldZ) !== null;

  const isWaterAtWorld = (worldX: number, worldZ: number) => {
    const gx = Math.floor(worldX / TILE);
    const gz = Math.floor(worldZ / TILE);

    return isTileLoaded(gx, gz) && isWaterTile(gx, gz);
  };

  const isWaterTile = (gx: number, gz: number) => {
    const average = getTileAverageHeight(gx, gz);
    return average !== null && average <= WATER_LEVEL;
  };

  const shouldHaveTreeAt = (gx: number, gz: number) => {
    if (!containsTile(gx, gz)) {
      return false;
    }

    const c = canonicalize(gx, gz);
    if (getTileTypeId(c.x, c.z) !== DEFAULT_ZARCH_TILE_TYPE_ID) {
      return false;
    }
    return shouldHaveTree(c.x, c.z);
  };

  return {
    chunkSizeTiles: chunkSize,
    containsTile,
    getTileAverageHeight,
    getTileColorHex,
    getTileColorIndex,
    getTileHeightSteps,
    getTileTypeId,
    heightTiles: mapHeightTiles,
    id: map.id,
    isTileLoaded,
    isWaterAtWorld,
    isWaterTile,
    isWorldPointLoaded,
    requestVisibleChunks: (centerTileX, centerTileZ, viewRadiusTiles) => {
      chunkLookupCache.clear();
      baseHeightLookupCache.clear();
      connectedHeightLookupCache.clear();
      tileAverageHeightLookupCache.clear();
      tileHeightStepLookupCache.clear();

      const window = getVisibleChunkWindow(
        map,
        centerTileX,
        centerTileZ,
        viewRadiusTiles
      );

      const requestedChunks = new Set<string>();

      for (let chunkZ = window.minChunkZ; chunkZ <= window.maxChunkZ; chunkZ += 1) {
        for (let chunkX = window.minChunkX; chunkX <= window.maxChunkX; chunkX += 1) {
          if (
            wrappedFinite &&
            chunkCountX !== null &&
            chunkCountZ !== null
          ) {
            const canonicalChunkX = wrapCoordinate(chunkX, chunkCountX);
            const canonicalChunkZ = wrapCoordinate(chunkZ, chunkCountZ);
            const chunkKey = `${canonicalChunkX}:${canonicalChunkZ}`;

            if (requestedChunks.has(chunkKey)) {
              continue;
            }

            requestedChunks.add(chunkKey);
            prefetchChunk(canonicalChunkX, canonicalChunkZ);
            continue;
          }

          prefetchChunk(chunkX, chunkZ);
        }
      }
    },
    resolveTileMaterial,
    sampleHeight,
    sampleHeightAtWorld,
    sampleNormalAtWorld: (worldX, worldZ) =>
      sampleNormalAtWorldFromGrid(sampleHeightAtWorld, worldX, worldZ),
    shouldHaveTree: shouldHaveTreeAt,
    tileColor: (gx, gz, elevation, target) => {
      const c = canonicalize(gx, gz);
      const colorHex = getTileColorHex(c.x, c.z);

      if (colorHex) {
        return (target ?? applyTileColor(undefined, c.x, c.z, elevation)).set(colorHex);
      }

      return applyTileColor(
        target,
        c.x,
        c.z,
        elevation,
        resolveTileMaterial(gx, gz, elevation)
      );
    },
    treeType: (gx, gz) => {
      const c = canonicalize(gx, gz);
      return getTreeType(c.x, c.z);
    },
    widthTiles: mapWidthTiles,
    wrapX: wrappedFinite,
    wrapZ: wrappedFinite
  };
};
