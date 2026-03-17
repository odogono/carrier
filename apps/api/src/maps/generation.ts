import {
  MAP_CHUNK_SIZE_TILES,
  MAP_GENERATOR,
  MAP_GENERATOR_ISLANDS,
  MAP_METERS_PER_TILE,
  classifySurfaceMaterialFromElevation,
  getSurfaceMaterialId,
  type MapChunk,
  type MapGenerator
} from '../../../../packages/contracts/src/schema/maps';

type ChunkSeed = {
  chunkSizeTiles: number;
  generator: MapGenerator;
  heightTiles: number;
  id: string;
  metersPerTile: number;
  seed: string;
  widthTiles: number;
};

export const HEIGHT_LAYER = {
  encoding: 'float32',
  unit: 'metres'
} as const;

export const quantizeUint16Heights = (heights: Float32Array) => {
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (const height of heights) {
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }

  const range = maxHeight - minHeight;
  const step = range === 0 ? 0 : range / 65_535;
  const quantized = new Uint16Array(heights.length);

  for (let index = 0; index < heights.length; index += 1) {
    quantized[index] = step === 0 ? 0 : Math.round((heights[index]! - minHeight) / step);
  }

  return {
    data: new Uint8Array(quantized.buffer.slice(0)),
    layer: {
      encoding: 'uint16' as const,
      minHeight,
      step,
      unit: 'metres' as const
    }
  };
};

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

type HeightSampler = (sampleX: number, sampleZ: number) => number;

type WrappedClassicMapSeed = {
  chunkSizeTiles: number;
  generator: MapGenerator;
  heightTiles: number;
  id: string;
  metersPerTile: number;
  seed: string;
  widthTiles: number;
};

type Harmonic = {
  amplitude: number;
  freqX: number;
  freqZ: number;
  phaseX: number;
  phaseZ: number;
};

type IslandAttractor = {
  amplitude: number;
  radius: number;
  x: number;
  z: number;
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

const sampleIndex = (x: number, z: number, sampleWidth: number) =>
  z * sampleWidth + x;

const readHeight = (heights: Float32Array, index: number) => heights[index]!;

const positiveModulo = (value: number, modulus: number) =>
  ((value % modulus) + modulus) % modulus;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const TAU = Math.PI * 2;

const wrapSampleCoordinate = (coordinate: number, size: number) =>
  size <= 0 ? 0 : positiveModulo(coordinate, size);

const wrappedDelta = (from: number, to: number, size: number) => {
  if (size <= 0) {
    return from - to;
  }

  const delta = from - to;
  const wrapped = positiveModulo(delta + size * 0.5, size) - size * 0.5;
  return wrapped === -size * 0.5 ? size * 0.5 : wrapped;
};

const normalizeCoordinate = (coordinate: number, size: number) =>
  size <= 0 ? 0 : wrapSampleCoordinate(coordinate, size) / size;

const createWrappedHarmonics = (
  seed: string,
  count: number,
  minFrequency: number,
  maxFrequency: number
) => {
  const random = createSeededRandom(seed);
  const harmonics: Harmonic[] = [];

  for (let index = 0; index < count; index += 1) {
    harmonics.push({
      amplitude: lerp(0.3, 1, Math.pow(0.58, index)) * lerp(0.75, 1.25, random()),
      freqX: Math.max(minFrequency, Math.floor(lerp(minFrequency, maxFrequency + 1, random()))),
      freqZ: Math.max(minFrequency, Math.floor(lerp(minFrequency, maxFrequency + 1, random()))),
      phaseX: random() * TAU,
      phaseZ: random() * TAU
    });
  }

  return harmonics;
};

const sampleHarmonics = (
  harmonics: readonly Harmonic[],
  normalizedX: number,
  normalizedZ: number
) => {
  let total = 0;
  let amplitudeSum = 0;

  for (const harmonic of harmonics) {
    total +=
      Math.sin(normalizedX * TAU * harmonic.freqX + harmonic.phaseX) *
      Math.cos(normalizedZ * TAU * harmonic.freqZ + harmonic.phaseZ) *
      harmonic.amplitude;
    amplitudeSum += harmonic.amplitude;
  }

  return amplitudeSum === 0 ? 0 : total / amplitudeSum;
};

const buildHeightfield = (
  widthTiles: number,
  heightTiles: number,
  sampleHeightAt: HeightSampler
): GeneratedHeightfield => {
  const sampleWidth = widthTiles + 1;
  const sampleHeight = heightTiles + 1;
  const heights = new Float32Array(sampleWidth * sampleHeight);

  for (let z = 0; z < sampleHeight; z += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      heights[sampleIndex(x, z, sampleWidth)] = sampleHeightAt(x, z);
    }
  }

  return {
    heights,
    sampleHeight,
    sampleWidth
  };
};

