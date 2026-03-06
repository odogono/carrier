import {
  MAP_CHUNK_SIZE_TILES,
  MAP_GENERATOR,
  MAP_METERS_PER_TILE,
  MAP_RENDER_UNITS_PER_TILE,
  type MapChunk,
  type MapGenerator,
  type MapMetadata
} from '../../../../packages/contracts/src/schema/maps';

type ChunkSeed = Pick<
  MapMetadata,
  | 'chunkSizeTiles'
  | 'generator'
  | 'heightTiles'
  | 'id'
  | 'metersPerTile'
  | 'renderUnitsPerTile'
  | 'seed'
  | 'widthTiles'
>;

export const HEIGHT_LAYER = {
  encoding: 'float32',
  unit: 'metres'
} as const;

const INITIAL_HEIGHT_VARIATION = 60;
const INITIAL_SCALE = 40;
const ROUGHNESS = 0.62;
const HEIGHT_BIAS = -2;

type RandomSource = () => number;

type GeneratedHeightfield = {
  heights: Float32Array;
  sampleHeight: number;
  sampleWidth: number;
};

const xfnv1a = (input: string) => {
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return () => {
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0;
  };
};

const mulberry32 = (seed: number): RandomSource => {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const createSeededRandom = (seed: string) => mulberry32(xfnv1a(seed)());

const nextPowerOfTwo = (value: number) => {
  let result = 1;

  while (result < value) {
    result <<= 1;
  }

  return result;
};

const sampleIndex = (x: number, z: number, sampleWidth: number) =>
  z * sampleWidth + x;

const readHeight = (heights: Float32Array, index: number) => heights[index]!;

export const generateDiamondSquareHeightfield = (
  widthTiles: number,
  heightTiles: number,
  seed: string
): GeneratedHeightfield => {
  const squareTiles = nextPowerOfTwo(Math.max(widthTiles, heightTiles));
  const squareSamples = squareTiles + 1;
  const source = new Float32Array(squareSamples * squareSamples);
  const random = createSeededRandom(seed);

  source[sampleIndex(0, 0, squareSamples)] =
    (random() - 0.5) * INITIAL_HEIGHT_VARIATION;
  source[sampleIndex(squareTiles, 0, squareSamples)] =
    (random() - 0.5) * INITIAL_HEIGHT_VARIATION;
  source[sampleIndex(0, squareTiles, squareSamples)] =
    (random() - 0.5) * INITIAL_HEIGHT_VARIATION;
  source[sampleIndex(squareTiles, squareTiles, squareSamples)] =
    (random() - 0.5) * INITIAL_HEIGHT_VARIATION;

  let step = squareTiles;
  let scale = INITIAL_SCALE;

  while (step > 1) {
    const halfStep = step >> 1;

    for (let z = 0; z < squareTiles; z += step) {
      for (let x = 0; x < squareTiles; x += step) {
        const average =
          (readHeight(source, sampleIndex(x, z, squareSamples)) +
            readHeight(source, sampleIndex(x + step, z, squareSamples)) +
            readHeight(source, sampleIndex(x, z + step, squareSamples)) +
            readHeight(source, sampleIndex(x + step, z + step, squareSamples))) *
          0.25;

        source[sampleIndex(x + halfStep, z + halfStep, squareSamples)] =
          average + (random() - 0.5) * scale;
      }
    }

    for (let z = 0; z <= squareTiles; z += halfStep) {
      for (let x = (z + halfStep) % step; x <= squareTiles; x += step) {
        let sum = 0;
        let count = 0;

        if (z - halfStep >= 0) {
          sum += readHeight(source, sampleIndex(x, z - halfStep, squareSamples));
          count += 1;
        }
        if (z + halfStep <= squareTiles) {
          sum += readHeight(source, sampleIndex(x, z + halfStep, squareSamples));
          count += 1;
        }
        if (x - halfStep >= 0) {
          sum += readHeight(source, sampleIndex(x - halfStep, z, squareSamples));
          count += 1;
        }
        if (x + halfStep <= squareTiles) {
          sum += readHeight(source, sampleIndex(x + halfStep, z, squareSamples));
          count += 1;
        }

        source[sampleIndex(x, z, squareSamples)] =
          sum / count + (random() - 0.5) * scale;
      }
    }

    step = halfStep;
    scale *= ROUGHNESS;
  }

  const sampleWidth = widthTiles + 1;
  const sampleHeight = heightTiles + 1;
  const heights = new Float32Array(sampleWidth * sampleHeight);

  for (let z = 0; z < sampleHeight; z += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      heights[sampleIndex(x, z, sampleWidth)] =
        readHeight(source, sampleIndex(x, z, squareSamples)) + HEIGHT_BIAS;
    }
  }

  return {
    heights,
    sampleHeight,
    sampleWidth
  };
};

