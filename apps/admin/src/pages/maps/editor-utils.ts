import type {
  ControlPoint,
  MapMetadata,
  SourcePolygonParams,
  WorldBounds,
  WorldPoint,
} from "carrier-contracts/types";

export type EditorTool =
  | "pan"
  | "select"
  | "draw-polygon"
  | "edit-vertices"
  | "place-control-point";

export const DEFAULT_SOURCE_POLYGON_PARAMS: SourcePolygonParams = {
  maxDisplacementMeters: 12,
  noiseScaleMeters: 64,
  roughness: 0.5,
};

export const DEFAULT_CONTROL_POINT = {
  elevationMeters: 0,
  influenceMeters: 100,
  strength: 1,
  type: "plain",
} as const satisfies Pick<
  ControlPoint,
  "elevationMeters" | "influenceMeters" | "strength" | "type"
>;

export const countUniqueVertices = (vertices: readonly WorldPoint[]) =>
  new Set(vertices.map((vertex) => `${vertex.x}:${vertex.z}`)).size;

export const canSavePolygonDraft = (
  vertices: readonly WorldPoint[],
  params: SourcePolygonParams,
) =>
  vertices.length >= 3 &&
  countUniqueVertices(vertices) >= 3 &&
  Number.isFinite(params.maxDisplacementMeters) &&
  params.maxDisplacementMeters >= 0 &&
  Number.isFinite(params.noiseScaleMeters) &&
  params.noiseScaleMeters > 0 &&
  Number.isFinite(params.roughness) &&
  params.roughness >= 0;

export const canDeleteVertex = (
  vertices: readonly WorldPoint[],
  selectedVertexIndex: number | null,
) => {
  if (selectedVertexIndex === null) {
    return false;
  }

  return countUniqueVertices(vertices) > 3;
};

export const nextOrderedSelection = (
  selection: readonly string[],
  id: string,
  additive: boolean,
) => {
  if (!additive) {
    return [id];
  }

  if (selection.includes(id)) {
    return selection.filter((selectedId) => selectedId !== id);
  }

  return [...selection, id];
};

export const mergeWorldBounds = (
  left: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ"> | null,
  right: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ"> | null,
): WorldBounds | null => {
  if (!left) {
    return right ? { ...right } : null;
  }

  if (!right) {
    return { ...left };
  }

  return {
    maxX: Math.max(left.maxX, right.maxX),
    maxZ: Math.max(left.maxZ, right.maxZ),
    minX: Math.min(left.minX, right.minX),
    minZ: Math.min(left.minZ, right.minZ),
  };
};

export const getChunkWorldBounds = (
  map: MapMetadata,
  chunkX: number,
  chunkZ: number,
): WorldBounds => {
  const chunkWorldSize =
    map.resolution.chunkSizeTiles * map.resolution.metersPerTile;
  const minX = chunkX * chunkWorldSize;
  const minZ = chunkZ * chunkWorldSize;

  return {
    maxX: minX + chunkWorldSize,
    maxZ: minZ + chunkWorldSize,
    minX,
    minZ,
  };
};

export const boundsIntersect = (
  left: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">,
  right: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">,
) =>
  left.minX <= right.maxX &&
  left.maxX >= right.minX &&
  left.minZ <= right.maxZ &&
  left.maxZ >= right.minZ;

export const chunkIntersectsDirtyBounds = (
  map: MapMetadata,
  chunkX: number,
  chunkZ: number,
  dirtyBounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">,
) => boundsIntersect(getChunkWorldBounds(map, chunkX, chunkZ), dirtyBounds);

export const getPolygonEdgeInsertPosition = (
  start: WorldPoint,
  end: WorldPoint,
  point: WorldPoint,
) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared === 0) {
    return start;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared,
    ),
  );

  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
  };
};