const createDiamondSquareCompatibilitySampler = (
  widthTiles: number,
  heightTiles: number,
  seed: string
): HeightSampler => {
  const baseHarmonics = createWrappedHarmonics(`${seed}:base`, 5, 1, 6);
  const detailHarmonics = createWrappedHarmonics(`${seed}:detail`, 6, 4, 16);
  const ridgeHarmonics = createWrappedHarmonics(`${seed}:ridge`, 3, 1, 4);

  return (sampleX, sampleZ) => {
    const normalizedX = normalizeCoordinate(sampleX, widthTiles);
    const normalizedZ = normalizeCoordinate(sampleZ, heightTiles);
    const base = sampleHarmonics(baseHarmonics, normalizedX, normalizedZ);
    const detail = sampleHarmonics(detailHarmonics, normalizedX, normalizedZ);
    const ridges = sampleHarmonics(ridgeHarmonics, normalizedX, normalizedZ);
    const ridgeMask = 1 - Math.abs(ridges);

    return (
      base * INITIAL_HEIGHT_VARIATION * 0.72 +
      detail * INITIAL_HEIGHT_VARIATION * 0.38 +
      ridgeMask * INITIAL_HEIGHT_VARIATION * 0.3 +
      HEIGHT_BIAS
    );
  };
};

const createIslandAttractors = (
  seed: string,
  widthTiles: number,
  heightTiles: number
) => {
  const random = createSeededRandom(seed);
  const maxDimension = Math.max(widthTiles, heightTiles, 1);
  const major = Array.from({ length: 2 + Math.floor(random() * 3) }, () => ({
    amplitude: lerp(0.75, 1.25, random()),
    radius: lerp(maxDimension * 0.12, maxDimension * 0.22, random()),
    x: random() * widthTiles,
    z: random() * heightTiles
  }));
  const medium = Array.from({ length: 5 + Math.floor(random() * 5) }, () => ({
    amplitude: lerp(0.22, 0.5, random()),
    radius: lerp(maxDimension * 0.05, maxDimension * 0.11, random()),
    x: random() * widthTiles,
    z: random() * heightTiles
  }));
  const micro = Array.from({ length: 12 + Math.floor(random() * 8) }, () => ({
    amplitude: lerp(0.05, 0.18, random()) * (random() > 0.35 ? 1 : -1),
    radius: lerp(maxDimension * 0.018, maxDimension * 0.04, random()),
    x: random() * widthTiles,
    z: random() * heightTiles
  }));

  return {
    major,
    medium,
    micro
  };
};

const sampleAttractors = (
  attractors: readonly IslandAttractor[],
  sampleX: number,
  sampleZ: number,
  widthTiles: number,
  heightTiles: number
) => {
  let total = 0;

  for (const attractor of attractors) {
    const dx = wrappedDelta(sampleX, attractor.x, widthTiles);
    const dz = wrappedDelta(sampleZ, attractor.z, heightTiles);
    const distance = Math.sqrt(dx * dx + dz * dz);
    const influence = Math.max(0, 1 - distance / attractor.radius);
    total += attractor.amplitude * influence * influence;
  }

  return total;
};

