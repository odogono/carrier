import { describe, expect, test } from 'bun:test';

import { buildGeneratedMapChunks, generateDiamondSquareHeightfield } from './generation';

describe('map generation', () => {
  test('supports non-square maps and returns the expected sample dimensions', () => {
    const wide = generateDiamondSquareHeightfield(96, 64, 'seed-a');
    const tall = generateDiamondSquareHeightfield(257, 129, 'seed-b');

    expect(wide.sampleWidth).toBe(97);
    expect(wide.sampleHeight).toBe(65);
    expect(tall.sampleWidth).toBe(258);
    expect(tall.sampleHeight).toBe(130);
  });

  test('is deterministic for the same seed and size', () => {
    const first = generateDiamondSquareHeightfield(96, 64, 'repeatable-seed');
    const second = generateDiamondSquareHeightfield(96, 64, 'repeatable-seed');

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
  });

  test('produces chunk seams with matching border samples', () => {
    const chunks = buildGeneratedMapChunks({
      chunkSizeTiles: 32,
      generator: 'diamond-square',
      heightTiles: 64,
      id: 'map-1',
      metersPerTile: 10,
      renderUnitsPerTile: 24,
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

  test('edge chunks expose the expected sample grid shape', () => {
    const chunk = buildGeneratedMapChunks({
      chunkSizeTiles: 32,
      generator: 'diamond-square',
      heightTiles: 45,
      id: 'map-edge',
      metersPerTile: 10,
      renderUnitsPerTile: 24,
      seed: 'edge-shape',
      widthTiles: 70
    }).find(candidate => candidate.chunkX === 2 && candidate.chunkZ === 1);

    expect(chunk).toBeDefined();
    expect(chunk!.tileWidth).toBe(6);
    expect(chunk!.tileHeight).toBe(13);
    expect(chunk!.samplesWide).toBe(7);
    expect(chunk!.samplesHigh).toBe(14);
    expect(chunk!.heights).toHaveLength(chunk!.samplesWide * chunk!.samplesHigh);
  });
});
