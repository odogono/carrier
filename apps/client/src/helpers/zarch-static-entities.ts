import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity
} from 'carrier-contracts/types';

import { TILE, type ZarchTerrain } from '@/helpers/zarch-terrain';

export type StaticEntityGroundingResult = {
  effectiveY: number;
  valid: boolean;
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

export const shouldUseStaticEntityInstancing = ({
  entityEditEnabled,
  instancedRuntimeAvailable,
  instancingEligible
}: {
  entityEditEnabled: boolean;
  instancedRuntimeAvailable: boolean;
  instancingEligible: boolean;
}) =>
  instancingEligible && instancedRuntimeAvailable && !entityEditEnabled;

export const getStaticEntityGrounding = ({
  assetVersion,
  entity,
  map,
  terrain
}: {
  assetVersion: Pick<AssetVersion, 'footprint' | 'maxHeightDeltaMeters'>;
  entity: Pick<StaticEntity, 'position' | 'rotation' | 'scale' | 'yOffset'>;
  map: Pick<MapMetadata, 'resolution'>;
  terrain: Pick<ZarchTerrain, 'sampleHeightAtWorld'>;
}): StaticEntityGroundingResult | null => {
  const sceneScale = getSceneMetersScale(map);
  const samplePoints = getGroundingSamplePoints({
    anchorX: entity.position.x,
    anchorZ: entity.position.z,
    depthMeters: assetVersion.footprint.depthMeters * entity.scale,
    widthMeters: assetVersion.footprint.widthMeters * entity.scale,
    yawDegrees: entity.rotation.yaw
  });
  const heights: number[] = [];

  for (const point of samplePoints) {
    const height = terrain.sampleHeightAtWorld(
      point.x * sceneScale,
      point.z * sceneScale
    );

    if (height === null) {
      return null;
    }

    heights.push(height);
  }

  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const centerHeight = heights[0];

  if (centerHeight === undefined) {
    return null;
  }

  return {
    effectiveY: centerHeight + entity.yOffset,
    valid: maxHeight - minHeight <= assetVersion.maxHeightDeltaMeters
  };
};
