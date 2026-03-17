import {
  MAP_GENERATOR,
  MAP_GENERATOR_ISLANDS,
  MAP_METERS_PER_TILE,
  getSurfaceMaterialColorRgb,
  resolveSurfaceMaterial,
  type MapGenerator
} from 'carrier-contracts';

import {
  buildGeneratedMapChunks,
  decodeFloat32Heights,
  encodeFloat32Heights,
  toMapChunkResponse,
  type GeneratedMapChunkRecord
} from './generation';

const WATER_LEVEL = -10;
const CHUNK_SIZE_TILES = 32;
const BENCHMARK_ITERATIONS = 5_000;

type QuantizedHeightPayload = {
  data: Uint8Array;
  encoding: 'uint16' | 'uint8';
  maxHeight: number;
  minHeight: number;
  step: number;
};

type CandidateSummary = {
  averageErrorMetres: number;
  averageTileAverageErrorMetres: number;
  colorMismatchCount: number;
  colorMismatchRate: number;
  decodeMicrosecondsPerChunk: number;
  encodedBytes: number;
  encoding: 'float32' | 'uint16' | 'uint8';
  maxErrorMetres: number;
  maxTileAverageErrorMetres: number;
  shorelineMismatchCount: number;
  shorelineMismatchRate: number;
  tileCount: number;
  waterMismatchCount: number;
  waterMismatchRate: number;
};

type ChunkEvaluation = {
  currentJsonBytes: number;
  currentStorageBytes: number;
  currentWireBinaryEnvelopeBytes: number;
  sampleCount: number;
  uint16: CandidateSummary;
  uint8: CandidateSummary;
};

type MapAggregate = {
  chunkCount: number;
  currentJsonBytes: number;
  currentStorageBytes: number;
  generator: MapGenerator;
  sizeTiles: number;
  uint16Bytes: number;
  uint8Bytes: number;
};

export type HeightEncodingEvaluationReport = {
  chunk: ChunkEvaluation;
  maps: MapAggregate[];
  recommendation: {
    summary: string;
    uint16: 'pass' | 'review' | 'fail';
    uint8: 'pass' | 'review' | 'fail';
  };
};

let cachedReport: HeightEncodingEvaluationReport | null = null;

const sampleIndex = (x: number, z: number, width: number) => z * width + x;

const quantizeHeights = (
  heights: Float32Array,
  encoding: 'uint16' | 'uint8'
): QuantizedHeightPayload => {
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (const height of heights) {
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }

  const range = maxHeight - minHeight;
  const maxInteger = encoding === 'uint16' ? 65_535 : 255;
  const step = range === 0 ? 0 : range / maxInteger;

  if (encoding === 'uint16') {
    const values = new Uint16Array(heights.length);

    for (let index = 0; index < heights.length; index += 1) {
      values[index] =
        step === 0 ? 0 : Math.round((heights[index]! - minHeight) / step);
    }

    return {
      data: new Uint8Array(values.buffer.slice(0)),
      encoding,
      maxHeight,
      minHeight,
      step
    };
  }

  const values = new Uint8Array(heights.length);

  for (let index = 0; index < heights.length; index += 1) {
    values[index] =
      step === 0 ? 0 : Math.round((heights[index]! - minHeight) / step);
  }

  return {
    data: values,
    encoding,
    maxHeight,
    minHeight,
    step
  };
};

const decodeQuantizedHeights = (
  payload: QuantizedHeightPayload,
  sampleCount: number
) => {
  const heights = new Float32Array(sampleCount);

  if (payload.encoding === 'uint16') {
    const values = new Uint16Array(
      payload.data.buffer.slice(
        payload.data.byteOffset,
        payload.data.byteOffset + payload.data.byteLength
      )
    );

    for (let index = 0; index < values.length; index += 1) {
      heights[index] = payload.minHeight + values[index]! * payload.step;
    }

    return heights;
  }

  for (let index = 0; index < payload.data.length; index += 1) {
    heights[index] = payload.minHeight + payload.data[index]! * payload.step;
  }

  return heights;
};

const getTileAverageHeight = (
  heights: Float32Array,
  sampleWidth: number,
  gx: number,
  gz: number
) =>
  (heights[sampleIndex(gx, gz, sampleWidth)]! +
    heights[sampleIndex(gx + 1, gz, sampleWidth)]! +
    heights[sampleIndex(gx, gz + 1, sampleWidth)]! +
    heights[sampleIndex(gx + 1, gz + 1, sampleWidth)]!) *
  0.25;

const isWaterTile = (
  heights: Float32Array,
  sampleWidth: number,
  gx: number,
  gz: number
) => getTileAverageHeight(heights, sampleWidth, gx, gz) < WATER_LEVEL;

