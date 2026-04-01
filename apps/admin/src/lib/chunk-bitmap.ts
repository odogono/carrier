import {
  ZARCH_TILE_OVERRIDE_COLOR_SENTINEL,
  resolveSurfaceMaterial,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';

import { tileColorRgb } from '@/lib/terrain-colors';

type ChunkBitmapEntry = {
  bitmap: HTMLCanvasElement;
};

const cache = new Map<string, ChunkBitmapEntry>();

const hashChunk = (chunk: RuntimeMapChunk) => {
  let hash = 2_166_136_261;

  for (const height of chunk.heights) {
    hash ^= Math.round(height * 100);
    hash = Math.imul(hash, 16_777_619);
  }

  if (chunk.materials) {
    for (const material of chunk.materials) {
      hash ^= Number(material) + 1;
      hash = Math.imul(hash, 16_777_619);
    }
  }

  if (chunk.tileHeightSteps) {
    for (const heightStep of chunk.tileHeightSteps) {
      hash ^= heightStep + 129;
      hash = Math.imul(hash, 16_777_619);
    }
  }

  if (chunk.tileColorIndexes) {
    for (const colorIndex of chunk.tileColorIndexes) {
      hash ^= colorIndex + 1;
      hash = Math.imul(hash, 16_777_619);
    }
  }

  return (hash >>> 0).toString(16);
};

const hashPalette = (editConfig: ZarchTileEditConfig | null) =>
  editConfig?.palette.map(entry => entry.hex).join(',') ?? 'no-palette';

const cacheKey = (
  chunk: RuntimeMapChunk,
  chunks: Map<string, RuntimeMapChunk>,
  editConfig: ZarchTileEditConfig | null
) => {
  const neighborhoodHashes: string[] = [];

  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const neighbor = chunks.get(`${chunk.chunkX + dx}:${chunk.chunkZ + dz}`);
      neighborhoodHashes.push(neighbor ? hashChunk(neighbor) : 'missing');
    }
  }

  return `${chunk.mapId}:${chunk.chunkX}:${chunk.chunkZ}:${hashPalette(editConfig)}:${neighborhoodHashes.join(':')}`;
};

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

const sampleBaseHeight = (
  chunks: Map<string, RuntimeMapChunk>,
  sampleX: number,
  sampleZ: number
) => {
  const chunk = getChunkForSample(chunks, sampleX, sampleZ);

  if (!chunk) {
    return null;
  }

  const localX = sampleX - chunk.originTileX;
  const localZ = sampleZ - chunk.originTileZ;
  return chunk.heights[localZ * chunk.samplesWide + localX] ?? null;
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

const getTileLayerIndex = (chunk: RuntimeMapChunk, gx: number, gz: number) => {
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

const getTileHeightSteps = (
  chunks: Map<string, RuntimeMapChunk>,
  gx: number,
  gz: number
) => {
  const chunk = getTileChunk(chunks, gx, gz);

  if (!chunk?.tileHeightSteps) {
    return 0;
  }

  const index = getTileLayerIndex(chunk, gx, gz);
  return index === null ? 0 : (chunk.tileHeightSteps[index] ?? 0);
};

const getHeightStepOffsetAtGrid = (
  chunks: Map<string, RuntimeMapChunk>,
  gx: number,
  gz: number,
  heightStepMeters: number
) => {
  let totalOffset = 0;
  let count = 0;

  for (const [tileX, tileZ] of [
    [gx - 1, gz - 1],
    [gx, gz - 1],
    [gx - 1, gz],
    [gx, gz]
  ]) {
    const chunk = getTileChunk(chunks, tileX, tileZ);

    if (!chunk) {
      continue;
    }

    totalOffset += getTileHeightSteps(chunks, tileX, tileZ) * heightStepMeters;
    count += 1;
  }

  return count === 0 ? 0 : totalOffset / count;
};

const sampleConnectedHeight = (
  chunks: Map<string, RuntimeMapChunk>,
  editConfig: ZarchTileEditConfig | null,
  sampleX: number,
  sampleZ: number
) => {
  const baseHeight = sampleBaseHeight(chunks, sampleX, sampleZ);

  if (baseHeight === null || !editConfig) {
    return baseHeight;
  }

  return (
    baseHeight +
    getHeightStepOffsetAtGrid(
      chunks,
      sampleX,
      sampleZ,
      editConfig.heightStepMeters
    )
  );
};

const getTileAverageHeight = (
  chunks: Map<string, RuntimeMapChunk>,
  editConfig: ZarchTileEditConfig | null,
  gx: number,
  gz: number
) => {
  const h00 = sampleConnectedHeight(chunks, editConfig, gx, gz);
  const h10 = sampleConnectedHeight(chunks, editConfig, gx + 1, gz);
  const h01 = sampleConnectedHeight(chunks, editConfig, gx, gz + 1);
  const h11 = sampleConnectedHeight(chunks, editConfig, gx + 1, gz + 1);

  if (h00 === null || h10 === null || h01 === null || h11 === null) {
    return null;
  }

  return (h00 + h10 + h01 + h11) * 0.25;
};

const getTileColorHex = (
  chunks: Map<string, RuntimeMapChunk>,
  editConfig: ZarchTileEditConfig | null,
  gx: number,
  gz: number
) => {
  if (!editConfig) {
    return null;
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

  return editConfig.palette[colorIndex]?.hex ?? null;
};

const renderChunkToCanvas = (
  chunk: RuntimeMapChunk,
  chunks: Map<string, RuntimeMapChunk>,
  editConfig: ZarchTileEditConfig | null
): HTMLCanvasElement => {
  const w = chunk.tileWidth;
  const h = chunk.tileHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;

  for (let localZ = 0; localZ < h; localZ += 1) {
    for (let localX = 0; localX < w; localX += 1) {
      const gx = chunk.originTileX + localX;
      const gz = chunk.originTileZ + localZ;
      const elevation = getTileAverageHeight(chunks, editConfig, gx, gz);
      const idx = (localZ * w + localX) * 4;

      if (elevation === null) {
        pixels[idx] = 8;
        pixels[idx + 1] = 19;
        pixels[idx + 2] = 31;
        pixels[idx + 3] = 255;
        continue;
      }

      const colorHex = getTileColorHex(chunks, editConfig, gx, gz);
      const material = chunk.materials?.[localZ * w + localX] ?? null;
      const [r, g, b] = colorHex
        ? [
            Number.parseInt(colorHex.slice(1, 3), 16),
            Number.parseInt(colorHex.slice(3, 5), 16),
            Number.parseInt(colorHex.slice(5, 7), 16)
          ]
        : tileColorRgb(gx, gz, elevation, resolveSurfaceMaterial(gx, gz, elevation, material));

      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

export const getChunkBitmap = (
  chunk: RuntimeMapChunk,
  chunks: Map<string, RuntimeMapChunk>,
  editConfig: ZarchTileEditConfig | null
): HTMLCanvasElement => {
  const key = cacheKey(chunk, chunks, editConfig);
  const existing = cache.get(key);

  if (existing) {
    return existing.bitmap;
  }

  const bitmap = renderChunkToCanvas(chunk, chunks, editConfig);
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
