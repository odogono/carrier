import { describe, expect, test } from 'bun:test';

import {
  MAP_WATER_LEVEL,
  buildGeneratedMapChunks,
  generateDiamondSquareHeightfield,
  generateIslandHeightfield
} from './generation';

const getTileStats = (heights: Float32Array, sampleWidth: number, sampleHeight: number) => {
  const widthTiles = sampleWidth - 1;
  const heightTiles = sampleHeight - 1;
  const landMask = new Uint8Array(widthTiles * heightTiles);
  let landTiles = 0;

  for (let z = 0; z < heightTiles; z += 1) {
    for (let x = 0; x < widthTiles; x += 1) {
      const samples = [
        heights[z * sampleWidth + x]!,
        heights[z * sampleWidth + x + 1]!,
        heights[(z + 1) * sampleWidth + x]!,
        heights[(z + 1) * sampleWidth + x + 1]!
      ];
      const average =
        samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      const index = z * widthTiles + x;

      if (average >= MAP_WATER_LEVEL) {
        landMask[index] = 1;
        landTiles += 1;
      }
    }
  }

  let largestLandmass = 0;
  let landmasses = 0;
  const visited = new Uint8Array(landMask.length);

  for (let z = 0; z < heightTiles; z += 1) {
    for (let x = 0; x < widthTiles; x += 1) {
      const start = z * widthTiles + x;

      if (landMask[start] === 0 || visited[start] === 1) {
        continue;
      }

      landmasses += 1;
      visited[start] = 1;
      const queue = [start];
      let size = 0;

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentX = current % widthTiles;
        const currentZ = Math.floor(current / widthTiles);
        size += 1;

        const neighbors = [
          [currentX - 1, currentZ],
          [currentX + 1, currentZ],
          [currentX, currentZ - 1],
          [currentX, currentZ + 1]
        ];

        for (const [neighborX, neighborZ] of neighbors) {
          if (
            neighborX < 0 ||
            neighborZ < 0 ||
            neighborX >= widthTiles ||
            neighborZ >= heightTiles
          ) {
            continue;
          }

          const neighbor = neighborZ * widthTiles + neighborX;

          if (landMask[neighbor] === 0 || visited[neighbor] === 1) {
            continue;
          }

          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }

      largestLandmass = Math.max(largestLandmass, size);
    }
  }

  let edgeWaterTiles = 0;
  let edgeTiles = 0;
  let centerWaterTiles = 0;
  let centerTiles = 0;

  for (let z = 0; z < heightTiles; z += 1) {
    for (let x = 0; x < widthTiles; x += 1) {
      const index = z * widthTiles + x;
      const normalizedX = widthTiles <= 1 ? 0.5 : x / (widthTiles - 1);
      const normalizedZ = heightTiles <= 1 ? 0.5 : z / (heightTiles - 1);
      const nearEdge =
        normalizedX < 0.18 ||
        normalizedX > 0.82 ||
        normalizedZ < 0.18 ||
        normalizedZ > 0.82;
      const nearCenter =
        normalizedX >= 0.3 &&
        normalizedX <= 0.7 &&
        normalizedZ >= 0.3 &&
        normalizedZ <= 0.7;

      if (nearEdge) {
        edgeTiles += 1;
        edgeWaterTiles += landMask[index] === 0 ? 1 : 0;
      }

      if (nearCenter) {
        centerTiles += 1;
        centerWaterTiles += landMask[index] === 0 ? 1 : 0;
      }
    }
  }

  return {
    centerWaterRatio: centerTiles === 0 ? 0 : centerWaterTiles / centerTiles,
    edgeWaterRatio: edgeTiles === 0 ? 0 : edgeWaterTiles / edgeTiles,
    landRatio: landTiles / (widthTiles * heightTiles),
    landmasses,
    largestLandmass
  };
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

  test('is deterministic for the same seed and size', () => {
    const first = generateDiamondSquareHeightfield(96, 64, 'repeatable-seed');
    const second = generateDiamondSquareHeightfield(96, 64, 'repeatable-seed');

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
  });

  test('island preset is deterministic for the same seed and size', () => {
    const first = generateIslandHeightfield(128, 96, 'repeatable-islands');
    const second = generateIslandHeightfield(128, 96, 'repeatable-islands');

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
  });

  test('produces chunk seams with matching border samples', () => {
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

  test('island preset produces chunk seams with matching border samples', () => {
    const chunks = buildGeneratedMapChunks({
      chunkSizeTiles: 32,
      generator: 'island-clusters',
      heightTiles: 96,
      id: 'map-islands',
      metersPerTile: 10,
      seed: 'chunk-seams-islands',
      widthTiles: 96
    });
    const north = chunks.find(chunk => chunk.chunkX === 1 && chunk.chunkZ === 0);
    const south = chunks.find(chunk => chunk.chunkX === 1 && chunk.chunkZ === 1);

    expect(north).toBeDefined();
    expect(south).toBeDefined();

    for (let sampleX = 0; sampleX < north!.samplesWide; sampleX += 1) {
      const northHeight = north!.heights[north!.tileHeight * north!.samplesWide + sampleX];
      const southHeight = south!.heights[sampleX];

      expect(northHeight).toBe(southHeight);
    }
  });

  test('edge chunks expose the expected sample grid shape', () => {
    const chunk = buildGeneratedMapChunks({
      chunkSizeTiles: 32,
      generator: 'diamond-square',
      heightTiles: 45,
      id: 'map-edge',
      metersPerTile: 10,
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

  test('island preset keeps a balanced mix of landmasses and edge water', () => {
    const representativeSeeds = ['archipelago-alpha', 'archipelago-beta', 'archipelago-gamma'];

    for (const seed of representativeSeeds) {
      const heightfield = generateIslandHeightfield(128, 96, seed);
      const stats = getTileStats(
        heightfield.heights,
        heightfield.sampleWidth,
        heightfield.sampleHeight
      );

      expect(stats.landRatio).toBeGreaterThan(0.18);
      expect(stats.landRatio).toBeLessThan(0.55);
      expect(stats.largestLandmass).toBeGreaterThan(400);
      expect(stats.landmasses).toBeGreaterThan(3);
      expect(stats.edgeWaterRatio).toBeGreaterThan(stats.centerWaterRatio);
      expect(stats.edgeWaterRatio - stats.centerWaterRatio).toBeGreaterThan(0.12);
    }
  });
});
