/* eslint-disable import-x/no-unresolved */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
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
  map: Pick<MapMetadata, 'chunkSizeTiles' | 'heightTiles' | 'widthTiles'>,
  centerTileX: number,
  centerTileZ: number,
  viewRadiusTiles: number,
  extraChunkRing = 1
) => {
  const maxChunkX = Math.max(Math.ceil(map.widthTiles / map.chunkSizeTiles) - 1, 0);
  const maxChunkZ = Math.max(Math.ceil(map.heightTiles / map.chunkSizeTiles) - 1, 0);
  const minTileX = Math.max(centerTileX - viewRadiusTiles, 0);
  const maxTileX = Math.min(centerTileX + viewRadiusTiles, map.widthTiles - 1);
  const minTileZ = Math.max(centerTileZ - viewRadiusTiles, 0);
  const maxTileZ = Math.min(centerTileZ + viewRadiusTiles, map.heightTiles - 1);

  return {
    maxChunkX: Math.min(Math.floor(maxTileX / map.chunkSizeTiles) + extraChunkRing, maxChunkX),
    maxChunkZ: Math.min(Math.floor(maxTileZ / map.chunkSizeTiles) + extraChunkRing, maxChunkZ),
    minChunkX: Math.max(Math.floor(minTileX / map.chunkSizeTiles) - extraChunkRing, 0),
    minChunkZ: Math.max(Math.floor(minTileZ / map.chunkSizeTiles) - extraChunkRing, 0)
  };
};

const getMaxChunkCoordinate = (
  sizeInTiles: number,
  chunkSizeTiles: number
) => Math.max(Math.ceil(sizeInTiles / chunkSizeTiles) - 1, 0);

const getChunkCoordinateForSample = (
  coordinate: number,
  chunkSizeTiles: number,
  maxChunkCoordinate: number
) => Math.min(Math.floor(coordinate / chunkSizeTiles), maxChunkCoordinate);

const getChunkForSample = (
  queryClient: QueryClient,
  map: MapMetadata,
  sampleX: number,
  sampleZ: number
) => {
  if (sampleX < 0 || sampleZ < 0 || sampleX > map.widthTiles || sampleZ > map.heightTiles) {
    return null;
  }

  const chunkX = getChunkCoordinateForSample(
    sampleX,
    map.chunkSizeTiles,
    getMaxChunkCoordinate(map.widthTiles, map.chunkSizeTiles)
  );
  const chunkZ = getChunkCoordinateForSample(
    sampleZ,
    map.chunkSizeTiles,
    getMaxChunkCoordinate(map.heightTiles, map.chunkSizeTiles)
  );

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

  const sampleHeight = (sampleX: number, sampleZ: number) => {
    const heightKey = `${sampleX}:${sampleZ}`;
    const cachedHeight = heightLookupCache.get(heightKey);

    if (cachedHeight !== undefined) {
      return cachedHeight;
    }

    const chunkKey = `${Math.floor(sampleX / map.chunkSizeTiles)}:${Math.floor(sampleZ / map.chunkSizeTiles)}`;
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

  return {
    chunkSizeTiles: map.chunkSizeTiles,
    containsTile: (gx, gz) =>
      gx >= 0 && gz >= 0 && gx < map.widthTiles && gz < map.heightTiles,
    getTileAverageHeight,
    heightTiles: map.heightTiles,
    id: map.id,
    isTileLoaded: (gx, gz) =>
      gx >= 0 &&
      gz >= 0 &&
      gx < map.widthTiles &&
      gz < map.heightTiles &&
      getTileAverageHeight(gx, gz) !== null,
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

      // Always iterate the window and call prefetchChunk — React Query
      // deduplicates in-flight requests and skips cached chunks internally,
      // so there is no need to track the last requested window signature here.
      for (let chunkZ = window.minChunkZ; chunkZ <= window.maxChunkZ; chunkZ += 1) {
        for (let chunkX = window.minChunkX; chunkX <= window.maxChunkX; chunkX += 1) {
          prefetchChunk(chunkX, chunkZ);
        }
      }
    },
    resolveTileMaterial,
    sampleHeight,
    shouldHaveTree: (gx, gz) =>
      gx >= 0 &&
      gz >= 0 &&
      gx < map.widthTiles &&
      gz < map.heightTiles &&
      shouldHaveTree(gx, gz),
    tileColor: (gx, gz, elevation, target) =>
      applyTileColor(target, gx, gz, elevation, resolveTileMaterial(gx, gz, elevation)),
    treeType: (gx, gz) => getTreeType(gx, gz),
    widthTiles: map.widthTiles
  };
};
