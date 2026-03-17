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

type BinaryMapChunkInput = Omit<MapChunkMetadata, 'materials'> & {
  heights: unknown;
  materials?: unknown;
};

export type RuntimeMapChunk = RuntimeChunkMetadata & {
  heights: Float32Array;
  materials?: MapSurfaceMaterial[];
};

const asNumber = (value: number | string) =>
  typeof value === 'number' ? value : Number(value);

const normalizeMetadata = (
  chunk: Omit<MapChunkMetadata, 'materials'> & { heights: Blob }
): Omit<MapChunkMetadata, 'materials'> => ({
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

const expectBlob = (value: unknown, field: string) => {
  if (!(value instanceof Blob)) {
    throw new TypeError(`${field} must be a Blob`);
  }

  return value;
};

export const decodeMapChunkBinary = async (
  chunk: BinaryMapChunkInput
): Promise<RuntimeMapChunk> => {
  const heightsBlob = expectBlob(chunk.heights, 'heights');
  const materialsBlob =
    chunk.materials === undefined ? undefined : expectBlob(chunk.materials, 'materials');
  const metadata = normalizeMetadata({
    ...chunk,
    heights: heightsBlob
  });

  return {
    ...metadata,
    heights:
      metadata.layers.height.encoding === 'uint16'
        ? await decodeUint16HeightsBlob(
            heightsBlob,
            metadata.layers.height.minHeight,
            metadata.layers.height.step
          )
        : await decodeFloat32HeightsBlob(heightsBlob),
    materials: materialsBlob ? await decodeMaterialBlob(materialsBlob) : undefined
  };
};
