import { useCallback } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  isInfiniteMap,
  type MapMetadata,
  type WorldBounds,
} from 'carrier-contracts/types';

import { client } from '@/lib/api-client';
import { chunkIntersectsDirtyBounds } from '@/pages/maps/editor/helpers';

export const mapEditorKeys = {
  controlPoints: (mapId: string) =>
    ['maps', mapId, 'editor', 'control-points'] as const,
  derivedIslands: (mapId: string) =>
    ['maps', mapId, 'editor', 'derived-islands'] as const,
  map: (mapId: string) => ['maps', mapId] as const,
  overview: (mapId: string) => ['maps', mapId, 'editor', 'overview'] as const,
  polygons: (mapId: string) => ['maps', mapId, 'editor', 'polygons'] as const,
};

const parseChunkQueryKey = (queryKey: readonly unknown[]) => {
  if (
    queryKey[0] !== 'map-chunk' ||
    typeof queryKey[1] !== 'string' ||
    typeof queryKey[2] !== 'number' ||
    typeof queryKey[3] !== 'number'
  ) {
    return null;
  }

  return {
    chunkX: queryKey[2],
    chunkZ: queryKey[3],
    mapId: queryKey[1],
  };
};

export const useMapEditorData = (mapId: string) => {
  const queryClient = useQueryClient();

  const mapQuery = useQuery({
    queryFn: () => client.maps.find({ id: mapId }),
    queryKey: mapEditorKeys.map(mapId),
  });

  const map = mapQuery.data;
  const authoredEnabled = isInfiniteMap(map);

  const overviewQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.getOverview({ mapId }),
    queryKey: mapEditorKeys.overview(mapId),
  });

  const polygonsQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.listSourcePolygons({ mapId, status: 'active' }),
    queryKey: mapEditorKeys.polygons(mapId),
  });

  const controlPointsQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.listControlPoints({ mapId }),
    queryKey: mapEditorKeys.controlPoints(mapId),
  });

  const derivedIslandsQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.listDerivedIslands({ mapId }),
    queryKey: mapEditorKeys.derivedIslands(mapId),
  });

  const invalidateMapAndAuthoredQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mapEditorKeys.map(mapId) }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.overview(mapId),
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.polygons(mapId),
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.controlPoints(mapId),
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.derivedIslands(mapId),
      }),
    ]);
  }, [mapId, queryClient]);

  const invalidateIslandMetadataQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mapEditorKeys.map(mapId) }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.overview(mapId),
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.derivedIslands(mapId),
      }),
    ]);
  }, [mapId, queryClient]);

  const invalidateTerrainMutation = useCallback(
    async (
      dirtyBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>,
    ) => {
      await invalidateMapAndAuthoredQueries();

      if (!map) {
        return;
      }

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = parseChunkQueryKey(query.queryKey);

          if (!key || key.mapId !== mapId) {
            return false;
          }

          return chunkIntersectsDirtyBounds(
            map,
            key.chunkX,
            key.chunkZ,
            dirtyBounds,
          );
        },
      });
    },
    [invalidateMapAndAuthoredQueries, map, mapId, queryClient],
  );

  const reloadAll = useCallback(async (): Promise<MapMetadata | null> => {
    const nextMap = await queryClient.fetchQuery({
      queryFn: () => client.maps.find({ id: mapId }),
      queryKey: mapEditorKeys.map(mapId),
    });

    if (isInfiniteMap(nextMap)) {
      await Promise.all([
        queryClient.fetchQuery({
          queryFn: () => client.maps.getOverview({ mapId }),
          queryKey: mapEditorKeys.overview(mapId),
        }),
        queryClient.fetchQuery({
          queryFn: () =>
            client.maps.listSourcePolygons({ mapId, status: 'active' }),
          queryKey: mapEditorKeys.polygons(mapId),
        }),
        queryClient.fetchQuery({
          queryFn: () => client.maps.listControlPoints({ mapId }),
          queryKey: mapEditorKeys.controlPoints(mapId),
        }),
        queryClient.fetchQuery({
          queryFn: () => client.maps.listDerivedIslands({ mapId }),
          queryKey: mapEditorKeys.derivedIslands(mapId),
        }),
      ]);
    }

    return nextMap;
  }, [mapId, queryClient]);

  return {
    controlPointsQuery,
    derivedIslandsQuery,
    invalidateIslandMetadataQueries,
    invalidateMapAndAuthoredQueries,
    invalidateTerrainMutation,
    map,
    mapQuery,
    overviewQuery,
    polygonsQuery,
    reloadAll,
  };
};
