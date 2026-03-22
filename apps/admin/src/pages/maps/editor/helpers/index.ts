import type {
  ControlPoint,
  DerivedIsland,
  MapMetadata,
  SourcePolygonParams,
  WorldBounds,
  WorldPoint
} from 'carrier-contracts/types';

export type EditorTool =
  | 'pan'
  | 'select'
  | 'draw-polygon'
  | 'edit-vertices'
  | 'place-control-point';

export const DEFAULT_SOURCE_POLYGON_PARAMS: SourcePolygonParams = {
  maxDisplacementMeters: 12,
  noiseScaleMeters: 64,
  roughness: 0.5
};

export const DEFAULT_CONTROL_POINT = {
  elevationMeters: 0,
  influenceMeters: 100,
  strength: 1,
  type: 'plain'
} as const satisfies Pick<
  ControlPoint,
  'elevationMeters' | 'influenceMeters' | 'strength' | 'type'
>;

export const countUniqueVertices = (vertices: readonly WorldPoint[]) =>
  new Set(vertices.map(vertex => `${vertex.x}:${vertex.z}`)).size;

export const canSavePolygonDraft = (
  vertices: readonly WorldPoint[],
  params: SourcePolygonParams
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
  selectedVertexIndex: number | null
) => {
  if (selectedVertexIndex === null) {
    return false;
  }

  return countUniqueVertices(vertices) > 3;
};

export const nextOrderedSelection = (
  selection: readonly string[],
  id: string,
  additive: boolean
) => {
  if (!additive) {
    return [id];
  }

  if (selection.includes(id)) {
    return selection.filter(selectedId => selectedId !== id);
  }

  return [...selection, id];
};

export const nextIslandPolygonSelection = (
  selection: readonly string[],
  islandPolygonIds: readonly string[],
  additive: boolean
) => {
  if (!additive) {
    return [...islandPolygonIds];
  }

  const selectionSet = new Set(selection);
  const islandSet = new Set(islandPolygonIds);
  const allSelected = islandPolygonIds.every(id => selectionSet.has(id));

  if (allSelected) {
    return selection.filter(id => !islandSet.has(id));
  }

  return [
    ...selection,
    ...islandPolygonIds.filter(id => !selectionSet.has(id))
  ];
};

export const getIslandsBySelectedPolygons = <
  T extends Pick<DerivedIsland, 'id' | 'sourcePolygonIds'>
>(
  islands: readonly T[],
  selectedPolygonIds: readonly string[]
) => {
  const selectionSet = new Set(selectedPolygonIds);
  return islands.filter(
    island =>
      island.sourcePolygonIds.length > 0 &&
      island.sourcePolygonIds.every(id => selectionSet.has(id))
  );
};

export const getExactSelectedIslands = <
  T extends Pick<DerivedIsland, 'id' | 'sourcePolygonIds'>
>(
  islands: readonly T[],
  selectedPolygonIds: readonly string[]
) => {
  const selectedIslands = getIslandsBySelectedPolygons(
    islands,
    selectedPolygonIds
  );
  const selectedIslandsPolygonCount = new Set(
    selectedIslands.flatMap(island => island.sourcePolygonIds)
  ).size;

  return selectedIslandsPolygonCount === selectedPolygonIds.length
    ? selectedIslands
    : [];
};

export const mergeWorldBounds = (
  left: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null,
  right: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null
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
    minZ: Math.min(left.minZ, right.minZ)
  };
};

export const getBoundsFromPoints = (
  points: readonly Pick<WorldPoint, 'x' | 'z'>[]
): WorldBounds | null => {
  if (points.length === 0) {
    return null;
  }

  return points.reduce<WorldBounds>(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxZ: Math.max(bounds.maxZ, point.z),
      minX: Math.min(bounds.minX, point.x),
      minZ: Math.min(bounds.minZ, point.z)
    }),
    {
      maxX: points[0]!.x,
      maxZ: points[0]!.z,
      minX: points[0]!.x,
      minZ: points[0]!.z
    }
  );
};

export const pointInBounds = (
  point: Pick<WorldPoint, 'x' | 'z'>,
  bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
) =>
  point.x >= bounds.minX &&
  point.x <= bounds.maxX &&
  point.z >= bounds.minZ &&
  point.z <= bounds.maxZ;

