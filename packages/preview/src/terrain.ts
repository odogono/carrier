import type { RuntimeMapChunk } from 'carrier-contracts/types';
import {
  BufferAttribute,
  BufferGeometry,
  Color
} from 'three';

import type { PreviewTerrainGrid } from './grounding';

const SURFACE_LOW = new Color('#4d6b63');
const SURFACE_HIGH = new Color('#c8b07a');

export const createSyntheticTerrainGrid = ({
  depthMeters,
  widthMeters
}: {
  depthMeters: number;
  widthMeters: number;
}): PreviewTerrainGrid => {
  const span = Math.max(widthMeters, depthMeters) + 32;
  const sampleSpacing = Math.max(Math.ceil(span / 24), 2);
  const samplesWide = Math.max(Math.ceil(span / sampleSpacing) + 1, 17);
  const samplesHigh = samplesWide;
  const totalWidth = (samplesWide - 1) * sampleSpacing;
  const totalDepth = (samplesHigh - 1) * sampleSpacing;
  const originX = -totalWidth * 0.5;
  const originZ = -totalDepth * 0.5;
  const heights = new Float32Array(samplesWide * samplesHigh);

  for (let row = 0; row < samplesHigh; row += 1) {
    for (let column = 0; column < samplesWide; column += 1) {
      const x = originX + column * sampleSpacing;
      const z = originZ + row * sampleSpacing;
      heights[row * samplesWide + column] =
        Math.sin(x * 0.08) * 1.6 +
        Math.cos(z * 0.06) * 1.2 +
        Math.sin((x + z) * 0.04) * 0.8;
    }
  }

  return {
    heights,
    originX,
    originZ,
    sampleSpacing,
    samplesHigh,
    samplesWide
  };
};

export const terrainGridFromRuntimeChunk = (
  chunk: Pick<
    RuntimeMapChunk,
    'heights' | 'originTileX' | 'originTileZ' | 'samplesHigh' | 'samplesWide'
  >,
  metersPerTile: number
): PreviewTerrainGrid => ({
  heights: chunk.heights,
  originX: chunk.originTileX * metersPerTile,
  originZ: chunk.originTileZ * metersPerTile,
  sampleSpacing: metersPerTile,
  samplesHigh: chunk.samplesHigh,
  samplesWide: chunk.samplesWide
});

export const buildTerrainGeometry = ({
  terrain,
  translateX,
  translateZ
}: {
  terrain: PreviewTerrainGrid;
  translateX: number;
  translateZ: number;
}) => {
  const positions = new Float32Array(terrain.samplesWide * terrain.samplesHigh * 3);
  const colors = new Float32Array(terrain.samplesWide * terrain.samplesHigh * 3);
  const indices: number[] = [];
  const minHeight = Math.min(...terrain.heights);
  const maxHeight = Math.max(...terrain.heights);
  const heightRange = Math.max(maxHeight - minHeight, 0.001);

  for (let row = 0; row < terrain.samplesHigh; row += 1) {
    for (let column = 0; column < terrain.samplesWide; column += 1) {
      const index = row * terrain.samplesWide + column;
      const worldX = terrain.originX + column * terrain.sampleSpacing;
      const worldZ = terrain.originZ + row * terrain.sampleSpacing;
      const height = terrain.heights[index] ?? 0;
      const offset = index * 3;
      const blend = (height - minHeight) / heightRange;
      const color = SURFACE_LOW.clone().lerp(SURFACE_HIGH, blend);

      positions[offset] = worldX - translateX;
      positions[offset + 1] = height;
      positions[offset + 2] = worldZ - translateZ;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;

      if (column === terrain.samplesWide - 1 || row === terrain.samplesHigh - 1) {
        continue;
      }

      const a = index;
      const b = index + 1;
      const c = index + terrain.samplesWide;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};
