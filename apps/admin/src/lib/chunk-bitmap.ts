import {
  MAP_SURFACE_MATERIALS,
  type MapMetadata,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';
import { tileColorRgb } from '@/lib/terrain-colors';
import type { ZarchTileDraftEdits } from 'carrier-terrain-edit';

import type { ChunkMapTerrain } from '@/lib/map-chunk-terrain';
import {
  type HeightRange,
  getHeightLayerRgb,
  getHeightStepLayerRgb,
  getSurfaceMaterialLayerRgb,
  getTileTypeLayerRgb,
  type TerrainRenderLayer
} from '@/lib/terrain-render';

type ChunkBitmapEntry = {
  bitmap: HTMLCanvasElement;
};

type ChunkBitmapOptions = {
  draftEdits?: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig | null;
  heightRange: HeightRange | null;
  map: MapMetadata;
  renderLayer: TerrainRenderLayer;
  terrain: ChunkMapTerrain;
};

const cache = new Map<string, ChunkBitmapEntry>();
const MISSING_RGB: readonly [number, number, number] = [8, 19, 31];
const AUTO_RGB: readonly [number, number, number] = [23, 33, 46];

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

  if (chunk.tileTypeIndexes) {
    for (const typeIndex of chunk.tileTypeIndexes) {
      hash ^= typeIndex + 257;
      hash = Math.imul(hash, 16_777_619);
    }
  }

  return (hash >>> 0).toString(16);
};

const hashEditConfig = (editConfig: ZarchTileEditConfig | null) =>
  editConfig
    ? `${editConfig.palette.map(entry => entry.hex).join(',')}|${editConfig.tileTypes.map(entry => entry.id).join(',')}`
    : 'no-config';

const hashDraftEdits = (draftEdits: ZarchTileDraftEdits | undefined) => {
  if (!draftEdits) {
    return 'no-draft';
  }

  return Object.values(draftEdits)
    .sort((left, right) =>
      left.tileX === right.tileX ? left.tileZ - right.tileZ : left.tileX - right.tileX
    )
    .map(
      edit =>
        `${edit.tileX}:${edit.tileZ}:${edit.heightSteps}:${edit.typeId}:${edit.colorIndex ?? 'auto'}`
    )
    .join('|');
};

const cacheKey = (
  chunk: RuntimeMapChunk,
  chunks: Map<string, RuntimeMapChunk>,
  options: ChunkBitmapOptions
) => {
  const neighborhoodHashes: string[] = [];

  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const neighbor = chunks.get(`${chunk.chunkX + dx}:${chunk.chunkZ + dz}`);
      neighborhoodHashes.push(neighbor ? hashChunk(neighbor) : 'missing');
    }
  }

  return [
    chunk.mapId,
    chunk.chunkX,
    chunk.chunkZ,
    options.renderLayer,
    hashEditConfig(options.editConfig),
    options.heightRange ? `${options.heightRange.min}:${options.heightRange.max}` : 'no-height-range',
    hashDraftEdits(options.draftEdits),
    neighborhoodHashes.join(':')
  ].join('|');
};

const hexToRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16)
];

const renderChunkToCanvas = (
  chunk: RuntimeMapChunk,
  options: ChunkBitmapOptions
): HTMLCanvasElement => {
  const { terrain } = options;
  const width = chunk.tileWidth;
  const height = chunk.tileHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (let localZ = 0; localZ < height; localZ += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const gx = chunk.originTileX + localX;
      const gz = chunk.originTileZ + localZ;
      const resolvedHeight = terrain.getTileAverageHeight(gx, gz);
      const idx = (localZ * width + localX) * 4;

      if (resolvedHeight === null) {
        pixels[idx] = MISSING_RGB[0];
        pixels[idx + 1] = MISSING_RGB[1];
        pixels[idx + 2] = MISSING_RGB[2];
        pixels[idx + 3] = 255;
        continue;
      }

      let rgb: [number, number, number];

      if (options.renderLayer === 'resolved-color') {
        const colorHex = terrain.getTileColorHex(gx, gz);
        rgb = colorHex
          ? hexToRgb(colorHex)
          : tileColorRgb(
              gx,
              gz,
              resolvedHeight,
              terrain.resolveTileMaterial(gx, gz, resolvedHeight)
            );
      } else if (options.renderLayer === 'color-overrides') {
        const colorHex = terrain.getTileColorHex(gx, gz);
        rgb = colorHex ? hexToRgb(colorHex) : [...AUTO_RGB];
      } else if (options.renderLayer === 'base-height') {
        rgb = getHeightLayerRgb(
          terrain.getTileBaseAverageHeight(gx, gz) ?? resolvedHeight,
          options.heightRange
        );
      } else if (options.renderLayer === 'resolved-height') {
        rgb = getHeightLayerRgb(resolvedHeight, options.heightRange);
      } else if (options.renderLayer === 'height-steps') {
        rgb = getHeightStepLayerRgb(
          terrain.getTileHeightSteps(gx, gz),
          options.editConfig?.maxAbsHeightSteps ?? 16
        );
      } else if (options.renderLayer === 'tile-type') {
        rgb = getTileTypeLayerRgb(terrain.getTileTypeId(gx, gz), options.editConfig);
      } else {
        const material = terrain.resolveTileMaterial(gx, gz, resolvedHeight);
        const materialIndex = Math.max(MAP_SURFACE_MATERIALS.indexOf(material), 0);
        rgb = getSurfaceMaterialLayerRgb(materialIndex);
      }

      pixels[idx] = rgb[0];
      pixels[idx + 1] = rgb[1];
      pixels[idx + 2] = rgb[2];
      pixels[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

export const getChunkBitmap = (
  chunk: RuntimeMapChunk,
  chunks: Map<string, RuntimeMapChunk>,
  options: ChunkBitmapOptions
): HTMLCanvasElement => {
  const key = cacheKey(chunk, chunks, options);
  const existing = cache.get(key);

  if (existing) {
    return existing.bitmap;
  }

  const bitmap = renderChunkToCanvas(chunk, options);
  cache.set(key, { bitmap });
  return bitmap;
};

export const clearBitmapCache = (mapId?: string) => {
  if (!mapId) {
    cache.clear();
    return;
  }

  const prefix = `${mapId}|`;

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};
