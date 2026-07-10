import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity
} from 'carrier-contracts/types';
import { computeScaledGroundingResult } from 'carrier-preview';

import { TILE, type ZarchTerrain } from '@/helpers/zarch-terrain';

export type StaticEntityGroundingResult = {
  averageTerrainHeightMeters: number;
  effectiveHeightMeters: number;
  maxHeightDeltaMeters: number;
  scaledYOffsetMeters: number;
  sceneY: number;
  valid: boolean;
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
}) => instancingEligible && instancedRuntimeAvailable && !entityEditEnabled;

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
  const grounding = computeScaledGroundingResult({
    anchorX: entity.position.x,
    anchorZ: entity.position.z,
    footprintDepthMeters: assetVersion.footprint.depthMeters,
    footprintWidthMeters: assetVersion.footprint.widthMeters,
    maxHeightDeltaMeters: assetVersion.maxHeightDeltaMeters,
    placementScale: entity.scale,
    sampleHeight: point =>
      terrain.sampleHeightAtWorld(point.x * sceneScale, point.z * sceneScale),
    yawDegrees: entity.rotation.yaw,
    yOffsetMeters: entity.yOffset
  });

  if (!grounding) {
    return null;
  }

  const sceneY =
    grounding.averageTerrainHeightMeters +
    grounding.scaledYOffsetMeters * sceneScale;

  return {
    averageTerrainHeightMeters: grounding.averageTerrainHeightMeters,
    effectiveHeightMeters: grounding.effectiveHeightMeters,
    maxHeightDeltaMeters: grounding.maxHeightDeltaMeters,
    scaledYOffsetMeters: grounding.scaledYOffsetMeters,
    sceneY,
    valid: grounding.valid
  };
};
