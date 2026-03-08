import {
  getSurfaceMaterialById,
  type MapChunkMetadata,
  type MapSurfaceMaterial
} from './index';

export const decodeFloat32HeightsBlob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return new Float32Array(arrayBuffer);
};

type RuntimeChunkMetadata = Omit<MapChunkMetadata, 'materials'>;

export type RuntimeMapChunk = RuntimeChunkMetadata & {
  heights: Float32Array;
  materials?: MapSurfaceMaterial[];
};

const asNumber = (value: number | string) =>
  typeof value === 'number' ? value : Number(value);

const normalizeMetadata = (
  chunk: MapChunkMetadata & { heights: Blob }
): MapChunkMetadata => ({
  ...chunk,
  chunkX: asNumber(chunk.chunkX),
  chunkZ: asNumber(chunk.chunkZ),
  layers: {
    ...chunk.layers,
    height:
      chunk.layers.height.encoding === 'uint16'
        ? {
            ...chunk.layers.height,
            minHeight: asNumber(chunk.layers.height.minHeight),
            step: asNumber(chunk.layers.height.step)
          }
        : chunk.layers.height
  },
  originTileX: asNumber(chunk.originTileX),
  originTileZ: asNumber(chunk.originTileZ),
  samplesHigh: asNumber(chunk.samplesHigh),
  samplesWide: asNumber(chunk.samplesWide),
  tileHeight: asNumber(chunk.tileHeight),
  tileWidth: asNumber(chunk.tileWidth)
});

export const decodeUint16HeightsBlob = async (
  blob: Blob,
  minHeight: number,
  step: number
) => {
  const arrayBuffer = await blob.arrayBuffer();
  const values = new Uint16Array(arrayBuffer);
  const heights = new Float32Array(values.length);

  for (let index = 0; index < values.length; index += 1) {
    heights[index] = minHeight + values[index]! * step;
  }

  return heights;
};

export const decodeMaterialBlob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  const ids = new Uint8Array(arrayBuffer);
  return Array.from(ids, materialId => getSurfaceMaterialById(materialId));
};

export const decodeMapChunkBinary = async (
  chunk: MapChunkMetadata & { heights: Blob; materials?: Blob }
): Promise<RuntimeMapChunk> => {
  const metadata = normalizeMetadata(chunk);

  return {
    ...metadata,
    heights:
      metadata.layers.height.encoding === 'uint16'
        ? await decodeUint16HeightsBlob(
            chunk.heights,
            metadata.layers.height.minHeight,
            metadata.layers.height.step
          )
        : await decodeFloat32HeightsBlob(chunk.heights),
    materials: chunk.materials ? await decodeMaterialBlob(chunk.materials) : undefined
  };
};
