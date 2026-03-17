/* eslint-disable import-x/no-unresolved */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  isFiniteMap,
  getMapWidthTiles,
  getMapHeightTiles,
  resolveSurfaceMaterial,
  type MapMetadata,
  type RuntimeMapChunk
} from 'carrier-contracts/types';

import {
  WATER_LEVEL,
  applyTileColor,
  getTreeType,
  shouldHaveTree,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

type ChunkPrefetcher = (chunkX: number, chunkZ: number) => void;

export const getMapChunkQueryKey = (mapId: string, chunkX: number, chunkZ: number) =>
  ['map-chunk', mapId, chunkX, chunkZ] as const satisfies QueryKey;

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
    if (sampleX < 0 || sampleZ < 0 || sampleX > map.extent.widthTiles || sampleZ > map.extent.heightTiles) {
      return null;
    }

    const maxChunkX = Math.max(Math.ceil(map.extent.widthTiles / chunkSize) - 1, 0);
    const maxChunkZ = Math.max(Math.ceil(map.extent.heightTiles / chunkSize) - 1, 0);
    const chunkX = Math.min(Math.floor(sampleX / chunkSize), maxChunkX);
    const chunkZ = Math.min(Math.floor(sampleZ / chunkSize), maxChunkZ);

    return (
      queryClient.getQueryData<RuntimeMapChunk>(getMapChunkQueryKey(map.id, chunkX, chunkZ)) ??
      null
    );
  }

  // Infinite map: signed chunk coords, no bounds check
  const chunkX = Math.floor(sampleX / chunkSize);
  const chunkZ = Math.floor(sampleZ / chunkSize);

  return (
    queryClient.getQueryData<RuntimeMapChunk>(getMapChunkQueryKey(map.id, chunkX, chunkZ)) ??
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

export const createServerMapTerrain = ({
  map,
  prefetchChunk,
  queryClient
}: {
  map: MapMetadata;
  prefetchChunk: ChunkPrefetcher;
  queryClient: QueryClient;
}): ZarchTerrain => {
  const chunkLookupCache = new Map<string, RuntimeMapChunk | null>();
  const heightLookupCache = new Map<string, number | null>();
  const mapWidthTiles = getMapWidthTiles(map);
  const mapHeightTiles = getMapHeightTiles(map);
  const chunkSize = map.resolution.chunkSizeTiles;

  const sampleHeight = (sampleX: number, sampleZ: number) => {
    const heightKey = `${sampleX}:${sampleZ}`;
    const cachedHeight = heightLookupCache.get(heightKey);

    if (cachedHeight !== undefined) {
      return cachedHeight;
    }

    const chunkKey = `${Math.floor(sampleX / chunkSize)}:${Math.floor(sampleZ / chunkSize)}`;
    let chunk = chunkLookupCache.get(chunkKey);

    if (chunk === undefined) {
      chunk = getChunkForSample(queryClient, map, sampleX, sampleZ);
      chunkLookupCache.set(chunkKey, chunk);
    }

    if (!chunk) {
      heightLookupCache.set(heightKey, null);
      return null;
    }

    const value = sampleHeightFromChunk(chunk, sampleX, sampleZ);
    heightLookupCache.set(heightKey, value);
    return value;
  };

  const getTileAverageHeight = (gx: number, gz: number) => {
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
      return null;
    }

    return (h00 + h10 + h01 + h11) * 0.25;
  };

  const resolveTileMaterial = (gx: number, gz: number, elevation: number) => {
    const chunk = getChunkForSample(queryClient, map, gx, gz);
    const material = chunk ? getMaterialFromChunk(chunk, gx, gz) : null;
    return resolveSurfaceMaterial(gx, gz, elevation, material);
  };

  const containsTile = mapWidthTiles !== null && mapHeightTiles !== null
    ? (gx: number, gz: number) =>
        gx >= 0 && gz >= 0 && gx < mapWidthTiles && gz < mapHeightTiles
    : () => true;

  const isTileLoaded = (gx: number, gz: number) =>
    containsTile(gx, gz) && getTileAverageHeight(gx, gz) !== null;

  const shouldHaveTreeAt = (gx: number, gz: number) =>
    containsTile(gx, gz) && shouldHaveTree(gx, gz);

  return {
    chunkSizeTiles: chunkSize,
    containsTile,
    getTileAverageHeight,
    heightTiles: mapHeightTiles,
    id: map.id,
    isTileLoaded,
    isWaterTile: (gx, gz) => {
      const average = getTileAverageHeight(gx, gz);
      return average !== null && average < WATER_LEVEL;
    },
    requestVisibleChunks: (centerTileX, centerTileZ, viewRadiusTiles) => {
      chunkLookupCache.clear();
      heightLookupCache.clear();

      const window = getVisibleChunkWindow(
        map,
        centerTileX,
        centerTileZ,
        viewRadiusTiles
      );

      for (let chunkZ = window.minChunkZ; chunkZ <= window.maxChunkZ; chunkZ += 1) {
        for (let chunkX = window.minChunkX; chunkX <= window.maxChunkX; chunkX += 1) {
          prefetchChunk(chunkX, chunkZ);
        }
      }
    },
    resolveTileMaterial,
    sampleHeight,
    shouldHaveTree: shouldHaveTreeAt,
    tileColor: (gx, gz, elevation, target) =>
      applyTileColor(target, gx, gz, elevation, resolveTileMaterial(gx, gz, elevation)),
    treeType: (gx, gz) => getTreeType(gx, gz),
    widthTiles: mapWidthTiles
  };
};