const touchesWater = (
  heights: Float32Array,
  sampleWidth: number,
  tileWidth: number,
  tileHeight: number,
  gx: number,
  gz: number
) => {
  for (let deltaZ = -1; deltaZ <= 1; deltaZ += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      const nextX = gx + deltaX;
      const nextZ = gz + deltaZ;

      if (
        nextX < 0 ||
        nextZ < 0 ||
        nextX >= tileWidth ||
        nextZ >= tileHeight
      ) {
        continue;
      }

      if (isWaterTile(heights, sampleWidth, nextX, nextZ)) {
        return true;
      }
    }
  }

  return false;
};

const colorsMatch = (
  baselineElevation: number,
  candidateElevation: number,
  gx: number,
  gz: number
) => {
  const baselineMaterial = resolveSurfaceMaterial(gx, gz, baselineElevation);
  const candidateMaterial = resolveSurfaceMaterial(gx, gz, candidateElevation);
  const baselineColor = getSurfaceMaterialColorRgb(baselineMaterial, gx, gz);
  const candidateColor = getSurfaceMaterialColorRgb(candidateMaterial, gx, gz);

  return (
    baselineColor[0] === candidateColor[0] &&
    baselineColor[1] === candidateColor[1] &&
    baselineColor[2] === candidateColor[2]
  );
};

const measureDecodeMicroseconds = (
  decode: () => Float32Array
) => {
  const start = performance.now();

  for (let iteration = 0; iteration < BENCHMARK_ITERATIONS; iteration += 1) {
    decode();
  }

  return ((performance.now() - start) * 1000) / BENCHMARK_ITERATIONS;
};

const summarizeCandidate = (
  baseline: GeneratedMapChunkRecord,
  encoding: 'uint16' | 'uint8'
): CandidateSummary => {
  const payload = quantizeHeights(baseline.heights, encoding);
  const reconstructed = decodeQuantizedHeights(payload, baseline.heights.length);

  let maxErrorMetres = 0;
  let averageErrorAccumulator = 0;

  for (let index = 0; index < baseline.heights.length; index += 1) {
    const error = Math.abs(baseline.heights[index]! - reconstructed[index]!);
    averageErrorAccumulator += error;
    maxErrorMetres = Math.max(maxErrorMetres, error);
  }

  let averageTileAverageErrorAccumulator = 0;
  let colorMismatchCount = 0;
  let maxTileAverageErrorMetres = 0;
  let shorelineMismatchCount = 0;
  let waterMismatchCount = 0;

  for (let gz = 0; gz < baseline.tileHeight; gz += 1) {
    for (let gx = 0; gx < baseline.tileWidth; gx += 1) {
      const baselineAverage = getTileAverageHeight(baseline.heights, baseline.samplesWide, gx, gz);
      const reconstructedAverage = getTileAverageHeight(
        reconstructed,
        baseline.samplesWide,
        gx,
        gz
      );
      const tileAverageError = Math.abs(baselineAverage - reconstructedAverage);

      averageTileAverageErrorAccumulator += tileAverageError;
      maxTileAverageErrorMetres = Math.max(maxTileAverageErrorMetres, tileAverageError);

      if (!colorsMatch(baselineAverage, reconstructedAverage, baseline.originTileX + gx, baseline.originTileZ + gz)) {
        colorMismatchCount += 1;
      }

      if (
        isWaterTile(baseline.heights, baseline.samplesWide, gx, gz) !==
        isWaterTile(reconstructed, baseline.samplesWide, gx, gz)
      ) {
        waterMismatchCount += 1;
      }

      if (
        touchesWater(
          baseline.heights,
          baseline.samplesWide,
          baseline.tileWidth,
          baseline.tileHeight,
          gx,
          gz
        ) !==
        touchesWater(
          reconstructed,
          baseline.samplesWide,
          baseline.tileWidth,
          baseline.tileHeight,
          gx,
          gz
        )
      ) {
        shorelineMismatchCount += 1;
      }
    }
  }

  const tileCount = baseline.tileWidth * baseline.tileHeight;

  return {
    averageErrorMetres: averageErrorAccumulator / baseline.heights.length,
    averageTileAverageErrorMetres: averageTileAverageErrorAccumulator / tileCount,
    colorMismatchCount,
    colorMismatchRate: colorMismatchCount / tileCount,
    decodeMicrosecondsPerChunk: measureDecodeMicroseconds(() =>
      decodeQuantizedHeights(payload, baseline.heights.length)
    ),
    encodedBytes: payload.data.byteLength,
    encoding,
    maxErrorMetres,
    maxTileAverageErrorMetres,
    shorelineMismatchCount,
    shorelineMismatchRate: shorelineMismatchCount / tileCount,
    tileCount,
    waterMismatchCount,
    waterMismatchRate: waterMismatchCount / tileCount
  };
};

const createMapSeed = (generator: MapGenerator, sizeTiles: number) => ({
  chunkSizeTiles: CHUNK_SIZE_TILES,
  generator,
  heightTiles: sizeTiles,
  id: `${generator}-${sizeTiles}`,
  metersPerTile: MAP_METERS_PER_TILE,
  seed: `evaluation:${generator}:${sizeTiles}`,
  widthTiles: sizeTiles
});