export const pointInPolygon = (
  point: Pick<WorldPoint, 'x' | 'z'>,
  vertices: readonly Pick<WorldPoint, 'x' | 'z'>[]
) => {
  let inside = false;

  for (
    let index = 0, previous = vertices.length - 1;
    index < vertices.length;
    previous = index++
  ) {
    const current = vertices[index]!;
    const prior = vertices[previous]!;
    const intersects =
      current.z > point.z !== prior.z > point.z &&
      point.x <
        ((prior.x - current.x) * (point.z - current.z)) /
          (prior.z - current.z || Number.EPSILON) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const orientation = (
  start: Pick<WorldPoint, 'x' | 'z'>,
  middle: Pick<WorldPoint, 'x' | 'z'>,
  end: Pick<WorldPoint, 'x' | 'z'>
) =>
  (middle.z - start.z) * (end.x - middle.x) -
  (middle.x - start.x) * (end.z - middle.z);

const onSegment = (
  start: Pick<WorldPoint, 'x' | 'z'>,
  point: Pick<WorldPoint, 'x' | 'z'>,
  end: Pick<WorldPoint, 'x' | 'z'>
) =>
  point.x <= Math.max(start.x, end.x) &&
  point.x >= Math.min(start.x, end.x) &&
  point.z <= Math.max(start.z, end.z) &&
  point.z >= Math.min(start.z, end.z);

export const segmentsIntersect = (
  firstStart: Pick<WorldPoint, 'x' | 'z'>,
  firstEnd: Pick<WorldPoint, 'x' | 'z'>,
  secondStart: Pick<WorldPoint, 'x' | 'z'>,
  secondEnd: Pick<WorldPoint, 'x' | 'z'>
) => {
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);

  if (first === 0 && onSegment(firstStart, secondStart, firstEnd)) {
    return true;
  }

  if (second === 0 && onSegment(firstStart, secondEnd, firstEnd)) {
    return true;
  }

  if (third === 0 && onSegment(secondStart, firstStart, secondEnd)) {
    return true;
  }

  if (fourth === 0 && onSegment(secondStart, firstEnd, secondEnd)) {
    return true;
  }

  return first > 0 !== second > 0 && third > 0 !== fourth > 0;
};

export const polygonIntersectsBounds = (
  vertices: readonly Pick<WorldPoint, 'x' | 'z'>[],
  bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
) => {
  const polygonBounds = getBoundsFromPoints(vertices);
  if (!polygonBounds || !boundsIntersect(polygonBounds, bounds)) {
    return false;
  }

  if (vertices.some(vertex => pointInBounds(vertex, bounds))) {
    return true;
  }

  const corners: WorldPoint[] = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ }
  ];

  if (corners.some(corner => pointInPolygon(corner, vertices))) {
    return true;
  }

  const edges = corners.map(
    (corner, index) => [corner, corners[(index + 1) % corners.length]!] as const
  );

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index]!;
    const end = vertices[(index + 1) % vertices.length]!;

    if (
      edges.some(([edgeStart, edgeEnd]) =>
        segmentsIntersect(start, end, edgeStart, edgeEnd)
      )
    ) {
      return true;
    }
  }

  return false;
};

export const getChunkWorldBounds = (
  map: MapMetadata,
  chunkX: number,
  chunkZ: number
): WorldBounds => {
  const chunkWorldSize =
    map.resolution.chunkSizeTiles * map.resolution.metersPerTile;
  const minX = chunkX * chunkWorldSize;
  const minZ = chunkZ * chunkWorldSize;

  return {
    maxX: minX + chunkWorldSize,
    maxZ: minZ + chunkWorldSize,
    minX,
    minZ
  };
};

export const boundsIntersect = (
  left: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>,
  right: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
) =>
  left.minX <= right.maxX &&
  left.maxX >= right.minX &&
  left.minZ <= right.maxZ &&
  left.maxZ >= right.minZ;

export const chunkIntersectsDirtyBounds = (
  map: MapMetadata,
  chunkX: number,
  chunkZ: number,
  dirtyBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
) => boundsIntersect(getChunkWorldBounds(map, chunkX, chunkZ), dirtyBounds);

export const getPolygonEdgeInsertPosition = (
  start: WorldPoint,
  end: WorldPoint,
  point: WorldPoint
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
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared
    )
  );

  return {
    x: start.x + dx * t,
    z: start.z + dz * t
  };
};
