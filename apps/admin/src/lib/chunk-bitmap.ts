import type { RuntimeMapChunk } from "carrier-contracts/types";

import { tileColorRgb } from "@/lib/terrain-colors";

type ChunkBitmapEntry = {
  bitmap: HTMLCanvasElement;
};

const cache = new Map<string, ChunkBitmapEntry>();

const hashChunk = (chunk: RuntimeMapChunk) => {
  let hash = 2166136261;

  for (const height of chunk.heights) {
    hash ^= Math.round(height * 100);
    hash = Math.imul(hash, 16777619);
  }

  if (chunk.materials) {
    for (const material of chunk.materials) {
      hash ^= Number(material) + 1;
      hash = Math.imul(hash, 16777619);
    }
  }

  return (hash >>> 0).toString(16);
};

const cacheKey = (chunk: RuntimeMapChunk) =>
  `${chunk.mapId}:${chunk.chunkX}:${chunk.chunkZ}:${hashChunk(chunk)}`;

const renderChunkToCanvas = (chunk: RuntimeMapChunk): HTMLCanvasElement => {
  const w = chunk.tileWidth;
  const h = chunk.tileHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;

  for (let localZ = 0; localZ < h; localZ += 1) {
    for (let localX = 0; localX < w; localX += 1) {
      const gx = chunk.originTileX + localX;
      const gz = chunk.originTileZ + localZ;

      const h00 = chunk.heights[localZ * chunk.samplesWide + localX];
      const h10 = chunk.heights[localZ * chunk.samplesWide + localX + 1];
      const h01 = chunk.heights[(localZ + 1) * chunk.samplesWide + localX];
      const h11 = chunk.heights[(localZ + 1) * chunk.samplesWide + localX + 1];
      const elevation = (h00 + h10 + h01 + h11) * 0.25;
      const material = chunk.materials?.[localZ * w + localX] ?? null;
      const [r, g, b] = tileColorRgb(gx, gz, elevation, material);
      const idx = (localZ * w + localX) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

export const getChunkBitmap = (chunk: RuntimeMapChunk): HTMLCanvasElement => {
  const key = cacheKey(chunk);
  const existing = cache.get(key);

  if (existing) {
    return existing.bitmap;
  }

  const bitmap = renderChunkToCanvas(chunk);
  cache.set(key, { bitmap });
  return bitmap;
};

export const clearBitmapCache = (mapId?: string) => {
  if (!mapId) {
    cache.clear();
    return;
  }

  const prefix = `${mapId}:`;

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};
