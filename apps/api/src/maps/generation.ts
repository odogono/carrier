import {
  MAP_CHUNK_SIZE_TILES,
  MAP_GENERATOR,
  MAP_GENERATOR_ISLANDS,
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
export const MAP_WATER_LEVEL = -10;

const ISLAND_TARGET_WATER_RATIO = 0.62;
const ISLAND_HEIGHT_SCALE = 36;

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const coordNoise = (seed: string, x: number, z: number) => {
  const random = createSeededRandom(`${seed}:${x}:${z}`);
  return random() * 2 - 1;
};

const valueNoise = (seed: string, x: number, z: number, scale: number) => {
  const scaledX = x / scale;
  const scaledZ = z / scale;
  const cellX = Math.floor(scaledX);
  const cellZ = Math.floor(scaledZ);
  const fracX = scaledX - cellX;
  const fracZ = scaledZ - cellZ;
  const fadeX = fracX * fracX * (3 - 2 * fracX);
  const fadeZ = fracZ * fracZ * (3 - 2 * fracZ);

  const top = lerp(
    coordNoise(seed, cellX, cellZ),
    coordNoise(seed, cellX + 1, cellZ),
    fadeX
  );
  const bottom = lerp(
    coordNoise(seed, cellX, cellZ + 1),
    coordNoise(seed, cellX + 1, cellZ + 1),
    fadeX
  );

  return lerp(top, bottom, fadeZ);
};

const fractalNoise = (
  seed: string,
  x: number,
  z: number,
  scales: readonly number[],
  persistence: number
) => {
  let amplitude = 1;
  let totalAmplitude = 0;
  let total = 0;

  for (const scale of scales) {
    total += valueNoise(seed, x, z, scale) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= persistence;
  }

  return totalAmplitude === 0 ? 0 : total / totalAmplitude;
};

const nthSortedValue = (values: Float32Array, ratio: number) => {
  const sorted = Array.from(values).sort((left, right) => left - right);
  const index = clamp(Math.floor((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index]!;
};

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

export const generateIslandHeightfield = (
  widthTiles: number,
  heightTiles: number,
  seed: string
): GeneratedHeightfield => {
  const sampleWidth = widthTiles + 1;
  const sampleHeight = heightTiles + 1;
  const heights = new Float32Array(sampleWidth * sampleHeight);
  const base = generateDiamondSquareHeightfield(widthTiles, heightTiles, `${seed}:base`);
  const random = createSeededRandom(`${seed}:islands`);
  const maxDimension = Math.max(widthTiles, heightTiles, 1);
  const centerX = widthTiles * 0.5;
  const centerZ = heightTiles * 0.5;

  const landmassAttractors = Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({
    amplitude: lerp(0.9, 1.35, random()),
    radius: lerp(maxDimension * 0.16, maxDimension * 0.28, random()),
    x: lerp(widthTiles * 0.22, widthTiles * 0.78, random()),
    z: lerp(heightTiles * 0.22, heightTiles * 0.78, random())
  }));
  const mediumAttractors = Array.from({ length: 5 + Math.floor(random() * 5) }, () => ({
    amplitude: lerp(0.22, 0.55, random()),
    radius: lerp(maxDimension * 0.05, maxDimension * 0.12, random()),
    x: lerp(widthTiles * 0.12, widthTiles * 0.88, random()),
    z: lerp(heightTiles * 0.12, heightTiles * 0.88, random())
  }));
  const microFeatures = Array.from({ length: 18 + Math.floor(random() * 12) }, () => ({
    amplitude: lerp(0.08, 0.24, random()) * (random() > 0.42 ? 1 : -1),
    radius: lerp(maxDimension * 0.018, maxDimension * 0.045, random()),
    x: random() * widthTiles,
    z: random() * heightTiles
  }));
  const ridgeAngle = random() * Math.PI;
  const ridgeFrequency = lerp(1.7, 2.5, random());
  const channelAngle = ridgeAngle + Math.PI * 0.5 + lerp(-0.2, 0.2, random());

  for (let z = 0; z < sampleHeight; z += 1) {
    const normalizedZ = heightTiles === 0 ? 0 : z / heightTiles;

    for (let x = 0; x < sampleWidth; x += 1) {
      const normalizedX = widthTiles === 0 ? 0 : x / widthTiles;
      const dx = normalizedX - 0.5;
      const dz = normalizedZ - 0.5;
      const radialDistance = Math.sqrt(dx * dx + dz * dz) / 0.70710678118;
      const coastalMask = 1 - smoothstep(0.34, 0.96, radialDistance);
      const edgeSuppression = smoothstep(0.55, 1, radialDistance);

      let attractorHeight = 0;

      for (const attractor of landmassAttractors) {
        const featureDx = x - attractor.x;
        const featureDz = z - attractor.z;
        const distance = Math.sqrt(featureDx * featureDx + featureDz * featureDz);
        const influence = Math.max(0, 1 - distance / attractor.radius);
        attractorHeight += attractor.amplitude * influence * influence;
      }

      for (const attractor of mediumAttractors) {
        const featureDx = x - attractor.x;
        const featureDz = z - attractor.z;
        const distance = Math.sqrt(featureDx * featureDx + featureDz * featureDz);
        const influence = Math.max(0, 1 - distance / attractor.radius);
        attractorHeight += attractor.amplitude * influence * influence;
      }

      let microHeight = 0;

      for (const feature of microFeatures) {
        const featureDx = x - feature.x;
        const featureDz = z - feature.z;
        const distance = Math.sqrt(featureDx * featureDx + featureDz * featureDz);
        const influence = Math.max(0, 1 - distance / feature.radius);
        microHeight += feature.amplitude * influence * influence;
      }

      const baseHeight =
        readHeight(base.heights, sampleIndex(x, z, sampleWidth)) / INITIAL_HEIGHT_VARIATION;
      const continentalNoise = fractalNoise(
        `${seed}:continental`,
        x,
        z,
        [maxDimension * 0.22, maxDimension * 0.11, maxDimension * 0.055],
        0.5
      );
      const archipelagoNoise = fractalNoise(
        `${seed}:archipelago`,
        x,
        z,
        [maxDimension * 0.1, maxDimension * 0.05, maxDimension * 0.025],
        0.52
      );
      const breakupNoise = fractalNoise(
        `${seed}:breakup`,
        x,
        z,
        [maxDimension * 0.045, maxDimension * 0.022],
        0.55
      );

      const ridgeAxis =
        ((x - centerX) * Math.cos(ridgeAngle) + (z - centerZ) * Math.sin(ridgeAngle)) /
        maxDimension;
      const ridgeNoise = Math.sin((ridgeAxis + continentalNoise * 0.18) * Math.PI * ridgeFrequency);
      const ridgeContribution = (1 - Math.abs(ridgeNoise)) * 0.32;

      const channelAxis =
        ((x - centerX) * Math.cos(channelAngle) + (z - centerZ) * Math.sin(channelAngle)) /
        maxDimension;
      const channelNoise =
        Math.sin((channelAxis + archipelagoNoise * 0.3) * Math.PI * (ridgeFrequency + 0.65));
      const channelContribution = -Math.max(0, 1 - Math.abs(channelNoise) * 1.35) * 0.34;

      const rawHeight =
        baseHeight * 0.32 +
        coastalMask * 0.86 +
        attractorHeight * 0.72 +
        continentalNoise * 0.26 +
        archipelagoNoise * 0.21 +
        breakupNoise * 0.08 +
        ridgeContribution +
        channelContribution +
        microHeight -
        edgeSuppression * 1.08;

      heights[sampleIndex(x, z, sampleWidth)] = rawHeight;
    }
  }

  const seaLevelBaseline = nthSortedValue(heights, ISLAND_TARGET_WATER_RATIO);

  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = (heights[index]! - seaLevelBaseline) * ISLAND_HEIGHT_SCALE + MAP_WATER_LEVEL;
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
  const heightfield =
    map.generator === MAP_GENERATOR
      ? generateDiamondSquareHeightfield(map.widthTiles, map.heightTiles, map.seed)
      : map.generator === MAP_GENERATOR_ISLANDS
        ? generateIslandHeightfield(map.widthTiles, map.heightTiles, map.seed)
        : (() => {
            throw new Error(`Unsupported map generator: ${map.generator}`);
          })();
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
