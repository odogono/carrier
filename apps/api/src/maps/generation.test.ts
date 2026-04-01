import { describe, expect, test } from 'bun:test';

import {
  buildGeneratedMapChunk,
  buildGeneratedMapChunks,
  generateDiamondSquareHeightfield,
  generateIslandHeightfield,
  MAP_WATER_LEVEL
} from './generation';

const expectWrappedSeams = (
  heights: Float32Array,
  sampleWidth: number,
  sampleHeight: number
) => {
  for (let z = 0; z < sampleHeight; z += 1) {
    expect(heights[z * sampleWidth]).toBe(
      heights[z * sampleWidth + (sampleWidth - 1)]
    );
  }

  for (let x = 0; x < sampleWidth; x += 1) {
    expect(heights[x]).toBe(
      heights[(sampleHeight - 1) * sampleWidth + x]
    );
  }
};

describe('map generation', () => {
  test('supports non-square maps and returns the expected sample dimensions', () => {
    const wide = generateDiamondSquareHeightfield(96, 64, 'seed-a');
    const tall = generateDiamondSquareHeightfield(257, 129, 'seed-b');

    expect(wide.sampleWidth).toBe(97);
    expect(wide.sampleHeight).toBe(65);
    expect(tall.sampleWidth).toBe(258);
    expect(tall.sampleHeight).toBe(130);
  });

  test('diamond-square compatibility generator is deterministic and wraps at the map seam', () => {
    const first = generateDiamondSquareHeightfield(96, 64, 'repeatable-seed');
    const second = generateDiamondSquareHeightfield(96, 64, 'repeatable-seed');

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
    expectWrappedSeams(first.heights, first.sampleWidth, first.sampleHeight);
  });

  test('island preset is deterministic and wraps at the map seam', () => {
    const first = generateIslandHeightfield(128, 96, 'repeatable-islands');
    const second = generateIslandHeightfield(128, 96, 'repeatable-islands');

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
    expectWrappedSeams(first.heights, first.sampleWidth, first.sampleHeight);
  });

  test('island params can make the archipelago meaningfully denser', () => {
    const sparse = generateIslandHeightfield(128, 128, 'density-seed', {
      densityBias: 0,
      majorAttractorCount: 2,
      mediumAttractorCount: 5,
      radiusScale: 1
    });
    const dense = generateIslandHeightfield(128, 128, 'density-seed', {
      densityBias: 0.45,
      majorAttractorCount: 6,
      mediumAttractorCount: 14,
      radiusScale: 1.8
    });

    const countLand = (heights: Float32Array) =>
      Array.from(heights).filter(height => height > MAP_WATER_LEVEL).length;

    expect(countLand(dense.heights)).toBeGreaterThan(countLand(sparse.heights));
  });

  test('generated chunks keep matching internal border samples', () => {
    const chunks = buildGeneratedMapChunks({
      chunkSizeTiles: 32,
      generator: 'diamond-square',
      heightTiles: 64,
      id: 'map-1',
      metersPerTile: 10,
      seed: 'chunk-seams',
      widthTiles: 64
    });
    const west = chunks.find(chunk => chunk.chunkX === 0 && chunk.chunkZ === 0);
    const east = chunks.find(chunk => chunk.chunkX === 1 && chunk.chunkZ === 0);

    expect(west).toBeDefined();
    expect(east).toBeDefined();

    for (let sampleZ = 0; sampleZ < west!.samplesHigh; sampleZ += 1) {
      const westHeight = west!.heights[sampleZ * west!.samplesWide + west!.tileWidth];
      const eastHeight = east!.heights[sampleZ * east!.samplesWide];

      expect(westHeight).toBe(eastHeight);
    }
  });

  test('signed-equivalent chunk requests resolve to byte-identical canonical chunks', () => {
    const lastChunk = buildGeneratedMapChunk(
      {
        chunkSizeTiles: 32,
        generator: 'island-clusters',
        heightTiles: 64,
        id: 'map-wrap',
        metersPerTile: 10,
        seed: 'wrap-seed',
        widthTiles: 64
      },
      1,
      1
    );
    const aliasedChunk = buildGeneratedMapChunk(
      {
        chunkSizeTiles: 32,
        generator: 'island-clusters',
        heightTiles: 64,
        id: 'map-wrap',
        metersPerTile: 10,
        seed: 'wrap-seed',
        widthTiles: 64
      },
      -1,
      -1
    );

    expect(aliasedChunk.chunkX).toBe(lastChunk.chunkX);
    expect(aliasedChunk.chunkZ).toBe(lastChunk.chunkZ);
    expect(aliasedChunk.originTileX).toBe(lastChunk.originTileX);
    expect(aliasedChunk.originTileZ).toBe(lastChunk.originTileZ);
    expect(Array.from(aliasedChunk.heights)).toEqual(Array.from(lastChunk.heights));
  });
});
