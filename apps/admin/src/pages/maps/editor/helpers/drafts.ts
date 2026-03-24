import type { SourcePolygon, WorldBounds } from 'carrier-contracts/types';

import {
  DEFAULT_CONTROL_POINT,
  DEFAULT_SOURCE_POLYGON_PARAMS,
  mergeWorldBounds
} from '.';
import type {
  ControlPointDraft,
  ControlPointLike,
  DerivedIslandLike,
  IslandDraft,
  PolygonDraft,
  StaticEntityDraft,
  StaticEntityLike,
  SourcePolygonLike
} from './types';

export const createPolygonDraft = (
  polygon?: SourcePolygonLike
): PolygonDraft => ({
  id: polygon?.id,
  kind: polygon ? 'edit' : 'create',
  params: polygon?.params ?? { ...DEFAULT_SOURCE_POLYGON_PARAMS },
  selectedVertexIndex: null,
  vertices: polygon?.vertices.map(vertex => ({ ...vertex })) ?? []
});

export const createControlPointDraft = (
  point?: ControlPointLike
): ControlPointDraft => ({
  elevationMeters:
    point?.elevationMeters ?? DEFAULT_CONTROL_POINT.elevationMeters,
  id: point?.id,
  influenceMeters:
    point?.influenceMeters ?? DEFAULT_CONTROL_POINT.influenceMeters,
  kind: point ? 'edit' : 'create',
  strength: point?.strength ?? DEFAULT_CONTROL_POINT.strength,
  type: point?.type ?? DEFAULT_CONTROL_POINT.type,
  x: point?.x ?? 0,
  z: point?.z ?? 0
});

export const createIslandDraft = (island: DerivedIslandLike): IslandDraft => ({
  defaultFaction: island.defaultFaction ?? '',
  defaultOwner: island.defaultOwner ?? '',
  id: island.id,
  name: island.name ?? ''
});

export const createStaticEntityDraft = (
  entity: StaticEntityLike
): StaticEntityDraft => ({
  archetypeId: entity.archetypeId,
  id: entity.id,
  kind: 'edit',
  label: entity.label ?? '',
  scale: entity.scale,
  state: entity.state,
  x: entity.position.x,
  yOffset: entity.yOffset,
  yaw: entity.rotation.yaw,
  z: entity.position.z
});

export const isDraftDirty = (
  draft: PolygonDraft,
  polygon: Pick<SourcePolygon, 'params' | 'vertices'> | null
) => {
  if (!polygon) {
    return draft.vertices.length > 0;
  }

  return (
    JSON.stringify(draft.vertices) !== JSON.stringify(polygon.vertices) ||
    JSON.stringify(draft.params) !== JSON.stringify(polygon.params)
  );
};

export const isStaticEntityDraftDirty = (
  draft: StaticEntityDraft,
  entity: StaticEntityLike | null
) => {
  if (!entity) {
    return false;
  }

  return (
    draft.archetypeId !== entity.archetypeId ||
    draft.label !== (entity.label ?? '') ||
    draft.scale !== entity.scale ||
    draft.state !== entity.state ||
    draft.x !== entity.position.x ||
    draft.yOffset !== entity.yOffset ||
    draft.yaw !== entity.rotation.yaw ||
    draft.z !== entity.position.z
  );
};

export const boundsFromPolygons = (
  polygons: readonly Pick<SourcePolygon, 'bbox'>[]
) =>
  polygons.reduce<WorldBounds | null>(
    (bounds, polygon) => mergeWorldBounds(bounds, polygon.bbox),
    null
  );

export const getBoundsCenter = (
  bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
) => ({
  x: (bounds.minX + bounds.maxX) / 2,
  z: (bounds.minZ + bounds.maxZ) / 2
});

export const expandBounds = (
  bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>,
  amount: number
): WorldBounds => ({
  maxX: bounds.maxX + amount,
  maxZ: bounds.maxZ + amount,
  minX: bounds.minX - amount,
  minZ: bounds.minZ - amount
});

export const translateWorldPoint = (
  point: Pick<{ x: number; z: number }, 'x' | 'z'>,
  delta: Pick<{ x: number; z: number }, 'x' | 'z'>
) => ({
  x: point.x + delta.x,
  z: point.z + delta.z
});

export const translatePolygonDraft = (
  draft: PolygonDraft,
  delta: Pick<{ x: number; z: number }, 'x' | 'z'>
): PolygonDraft => ({
  ...draft,
  vertices: draft.vertices.map(vertex => translateWorldPoint(vertex, delta))
});

export const translateControlPointDraft = (
  draft: ControlPointDraft,
  delta: Pick<{ x: number; z: number }, 'x' | 'z'>
): ControlPointDraft => ({
  ...draft,
  x: draft.x + delta.x,
  z: draft.z + delta.z
});

export const parseNumber = (value: string, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const STOP_PROPAGATION = (event: { stopPropagation(): void }) => {
  event.stopPropagation();
};
