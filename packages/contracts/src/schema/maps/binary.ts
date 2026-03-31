import {
  getSurfaceMaterialById,
  type MapChunkMetadata,
  type MapSurfaceMaterial,
  type StaticEntity
} from './index';

export const decodeFloat32HeightsBlob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return new Float32Array(arrayBuffer);
};

type RuntimeChunkMetadata = Omit<
  MapChunkMetadata,
  | 'materials'
  | 'staticEntities'
  | 'tileColorIndexes'
  | 'tileHeightSteps'
  | 'tileTypeIndexes'
>;

type BinaryMapChunkInput = Omit<
  MapChunkMetadata,
  | 'materials'
  | 'staticEntities'
  | 'tileColorIndexes'
  | 'tileHeightSteps'
  | 'tileTypeIndexes'
> & {
  heights: unknown;
  materials?: unknown;
  staticEntities?: unknown;
  staticEntitiesJson?: unknown;
  tileColorIndexes?: unknown;
  tileHeightSteps?: unknown;
  tileTypeIndexes?: unknown;
};

export type RuntimeMapChunk = RuntimeChunkMetadata & {
  heights: Float32Array;
  materials?: MapSurfaceMaterial[];
  staticEntities: StaticEntity[];
  tileColorIndexes?: Uint8Array;
  tileHeightSteps?: Int8Array;
  tileTypeIndexes?: Uint8Array;
};

const asNumber = (value: number | string) =>
  typeof value === 'number' ? value : Number(value);

const normalizeMetadata = (
  chunk: Omit<
    MapChunkMetadata,
    'materials' | 'staticEntities' | 'tileColorIndexes' | 'tileHeightSteps' | 'tileTypeIndexes'
  > & { heights: Blob }
): Omit<
  MapChunkMetadata,
  'materials' | 'staticEntities' | 'tileColorIndexes' | 'tileHeightSteps' | 'tileTypeIndexes'
> => ({
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

const decodeStaticEntities = (
  staticEntities: unknown,
  staticEntitiesJson: unknown
) => {
  if (typeof staticEntitiesJson === 'string') {
    return JSON.parse(staticEntitiesJson) as StaticEntity[];
  }

  if (Array.isArray(staticEntities)) {
    return staticEntities.map(entity => ({
      ...entity,
      position: {
        x: Number(entity.position.x),
        z: Number(entity.position.z)
      },
      rotation: {
        yaw: Number(entity.rotation.yaw)
      },
      scale: Number(entity.scale),
      yOffset: Number(entity.yOffset)
    }));
  }

  return [];
};

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

export const decodeInt8Blob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return new Int8Array(arrayBuffer);
};

export const decodeUint8Blob = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
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
  const tileColorIndexesBlob =
    chunk.tileColorIndexes === undefined
      ? undefined
      : expectBlob(chunk.tileColorIndexes, 'tileColorIndexes');
  const tileHeightStepsBlob =
    chunk.tileHeightSteps === undefined
      ? undefined
      : expectBlob(chunk.tileHeightSteps, 'tileHeightSteps');
  const tileTypeIndexesBlob =
    chunk.tileTypeIndexes === undefined
      ? undefined
      : expectBlob(chunk.tileTypeIndexes, 'tileTypeIndexes');
  const metadata = normalizeMetadata({
    ...chunk,
    heights: heightsBlob
  });
  const staticEntities = decodeStaticEntities(
    chunk.staticEntities,
    chunk.staticEntitiesJson
  );

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
    staticEntities,
    materials: materialsBlob ? await decodeMaterialBlob(materialsBlob) : undefined,
    tileColorIndexes: tileColorIndexesBlob
      ? await decodeUint8Blob(tileColorIndexesBlob)
      : undefined,
    tileHeightSteps: tileHeightStepsBlob
      ? await decodeInt8Blob(tileHeightStepsBlob)
      : undefined,
    tileTypeIndexes: tileTypeIndexesBlob
      ? await decodeUint8Blob(tileTypeIndexesBlob)
      : undefined
  };
};