const estimateCurrentJsonBytes = (chunk: GeneratedMapChunkRecord) =>
  new TextEncoder().encode(JSON.stringify(toMapChunkResponse(chunk))).byteLength;

const estimateBinaryEnvelopeBytes = (
  chunk: GeneratedMapChunkRecord,
  encoding: 'float32' | 'uint16' | 'uint8',
  encodedBytes: number,
  minHeight?: number,
  maxHeight?: number,
  step?: number
) => {
  const envelope = {
    chunkX: chunk.chunkX,
    chunkZ: chunk.chunkZ,
    layers: {
      height: {
        encoding,
        maxHeight,
        minHeight,
        step,
        unit: 'metres'
      }
    },
    mapId: chunk.mapId,
    originTileX: chunk.originTileX,
    originTileZ: chunk.originTileZ,
    samplesHigh: chunk.samplesHigh,
    samplesWide: chunk.samplesWide,
    tileHeight: chunk.tileHeight,
    tileWidth: chunk.tileWidth
  };

  return new TextEncoder().encode(JSON.stringify(envelope)).byteLength + encodedBytes;
};

export const evaluateRepresentativeChunkEncodingOptions = (): ChunkEvaluation => {
  const [chunk] = buildGeneratedMapChunks(createMapSeed(MAP_GENERATOR_ISLANDS, 64));

  if (!chunk) {
    throw new Error('Expected at least one generated chunk for evaluation.');
  }

  const uint16Payload = quantizeHeights(chunk.heights, 'uint16');
  const uint8Payload = quantizeHeights(chunk.heights, 'uint8');

  return {
    currentJsonBytes: estimateCurrentJsonBytes(chunk),
    currentStorageBytes: encodeFloat32Heights(chunk.heights).byteLength,
    currentWireBinaryEnvelopeBytes: estimateBinaryEnvelopeBytes(
      chunk,
      'float32',
      encodeFloat32Heights(chunk.heights).byteLength
    ),
    sampleCount: chunk.heights.length,
    uint16: summarizeCandidate(chunk, 'uint16'),
    uint8: summarizeCandidate(chunk, 'uint8')
  };
};

const evaluateLargeMaps = (): MapAggregate[] => {
  const sizes = [64, 256, 1024];
  const generators = [MAP_GENERATOR, MAP_GENERATOR_ISLANDS] as const;

  return generators.flatMap((generator) =>
    sizes.map((sizeTiles) => {
      const chunks = buildGeneratedMapChunks(createMapSeed(generator, sizeTiles));
      let currentJsonBytes = 0;
      let currentStorageBytes = 0;
      let uint16Bytes = 0;
      let uint8Bytes = 0;

      for (const chunk of chunks) {
        currentJsonBytes += estimateCurrentJsonBytes(chunk);
        currentStorageBytes += encodeFloat32Heights(chunk.heights).byteLength;
        uint16Bytes += quantizeHeights(chunk.heights, 'uint16').data.byteLength;
        uint8Bytes += quantizeHeights(chunk.heights, 'uint8').data.byteLength;
      }

      return {
        chunkCount: chunks.length,
        currentJsonBytes,
        currentStorageBytes,
        generator,
        sizeTiles,
        uint16Bytes,
        uint8Bytes
      };
    })
  );
};

const summarizeRecommendation = (chunk: ChunkEvaluation) => {
  const uint16Pass =
    chunk.uint16.waterMismatchCount === 0 &&
    chunk.uint16.shorelineMismatchCount === 0 &&
    chunk.uint16.maxTileAverageErrorMetres < 0.05;

  return {
    summary: uint16Pass
      ? 'Quantized uint16 is safe enough to prototype next; uint8 is for proof-by-failure only.'
      : 'Keep float32 until quantization thresholds or map encoding strategy are revisited.',
    uint16: uint16Pass ? 'pass' : chunk.uint16.maxTileAverageErrorMetres < 0.1 ? 'review' : 'fail',
    uint8:
      chunk.uint8.waterMismatchCount === 0 &&
      chunk.uint8.shorelineMismatchCount === 0 &&
      chunk.uint8.maxTileAverageErrorMetres < 0.1
        ? 'pass'
        : 'fail'
  } satisfies HeightEncodingEvaluationReport['recommendation'];
};

export const evaluateHeightEncodingOptions = (): HeightEncodingEvaluationReport => {
  if (cachedReport) {
    return cachedReport;
  }

  const chunk = evaluateRepresentativeChunkEncodingOptions();
  const maps = evaluateLargeMaps();

  cachedReport = {
    chunk,
    maps,
    recommendation: summarizeRecommendation(chunk)
  };

  return cachedReport;
};

export const decodeCurrentFloat32Chunk = (heights: Float32Array) =>
  decodeFloat32Heights(encodeFloat32Heights(heights));
