import {
  isInfiniteMap,
  type ControlPoint,
  type MapMetadata,
  type SourcePolygon,
  type WorldBounds
} from 'carrier-contracts/types';
import { useCallback } from 'react';

import { client } from '@/lib/api-client';
import { chunkIntersectsDirtyBounds } from '@/pages/maps/editor/helpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const mapEditorKeys = {
  controlPoints: (mapId: string) =>
    ['maps', mapId, 'editor', 'control-points'] as const,
  derivedIslands: (mapId: string) =>
    ['maps', mapId, 'editor', 'derived-islands'] as const,
  map: (mapId: string) => ['maps', mapId] as const,
  overview: (mapId: string) => ['maps', mapId, 'editor', 'overview'] as const,
  polygons: (mapId: string) => ['maps', mapId, 'editor', 'polygons'] as const
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
    mapId: queryKey[1]
  };
};

export const useMapEditorData = (mapId: string) => {
  const queryClient = useQueryClient();

  const replaceSourcePolygons = useCallback(
    (
      replacements: Array<{
        next: SourcePolygon;
        previousId?: string;
      }>
    ) => {
      if (replacements.length === 0) {
        return;
      }

      queryClient.setQueryData<SourcePolygon[] | undefined>(
        mapEditorKeys.polygons(mapId),
        current => {
          if (!current) {
            return current;
          }

          const previousIds = new Set(
            replacements
              .map(replacement => replacement.previousId)
              .filter(Boolean) as string[]
          );
          const nextById = new Map(
            replacements.map(replacement => [
              replacement.next.id,
              replacement.next
            ])
          );

          return current
            .filter(
              polygon =>
                !previousIds.has(polygon.id) && !nextById.has(polygon.id)
            )
            .concat(replacements.map(replacement => replacement.next));
        }
      );
    },
    [mapId, queryClient]
  );

  const patchControlPoints = useCallback(
    (updates: ControlPoint[]) => {
      if (updates.length === 0) {
        return;
      }

      queryClient.setQueryData<ControlPoint[] | undefined>(
        mapEditorKeys.controlPoints(mapId),
        current => {
          if (!current) {
            return current;
          }

          const updatesById = new Map(updates.map(point => [point.id, point]));
          return current.map(point => updatesById.get(point.id) ?? point);
        }
      );
    },
    [mapId, queryClient]
  );

  const mapQuery = useQuery({
    queryFn: () => client.maps.find({ id: mapId }),
    queryKey: mapEditorKeys.map(mapId)
  });

  const map = mapQuery.data;
  const authoredEnabled = isInfiniteMap(map);

  const overviewQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.getOverview({ mapId }),
    queryKey: mapEditorKeys.overview(mapId)
  });

  const polygonsQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.listSourcePolygons({ mapId, status: 'active' }),
    queryKey: mapEditorKeys.polygons(mapId)
  });

  const controlPointsQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.listControlPoints({ mapId }),
    queryKey: mapEditorKeys.controlPoints(mapId)
  });

  const derivedIslandsQuery = useQuery({
    enabled: authoredEnabled,
    queryFn: () => client.maps.listDerivedIslands({ mapId }),
    queryKey: mapEditorKeys.derivedIslands(mapId)
  });

  const invalidateMapAndAuthoredQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mapEditorKeys.map(mapId) }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.overview(mapId)
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.polygons(mapId)
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.controlPoints(mapId)
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.derivedIslands(mapId)
      })
    ]);
  }, [mapId, queryClient]);

  const invalidateIslandMetadataQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mapEditorKeys.map(mapId) }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.overview(mapId)
      }),
      queryClient.invalidateQueries({
        queryKey: mapEditorKeys.derivedIslands(mapId)
      })
    ]);
  }, [mapId, queryClient]);

  const invalidateTerrainMutation = useCallback(
    async (
      dirtyBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
    ) => {
      await invalidateMapAndAuthoredQueries();

      if (!map) {
        return;
      }

      await queryClient.invalidateQueries({
        predicate: query => {
          const key = parseChunkQueryKey(query.queryKey);

          if (!key || key.mapId !== mapId) {
            return false;
          }

          return chunkIntersectsDirtyBounds(
            map,
            key.chunkX,
            key.chunkZ,
            dirtyBounds
          );
        }
      });
    },
    [invalidateMapAndAuthoredQueries, map, mapId, queryClient]
  );

  const reloadAll = useCallback(async (): Promise<MapMetadata | null> => {
    const nextMap = await queryClient.fetchQuery({
      queryFn: () => client.maps.find({ id: mapId }),
      queryKey: mapEditorKeys.map(mapId)
    });

    if (isInfiniteMap(nextMap)) {
      await Promise.all([
        queryClient.fetchQuery({
          queryFn: () => client.maps.getOverview({ mapId }),
          queryKey: mapEditorKeys.overview(mapId)
        }),
        queryClient.fetchQuery({
          queryFn: () =>
            client.maps.listSourcePolygons({ mapId, status: 'active' }),
          queryKey: mapEditorKeys.polygons(mapId)
        }),
        queryClient.fetchQuery({
          queryFn: () => client.maps.listControlPoints({ mapId }),
          queryKey: mapEditorKeys.controlPoints(mapId)
        }),
        queryClient.fetchQuery({
          queryFn: () => client.maps.listDerivedIslands({ mapId }),
          queryKey: mapEditorKeys.derivedIslands(mapId)
        })
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
    patchControlPoints,
    polygonsQuery,
    reloadAll,
    replaceSourcePolygons
  };
};