const getChunkHeightSamples = (
  heightfield: GeneratedHeightfield,
  originTileX: number,
  originTileZ: number,
  tileWidth: number,
  tileHeight: number
) => {
  const samplesWide = tileWidth + 1;
  const samplesHigh = tileHeight + 1;
  const heights = new Float32Array(samplesWide * samplesHigh);

  for (let sampleZ = 0; sampleZ < samplesHigh; sampleZ += 1) {
    const sourceZ = originTileZ + sampleZ;

    for (let sampleX = 0; sampleX < samplesWide; sampleX += 1) {
      const sourceX = originTileX + sampleX;
      heights[sampleIndex(sampleX, sampleZ, samplesWide)] =
        readHeight(
          heightfield.heights,
          sampleIndex(sourceX, sourceZ, heightfield.sampleWidth)
        );
    }
  }

  return {
    heights,
    samplesHigh,
    samplesWide
  };
};

export type GeneratedMapChunkRecord = Omit<MapChunk, 'heights' | 'layers'> & {
  heights: Float32Array;
};

export const buildGeneratedMapChunks = (
  map: ChunkSeed
): GeneratedMapChunkRecord[] => {
  if (map.generator !== MAP_GENERATOR) {
    throw new Error(`Unsupported map generator: ${map.generator}`);
  }

  const heightfield = generateDiamondSquareHeightfield(
    map.widthTiles,
    map.heightTiles,
    map.seed
  );
  const chunks: GeneratedMapChunkRecord[] = [];

  for (let originTileZ = 0; originTileZ < map.heightTiles; originTileZ += map.chunkSizeTiles) {
    for (
      let originTileX = 0;
      originTileX < map.widthTiles;
      originTileX += map.chunkSizeTiles
    ) {
      const tileWidth = Math.min(
        map.chunkSizeTiles,
        map.widthTiles - originTileX
      );
      const tileHeight = Math.min(
        map.chunkSizeTiles,
        map.heightTiles - originTileZ
      );
      const { heights, samplesHigh, samplesWide } = getChunkHeightSamples(
        heightfield,
        originTileX,
        originTileZ,
        tileWidth,
        tileHeight
      );

      chunks.push({
        chunkX: Math.floor(originTileX / map.chunkSizeTiles),
        chunkZ: Math.floor(originTileZ / map.chunkSizeTiles),
        mapId: map.id,
        originTileX,
        originTileZ,
        samplesHigh,
        samplesWide,
        tileHeight,
        tileWidth,
        heights
      });
    }
  }

  return chunks;
};

export const encodeFloat32Heights = (heights: Float32Array) =>
  new Uint8Array(
    heights.buffer.slice(
      heights.byteOffset,
      heights.byteOffset + heights.byteLength
    )
  );

export const decodeFloat32Heights = (
  blob: ArrayBufferLike | ArrayBufferView
): Float32Array => {
  if (ArrayBuffer.isView(blob)) {
    const copy = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
    return new Float32Array(copy);
  }

  return new Float32Array(blob.slice(0));
};

export const toMapChunkResponse = (
  record: GeneratedMapChunkRecord
): MapChunk => ({
  ...record,
  heights: Array.from(record.heights),
  layers: {
    height: HEIGHT_LAYER
  }
});

export const getDefaultMapConfig = () => ({
  chunkSizeTiles: MAP_CHUNK_SIZE_TILES,
  generator: MAP_GENERATOR satisfies MapGenerator,
  metersPerTile: MAP_METERS_PER_TILE,
  renderUnitsPerTile: MAP_RENDER_UNITS_PER_TILE
});
