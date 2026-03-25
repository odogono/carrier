import type {
  Archetype,
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity,
  StaticEntityListItem,
  WorldPoint
} from 'carrier-contracts/types';
import {
  getGroundingSamplePoints,
  sampleTerrainHeight,
  terrainGridFromRuntimeChunk,
  type GroundingSample,
  type PreviewTerrainGrid
} from 'carrier-preview';

import { getChunkWorldBounds } from '.';

export type StaticEntitySnapMode = 'free' | 'meter' | 'tile';

export type StaticEntityGroundingDiagnostics =
  | {
      averageHeight: number;
      effectiveY: number;
      maxHeightDelta: number;
      samples: GroundingSample[];
      status: 'valid' | 'warning';
      valid: boolean;
    }
  | {
      status: 'pending';
    };

export type StaticEntityOverlayGeometry = {
  corners: [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
  frontMidpoint: WorldPoint;
  handle: WorldPoint;
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const rotatePoint = (x: number, z: number, yawDegrees: number) => {
  const radians = (yawDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine
  };
};

export const getTerrainGrids = (
  chunks: Map<string, RuntimeMapChunk>,
  map: MapMetadata
) =>
  Array.from(chunks.values()).map(chunk => ({
    bounds: getChunkWorldBounds(map, chunk.chunkX, chunk.chunkZ),
    terrain: terrainGridFromRuntimeChunk(chunk, map.resolution.metersPerTile)
  }));

export type TerrainGridEntry = ReturnType<typeof getTerrainGrids>[number];

const resolveTerrainHeight = (
  terrains: Array<{
    bounds: ReturnType<typeof getChunkWorldBounds>;
    terrain: PreviewTerrainGrid;
  }>,
  point: Pick<WorldPoint, 'x' | 'z'>
) => {
  for (const terrain of terrains) {
    if (
      point.x < terrain.bounds.minX ||
      point.x > terrain.bounds.maxX ||
      point.z < terrain.bounds.minZ ||
      point.z > terrain.bounds.maxZ
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

const roundToIncrement = (value: number, increment: number) =>
  Math.round(value / increment) * increment;

export const getStaticEntitySnapMode = (event: {
  altKey?: boolean;
  shiftKey?: boolean;
}): StaticEntitySnapMode => {
  if (event.shiftKey) {
    return 'tile';
  }

  if (event.altKey) {
    return 'meter';
  }

  return 'free';
};

export const snapWorldPoint = (
  point: Pick<WorldPoint, 'x' | 'z'>,
  metersPerTile: number,
  mode: StaticEntitySnapMode
): WorldPoint => {
  if (mode === 'free') {
    return { x: point.x, z: point.z };
  }

  const increment = mode === 'tile' ? metersPerTile : 1;
  return {
    x: roundToIncrement(point.x, increment),
    z: roundToIncrement(point.z, increment)
  };
};

export const getStaticEntityOverlayGeometry = ({
  entity,
  assetVersion
}: {
  assetVersion: Pick<AssetVersion, 'footprint'>;
  entity: Pick<StaticEntity, 'position' | 'rotation'>;
}): StaticEntityOverlayGeometry => {
  const samples = getGroundingSamplePoints({
    anchorX: entity.position.x,
    anchorZ: entity.position.z,
    depthMeters: assetVersion.footprint.depthMeters,
    widthMeters: assetVersion.footprint.widthMeters,
    yawDegrees: entity.rotation.yaw
  });
  const byLabel = new Map(samples.map(sample => [sample.label, sample]));
  const frontLeft = byLabel.get('front-left');
  const frontRight = byLabel.get('front-right');
  const backRight = byLabel.get('back-right');
  const backLeft = byLabel.get('back-left');

  if (!frontLeft || !frontRight || !backRight || !backLeft) {
    throw new Error('Static entity footprint corners could not be derived');
  }

  const frontMidpoint = {
    x: (frontLeft.x + frontRight.x) * 0.5,
    z: (frontLeft.z + frontRight.z) * 0.5
  };
  const frontVector = {
    x: frontMidpoint.x - entity.position.x,
    z: frontMidpoint.z - entity.position.z
  };
  const frontLength = Math.hypot(frontVector.x, frontVector.z) || 1;
  const handleDistance =
    Math.max(assetVersion.footprint.widthMeters, assetVersion.footprint.depthMeters) *
      0.25 +
    8;

  return {
    corners: [frontLeft, frontRight, backRight, backLeft],
    frontMidpoint,
    handle: {
      x: frontMidpoint.x + (frontVector.x / frontLength) * handleDistance,
      z: frontMidpoint.z + (frontVector.z / frontLength) * handleDistance
    }
  };
};

export const getStaticEntityFacingIndicator = ({
  entity,
  lengthMeters
}: {
  entity: Pick<StaticEntity, 'position' | 'rotation'>;
  lengthMeters: number;
}) => {
  const offset = rotatePoint(0, -lengthMeters, entity.rotation.yaw);
  return {
    x: entity.position.x + offset.x,
    z: entity.position.z + offset.z
  };
};

export const getStaticEntityGroundingDiagnostics = ({
  assetVersion,
  chunks,
  entity,
  map,
  terrains: precomputedTerrains
}: {
  assetVersion: Pick<
    AssetVersion,
    'footprint' | 'maxHeightDeltaMeters'
  > | null | undefined;
  chunks: Map<string, RuntimeMapChunk>;
  entity: Pick<StaticEntity, 'position' | 'rotation' | 'yOffset'>;
  map: MapMetadata;
  terrains?: TerrainGridEntry[];
}): StaticEntityGroundingDiagnostics => {
  if (!assetVersion) {
    return { status: 'pending' };
  }

  const terrains = precomputedTerrains ?? getTerrainGrids(chunks, map);
  const samplePoints = getGroundingSamplePoints({
    anchorX: entity.position.x,
    anchorZ: entity.position.z,
    depthMeters: assetVersion.footprint.depthMeters,
    widthMeters: assetVersion.footprint.widthMeters,
    yawDegrees: entity.rotation.yaw
  });
  const samples: GroundingSample[] = [];

  for (const samplePoint of samplePoints) {
    const height = resolveTerrainHeight(terrains, samplePoint);
    if (height === null) {
      return { status: 'pending' };
    }

    samples.push({
      ...samplePoint,
      height
    });
  }

  const heights = samples.map(sample => sample.height);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const averageHeight =
    heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const maxHeightDelta = maxHeight - minHeight;
  const valid = maxHeightDelta <= assetVersion.maxHeightDeltaMeters;

  return {
    averageHeight,
    effectiveY: averageHeight + entity.yOffset,
    maxHeightDelta,
    samples,
    status: valid ? 'valid' : 'warning',
    valid
  };
};

export const buildDuplicateStaticEntityLabel = (
  label: string | null,
  existingLabels: Iterable<string | null>
) => {
  if (!label?.trim()) {
    return null;
  }

  const trimmed = label.trim();
  const existing = new Set(
    Array.from(existingLabels)
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value))
  );
  const firstCandidate = `${trimmed} Copy`;

  if (!existing.has(firstCandidate)) {
    return firstCandidate;
  }

  let suffix = 2;
  let candidate = `${trimmed} Copy ${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${trimmed} Copy ${suffix}`;
  }

  return candidate;
};

export const filterArchetypeCatalog = (
  archetypes: readonly Pick<Archetype, 'id' | 'name' | 'tags'>[],
  search: string
) => {
  const query = normalizeSearch(search);
  if (!query) {
    return [...archetypes];
  }

  return archetypes.filter(archetype =>
    [archetype.id, archetype.name, ...archetype.tags]
      .map(value => value.toLowerCase())
      .some(value => value.includes(query))
  );
};

export const filterStaticEntityItems = (
  items: readonly StaticEntityListItem[],
  search: string
) => {
  const query = normalizeSearch(search);
  if (!query) {
    return [...items];
  }

  return items.filter(item =>
    [item.entity.id, item.entity.label ?? '', item.archetype.id, item.archetype.name]
      .map(value => value.toLowerCase())
      .some(value => value.includes(query))
  );
};
