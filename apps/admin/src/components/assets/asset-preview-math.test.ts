import { expect, test } from 'bun:test';

import {
  computeGroundingResult,
  getChunkCenterAnchor,
  getGroundingSamplePoints,
  type PreviewTerrainGrid
} from 'carrier-preview';

const flatTerrain = (height = 0): PreviewTerrainGrid => ({
  heights: new Float32Array([
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height,
    height
  ]),
  originX: -10,
  originZ: -10,
  sampleSpacing: 5,
  samplesHigh: 5,
  samplesWide: 5
});

test('computes rotated grounding sample points around the anchor', () => {
  const samples = getGroundingSamplePoints({
    anchorX: 0,
    anchorZ: 0,
    depthMeters: 10,
    widthMeters: 20,
    yawDegrees: 90
  });

  expect(samples).toHaveLength(5);
  expect(samples.find(sample => sample.label === 'center')).toEqual({
    label: 'center',
    x: 0,
    z: 0
  });
  const frontLeft = samples.find(sample => sample.label === 'front-left');
  expect(frontLeft?.label).toBe('front-left');
  expect(frontLeft?.x).toBeCloseTo(5, 8);
  expect(frontLeft?.z).toBeCloseTo(-10, 8);
});

test('computes average height and validity from grounding samples', () => {
  const terrain: PreviewTerrainGrid = {
    heights: new Float32Array([
      0,
      0,
      0,
      0,
      2,
      0,
      0,
      0,
      4
    ]),
    originX: -5,
    originZ: -5,
    sampleSpacing: 5,
    samplesHigh: 3,
    samplesWide: 3
  };

  const result = computeGroundingResult({
    anchorX: 0,
    anchorZ: 0,
    depthMeters: 10,
    maxHeightDeltaMeters: 2.5,
    terrain,
    widthMeters: 10,
    yawDegrees: 0
  });

  expect(result).not.toBeNull();
  expect(result?.samples).toHaveLength(5);
  expect(result?.averageHeight).toBeGreaterThan(0);
  expect(result?.maxHeightDelta).toBeGreaterThan(2.5);
  expect(result?.valid).toBe(false);
});

test('returns valid grounding on flat terrain', () => {
  const result = computeGroundingResult({
    anchorX: 0,
    anchorZ: 0,
    depthMeters: 8,
    maxHeightDeltaMeters: 0.25,
    terrain: flatTerrain(3),
    widthMeters: 8,
    yawDegrees: 35
  });

  expect(result).not.toBeNull();
  expect(result?.averageHeight).toBeCloseTo(3, 5);
  expect(result?.maxHeightDelta).toBeCloseTo(0, 5);
  expect(result?.valid).toBe(true);
});

test('computes chunk-center anchor in world metres', () => {
  expect(
    getChunkCenterAnchor(
      {
        originTileX: 4,
        originTileZ: -2,
        tileHeight: 32,
        tileWidth: 32
      },
      10
    )
  ).toEqual({
    x: 200,
    z: 140
  });
});
