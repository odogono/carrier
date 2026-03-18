import { useMemo } from "react";

import { useQueries } from "@tanstack/react-query";
import { decodeMapChunkBinary, type RuntimeMapChunk } from "carrier-contracts/types";

import { client } from "@/lib/api-client";

import type { ViewportChunkRange } from "./use-map-viewport";

const CHUNK_STALE_MS = 60_000;
const CHUNK_GC_MS = 600_000;

export const useMapChunks = (
  mapId: string,
  range: ViewportChunkRange,
  enabled = true,
) => {
  const chunkCoords = useMemo(() => {
    const coords: Array<{ chunkX: number; chunkZ: number }> = [];

    for (let z = range.minChunkZ; z <= range.maxChunkZ; z += 1) {
      for (let x = range.minChunkX; x <= range.maxChunkX; x += 1) {
        coords.push({ chunkX: x, chunkZ: z });
      }
    }

    return coords;
  }, [range.minChunkX, range.maxChunkX, range.minChunkZ, range.maxChunkZ]);

  const queries = useQueries({
    queries: chunkCoords.map(({ chunkX, chunkZ }) => ({
      enabled,
      gcTime: CHUNK_GC_MS,
      queryFn: async () =>
        decodeMapChunkBinary(
          await client.maps.getChunkBinary({ chunkX, chunkZ, mapId })
        ),
      queryKey: ["map-chunk", mapId, chunkX, chunkZ] as const,
      staleTime: CHUNK_STALE_MS,
    })),
  });

  const chunks = useMemo(() => {
    const map = new Map<string, RuntimeMapChunk>();

    for (const query of queries) {
      if (query.data) {
        const chunk = query.data;
        map.set(`${chunk.chunkX}:${chunk.chunkZ}`, chunk);
      }
    }

    return map;
  }, [queries]);

  return chunks;
};