const createIslandSampler = (
  widthTiles: number,
  heightTiles: number,
  seed: string
): HeightSampler => {
  const harmonics = createWrappedHarmonics(`${seed}:archipelago`, 5, 1, 8);
  const breakup = createWrappedHarmonics(`${seed}:breakup`, 4, 6, 18);
  const ridge = createWrappedHarmonics(`${seed}:ridge`, 3, 2, 6);
  const attractors = createIslandAttractors(`${seed}:islands`, widthTiles, heightTiles);

  return (sampleX, sampleZ) => {
    const normalizedX = normalizeCoordinate(sampleX, widthTiles);
    const normalizedZ = normalizeCoordinate(sampleZ, heightTiles);
    const canonicalX = wrapSampleCoordinate(sampleX, widthTiles);
    const canonicalZ = wrapSampleCoordinate(sampleZ, heightTiles);
    const archipelagoNoise = sampleHarmonics(harmonics, normalizedX, normalizedZ);
    const breakupNoise = sampleHarmonics(breakup, normalizedX, normalizedZ);
    const ridgeNoise = 1 - Math.abs(sampleHarmonics(ridge, normalizedX, normalizedZ));
    const major = sampleAttractors(
      attractors.major,
      canonicalX,
      canonicalZ,
      widthTiles,
      heightTiles
    );
    const medium = sampleAttractors(
      attractors.medium,
      canonicalX,
      canonicalZ,
      widthTiles,
      heightTiles
    );
    const micro = sampleAttractors(
      attractors.micro,
      canonicalX,
      canonicalZ,
      widthTiles,
      heightTiles
    );

    const rawHeight =
      -0.8 +
      major * 0.95 +
      medium * 0.55 +
      micro +
      archipelagoNoise * 0.24 +
      breakupNoise * 0.12 +
      ridgeNoise * 0.28;

    return rawHeight * ISLAND_HEIGHT_SCALE + MAP_WATER_LEVEL;
  };
};

const createWrappedHeightSampler = (
  generator: MapGenerator,
  widthTiles: number,
  heightTiles: number,
  seed: string
) => {
  if (generator === MAP_GENERATOR) {
    return createDiamondSquareCompatibilitySampler(widthTiles, heightTiles, seed);
  }

  if (generator === MAP_GENERATOR_ISLANDS) {
    return createIslandSampler(widthTiles, heightTiles, seed);
  }

  throw new Error(`Unsupported map generator: ${generator}`);
};

export const generateDiamondSquareHeightfield = (
  widthTiles: number,
  heightTiles: number,
  seed: string
): GeneratedHeightfield =>
  buildHeightfield(
    widthTiles,
    heightTiles,
    createDiamondSquareCompatibilitySampler(widthTiles, heightTiles, seed)
  );

export const generateIslandHeightfield = (
  widthTiles: number,
  heightTiles: number,
  seed: string
): GeneratedHeightfield =>
  buildHeightfield(
    widthTiles,
    heightTiles,
    createIslandSampler(widthTiles, heightTiles, seed)
  );

