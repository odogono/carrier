import type { MapChunkMetadata } from './index';

export const decodeFloat32HeightsBlob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return new Float32Array(arrayBuffer);
};

export type RuntimeMapChunk = MapChunkMetadata & {
  heights: Float32Array;
};

const asNumber = (value: number | string) =>
  typeof value === 'number' ? value : Number(value);

const normalizeMetadata = (
  chunk: MapChunkMetadata & { heights: Blob }
): MapChunkMetadata => ({
  ...chunk,
  chunkX: asNumber(chunk.chunkX),
  chunkZ: asNumber(chunk.chunkZ),
  originTileX: asNumber(chunk.originTileX),
  originTileZ: asNumber(chunk.originTileZ),
  samplesHigh: asNumber(chunk.samplesHigh),
  samplesWide: asNumber(chunk.samplesWide),
  tileHeight: asNumber(chunk.tileHeight),
  tileWidth: asNumber(chunk.tileWidth)
});

export const decodeMapChunkBinary = async (
  chunk: MapChunkMetadata & { heights: Blob }
): Promise<RuntimeMapChunk> => ({
  ...normalizeMetadata(chunk),
  heights: await decodeFloat32HeightsBlob(chunk.heights)
});
