/* eslint-disable import-x/no-unresolved */
import { useEffectEvent, useMemo } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MapMetadata } from 'carrier-contracts/types';

import { client } from '@/helpers/api-link';
import {
  createServerMapTerrain,
  getMapChunkQueryKey,
  getMapListQueryKey,
  getMapMetadataQueryKey
} from '@/helpers/zarch-map-terrain';

const MAP_METADATA_CACHE_MS = 60_000;
const MAP_METADATA_GC_MS = 5 * 60_000;
const MAP_CHUNK_CACHE_MS = 60_000;
const MAP_CHUNK_GC_MS = 10 * 60_000;

const getRequestedMapId = () =>
  new URLSearchParams(window.location.search).get('mapId');

export const useServerMapTerrain = () => {
  const queryClient = useQueryClient();
  const requestedMapId = useMemo(getRequestedMapId, []);

  const mapsQuery = useQuery({
    gcTime: MAP_METADATA_GC_MS,
    queryFn: () => client.maps.list({}),
    queryKey: getMapListQueryKey(),
    staleTime: MAP_METADATA_CACHE_MS
  });

  const fallbackMap = requestedMapId ? null : (mapsQuery.data?.[0] ?? null);
  const selectedMapId = requestedMapId ?? fallbackMap?.id ?? null;

  const selectedMapQuery = useQuery({
    enabled: !!requestedMapId && !!selectedMapId,
    gcTime: MAP_METADATA_GC_MS,
    queryFn: () => client.maps.find({ id: selectedMapId! }),
    queryKey: getMapMetadataQueryKey(selectedMapId ?? ''),
    staleTime: MAP_METADATA_CACHE_MS
  });

  const map = (requestedMapId ? selectedMapQuery.data : fallbackMap) ?? null;

  const prefetchChunk = useEffectEvent((activeMap: MapMetadata, chunkX: number, chunkZ: number) => {
    void queryClient.prefetchQuery({
      gcTime: MAP_CHUNK_GC_MS,
      queryFn: () => client.maps.getChunk({ chunkX, chunkZ, mapId: activeMap.id }),
      queryKey: getMapChunkQueryKey(activeMap.id, chunkX, chunkZ),
      staleTime: MAP_CHUNK_CACHE_MS
    });
  });

  const terrain = useMemo(() => {
    if (!map) {
      return null;
    }

    return createServerMapTerrain({
      map,
      prefetchChunk: (chunkX, chunkZ) => prefetchChunk(map, chunkX, chunkZ),
      queryClient
    });
  }, [map, prefetchChunk, queryClient]);

  return {
    error: mapsQuery.error ?? selectedMapQuery.error ?? null,
    isLoading:
      mapsQuery.isLoading ||
      (!!requestedMapId && !!selectedMapId && selectedMapQuery.isLoading),
    map,
    terrain
  };
};
