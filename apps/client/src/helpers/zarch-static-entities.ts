import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity
} from 'carrier-contracts/types';

import { TILE } from '@/helpers/zarch-terrain';

export type StaticEntityGroundingResult = {
  effectiveY: number;
  valid: boolean;
};

export type TerrainGridEntry = {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  terrain: PreviewTerrainGrid;
};

type PreviewTerrainGrid = {
  heights: Float32Array;
  originX: number;
  originZ: number;
  sampleSpacing: number;
  samplesHigh: number;
  samplesWide: number;
};

const rotateOffset = (x: number, z: number, yawRadians: number) => {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);

  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine
  };
};

const getGroundingSamplePoints = ({
  anchorX,
  anchorZ,
  depthMeters,
  widthMeters,
  yawDegrees
}: {
  anchorX: number;
  anchorZ: number;
  depthMeters: number;
  widthMeters: number;
  yawDegrees: number;
}) => {
  const halfWidth = widthMeters * 0.5;
  const halfDepth = depthMeters * 0.5;
  const yawRadians = (yawDegrees * Math.PI) / 180;

  return [
    { x: 0, z: 0 },
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: -halfWidth, z: halfDepth },
    { x: halfWidth, z: halfDepth }
  ].map(offset => {
    const rotated = rotateOffset(offset.x, offset.z, yawRadians);

    return {
      x: anchorX + rotated.x,
      z: anchorZ + rotated.z
    };
  });
};

const sampleTerrainHeight = (
  terrain: PreviewTerrainGrid,
  x: number,
  z: number
) => {
  const localX = (x - terrain.originX) / terrain.sampleSpacing;
  const localZ = (z - terrain.originZ) / terrain.sampleSpacing;

  if (
    localX < 0 ||
    localZ < 0 ||
    localX > terrain.samplesWide - 1 ||
    localZ > terrain.samplesHigh - 1
  ) {
    return null;
  }

  const x0 = Math.floor(localX);
  const z0 = Math.floor(localZ);
  const x1 = Math.min(x0 + 1, terrain.samplesWide - 1);
  const z1 = Math.min(z0 + 1, terrain.samplesHigh - 1);
  const tx = localX - x0;
  const tz = localZ - z0;
  const rowStride = terrain.samplesWide;
  const h00 = terrain.heights[z0 * rowStride + x0];
  const h10 = terrain.heights[z0 * rowStride + x1];
  const h01 = terrain.heights[z1 * rowStride + x0];
  const h11 = terrain.heights[z1 * rowStride + x1];

  if (
    h00 === undefined ||
    h10 === undefined ||
    h01 === undefined ||
    h11 === undefined
  ) {
    return null;
  }

  const top = h00 * (1 - tx) + h10 * tx;
  const bottom = h01 * (1 - tx) + h11 * tx;
  return top * (1 - tz) + bottom * tz;
};

const terrainGridFromRuntimeChunk = (
  chunk: RuntimeMapChunk,
  metersPerTile: number
): PreviewTerrainGrid => ({
  heights: chunk.heights,
  originX: chunk.originTileX * metersPerTile,
  originZ: chunk.originTileZ * metersPerTile,
  sampleSpacing: metersPerTile,
  samplesHigh: chunk.samplesHigh,
  samplesWide: chunk.samplesWide
});

const getChunkWorldBounds = (
  map: Pick<MapMetadata, 'resolution'>,
  chunk: RuntimeMapChunk
) => {
  const sizeMeters = map.resolution.metersPerTile;

  return {
    maxX: (chunk.originTileX + chunk.tileWidth) * sizeMeters,
    maxZ: (chunk.originTileZ + chunk.tileHeight) * sizeMeters,
    minX: chunk.originTileX * sizeMeters,
    minZ: chunk.originTileZ * sizeMeters
  };
};

export const getTerrainGrids = (
  chunks: RuntimeMapChunk[],
  map: Pick<MapMetadata, 'resolution'>
): TerrainGridEntry[] =>
  chunks.map(chunk => ({
    ...getChunkWorldBounds(map, chunk),
    terrain: terrainGridFromRuntimeChunk(chunk, map.resolution.metersPerTile)
  }));

const resolveTerrainHeight = (
  terrains: TerrainGridEntry[],
  point: Pick<StaticEntity['position'], 'x' | 'z'>
) => {
  for (const terrain of terrains) {
    if (
      point.x < terrain.minX ||
      point.x > terrain.maxX ||
      point.z < terrain.minZ ||
      point.z > terrain.maxZ
    ) {
      continue;
    }

    const height = sampleTerrainHeight(terrain.terrain, point.x, point.z);

    if (height !== null) {
      return height;
    }
  }

  return null;
};

export const collectChunkStaticEntities = (chunks: RuntimeMapChunk[]) => {
  const entitiesById = new Map<string, StaticEntity>();

  for (const chunk of chunks) {
    for (const entity of chunk.staticEntities) {
      if (entity.state !== 'active' || entitiesById.has(entity.id)) {
        continue;
      }

      entitiesById.set(entity.id, entity);
    }
  }

  return Array.from(entitiesById.values());
};

export const getSceneMetersScale = (map: Pick<MapMetadata, 'resolution'>) =>
  TILE / map.resolution.metersPerTile;

export const getStaticEntityScenePosition = ({
  entity,
  map
}: {
  entity: Pick<StaticEntity, 'position'>;
  map: Pick<MapMetadata, 'resolution'>;
}) => {
  const scale = getSceneMetersScale(map);

  return {
    x: entity.position.x * scale,
    z: entity.position.z * scale
  };
};

export const getStaticEntityGrounding = ({
  assetVersion,
  entity,
  terrains
}: {
  assetVersion: Pick<AssetVersion, 'footprint' | 'maxHeightDeltaMeters'>;
  entity: Pick<StaticEntity, 'position' | 'rotation' | 'scale' | 'yOffset'>;
  terrains: TerrainGridEntry[];
}): StaticEntityGroundingResult | null => {
  const samplePoints = getGroundingSamplePoints({
    anchorX: entity.position.x,
    anchorZ: entity.position.z,
    depthMeters: assetVersion.footprint.depthMeters * entity.scale,
    widthMeters: assetVersion.footprint.widthMeters * entity.scale,
    yawDegrees: entity.rotation.yaw
  });
  const heights: number[] = [];

  for (const point of samplePoints) {
    const height = resolveTerrainHeight(terrains, point);

    if (height === null) {
      return null;
    }

    heights.push(height);
  }

  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const averageHeight =
    heights.reduce((sum, value) => sum + value, 0) / heights.length;

  return {
    effectiveY: averageHeight + entity.yOffset,
    valid: maxHeight - minHeight <= assetVersion.maxHeightDeltaMeters
  };
};