const getChunkHeightSamples = (
  sampleHeightAt: HeightSampler,
  originTileX: number,
  originTileZ: number,
  tileWidth: number,
  tileHeight: number
) => {
  const samplesWide = tileWidth + 1;
  const samplesHigh = tileHeight + 1;
  const heights = new Float32Array(samplesWide * samplesHigh);

  for (let sampleZ = 0; sampleZ < samplesHigh; sampleZ += 1) {
    for (let sampleX = 0; sampleX < samplesWide; sampleX += 1) {
      heights[sampleIndex(sampleX, sampleZ, samplesWide)] = sampleHeightAt(
        originTileX + sampleX,
        originTileZ + sampleZ
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

const getChunkCount = (tileCount: number, chunkSizeTiles: number) =>
  Math.max(Math.ceil(tileCount / chunkSizeTiles), 1);

const toCanonicalChunkCoordinate = (chunk: number, chunkCount: number) =>
  positiveModulo(chunk, chunkCount);

const buildChunkFromSampler = (
  map: WrappedClassicMapSeed,
  sampleHeightAt: HeightSampler,
  chunkX: number,
  chunkZ: number
): GeneratedMapChunkRecord => {
  const chunkCountX = getChunkCount(map.widthTiles, map.chunkSizeTiles);
  const chunkCountZ = getChunkCount(map.heightTiles, map.chunkSizeTiles);
  const canonicalChunkX = toCanonicalChunkCoordinate(chunkX, chunkCountX);
  const canonicalChunkZ = toCanonicalChunkCoordinate(chunkZ, chunkCountZ);
  const originTileX = canonicalChunkX * map.chunkSizeTiles;
  const originTileZ = canonicalChunkZ * map.chunkSizeTiles;
  const tileWidth = Math.min(map.chunkSizeTiles, map.widthTiles - originTileX);
  const tileHeight = Math.min(map.chunkSizeTiles, map.heightTiles - originTileZ);
  const { heights, samplesHigh, samplesWide } = getChunkHeightSamples(
    sampleHeightAt,
    originTileX,
    originTileZ,
    tileWidth,
    tileHeight
  );

  return {
    chunkX: canonicalChunkX,
    chunkZ: canonicalChunkZ,
    mapId: map.id,
    originTileX,
    originTileZ,
    samplesHigh,
    samplesWide,
    tileHeight,
    tileWidth,
    heights
  };
};

export const buildGeneratedMapChunk = (
  map: WrappedClassicMapSeed,
  chunkX: number,
  chunkZ: number
): GeneratedMapChunkRecord =>
  buildChunkFromSampler(
    map,
    createWrappedHeightSampler(map.generator, map.widthTiles, map.heightTiles, map.seed),
    chunkX,
    chunkZ
  );

export const buildGeneratedMapChunks = (
  map: ChunkSeed
): GeneratedMapChunkRecord[] => {
  const sampleHeightAt = createWrappedHeightSampler(
    map.generator,
    map.widthTiles,
    map.heightTiles,
    map.seed
  );
  const chunks: GeneratedMapChunkRecord[] = [];

  for (let chunkZ = 0; chunkZ < getChunkCount(map.heightTiles, map.chunkSizeTiles); chunkZ += 1) {
    for (let chunkX = 0; chunkX < getChunkCount(map.widthTiles, map.chunkSizeTiles); chunkX += 1) {
      chunks.push(buildChunkFromSampler(map, sampleHeightAt, chunkX, chunkZ));
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

export const decodeUint16Heights = (
  blob: ArrayBufferLike | ArrayBufferView,
  minHeight: number,
  step: number
): Float32Array => {
  const values = ArrayBuffer.isView(blob)
    ? new Uint16Array(
        blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
      )
    : new Uint16Array(blob.slice(0));
  const heights = new Float32Array(values.length);

  for (let index = 0; index < values.length; index += 1) {
    heights[index] = minHeight + values[index]! * step;
  }

  return heights;
};

export const encodeMaterialIds = (materials: number[]) => Uint8Array.from(materials);

export const deriveChunkMaterialIds = (
  heights: Float32Array,
  samplesWide: number,
  tileWidth: number,
  tileHeight: number,
  originTileX: number,
  originTileZ: number
) => {
  const materials = new Array<number>(tileWidth * tileHeight);

  for (let localZ = 0; localZ < tileHeight; localZ += 1) {
    for (let localX = 0; localX < tileWidth; localX += 1) {
      const h00 = heights[localZ * samplesWide + localX]!;
      const h10 = heights[localZ * samplesWide + localX + 1]!;
      const h01 = heights[(localZ + 1) * samplesWide + localX]!;
      const h11 = heights[(localZ + 1) * samplesWide + localX + 1]!;
      const elevation = (h00 + h10 + h01 + h11) * 0.25;
      const material = classifySurfaceMaterialFromElevation(
        originTileX + localX,
        originTileZ + localZ,
        elevation
      );

      materials[localZ * tileWidth + localX] = getSurfaceMaterialId(material);
    }
  }

  return materials;
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
  metersPerTile: MAP_METERS_PER_TILE
});
