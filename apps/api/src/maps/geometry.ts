import { difference, intersection, union, xor, type Geom } from 'polyclip-ts';

import type {
  BooleanOperation,
  SourcePolygon,
  SourcePolygonParams,
  WorldBounds,
  WorldPoint
} from '../../../../packages/contracts/src/schema/maps';

export type PolygonRing = WorldPoint[];

export type GeometryPolygon = PolygonRing;

export type ResolvedIslandGeometry = {
  areaMeters2: number;
  bbox: WorldBounds;
  centroid: WorldPoint;
  sourcePolygonIds: string[];
  vertices: PolygonRing;
};

const EPSILON = 1e-6;

const isSamePoint = (left: WorldPoint, right: WorldPoint) =>
  Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.z - right.z) <= EPSILON;

export const canonicalizeVertices = (vertices: readonly WorldPoint[]): PolygonRing => {
  const normalized = vertices.map(vertex => ({
    x: Number(vertex.x),
    z: Number(vertex.z)
  }));
  const deduped: PolygonRing = [];

  for (const vertex of normalized) {
    if (deduped.length === 0 || !isSamePoint(deduped[deduped.length - 1]!, vertex)) {
      deduped.push(vertex);
    }
  }

  if (deduped.length >= 2 && isSamePoint(deduped[0]!, deduped[deduped.length - 1]!)) {
    deduped.pop();
  }

  return deduped;
};

export const computePolygonBbox = (vertices: readonly WorldPoint[]): WorldBounds => {
  const canonical = canonicalizeVertices(vertices);

  if (canonical.length < 3) {
    throw new Error('A polygon requires at least 3 unique vertices');
  }

  let minX = canonical[0]!.x;
  let maxX = canonical[0]!.x;
  let minZ = canonical[0]!.z;
  let maxZ = canonical[0]!.z;

  for (const vertex of canonical) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }

  return {
    maxX,
    maxZ,
    minX,
    minZ
  };
};

export const computePolygonSignedArea = (vertices: readonly WorldPoint[]) => {
  const canonical = canonicalizeVertices(vertices);

  if (canonical.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < canonical.length; index += 1) {
    const current = canonical[index]!;
    const next = canonical[(index + 1) % canonical.length]!;
    area += current.x * next.z - next.x * current.z;
  }

  return area * 0.5;
};

export const computePolygonArea = (vertices: readonly WorldPoint[]) =>
  Math.abs(computePolygonSignedArea(vertices));

export const computePolygonCentroid = (vertices: readonly WorldPoint[]): WorldPoint => {
  const canonical = canonicalizeVertices(vertices);
  const signedArea = computePolygonSignedArea(canonical);

  if (Math.abs(signedArea) <= EPSILON) {
    const bbox = computePolygonBbox(canonical);
    return {
      x: (bbox.minX + bbox.maxX) * 0.5,
      z: (bbox.minZ + bbox.maxZ) * 0.5
    };
  }

  let cx = 0;
  let cz = 0;

  for (let index = 0; index < canonical.length; index += 1) {
    const current = canonical[index]!;
    const next = canonical[(index + 1) % canonical.length]!;
    const cross = current.x * next.z - next.x * current.z;
    cx += (current.x + next.x) * cross;
    cz += (current.z + next.z) * cross;
  }

  return {
    x: cx / (6 * signedArea),
    z: cz / (6 * signedArea)
  };
};

export const mergeBounds = (
  left: WorldBounds | null | undefined,
  right: WorldBounds | null | undefined
): WorldBounds | null => {
  if (!left) {
    return right ?? null;
  }

  if (!right) {
    return left;
  }

  return {
    maxX: Math.max(left.maxX, right.maxX),
    maxZ: Math.max(left.maxZ, right.maxZ),
    minX: Math.min(left.minX, right.minX),
    minZ: Math.min(left.minZ, right.minZ)
  };
};

export const expandWorldBounds = (bounds: WorldBounds, amount: number): WorldBounds => ({
  maxX: bounds.maxX + amount,
  maxZ: bounds.maxZ + amount,
  minX: bounds.minX - amount,
  minZ: bounds.minZ - amount
});

export const bboxesIntersect = (left: WorldBounds, right: WorldBounds) =>
  left.minX <= right.maxX &&
  left.maxX >= right.minX &&
  left.minZ <= right.maxZ &&
  left.maxZ >= right.minZ;

export const pointInPolygon = (point: WorldPoint, vertices: readonly WorldPoint[]) => {
  const canonical = canonicalizeVertices(vertices);
  let inside = false;

  for (
    let currentIndex = 0, previousIndex = canonical.length - 1;
    currentIndex < canonical.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = canonical[currentIndex]!;
    const previous = canonical[previousIndex]!;
    const intersects =
      (current.z > point.z) !== (previous.z > point.z) &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          ((previous.z - current.z) || Number.EPSILON) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const distancePointToSegment = (
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint
) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared <= EPSILON) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }

  const projection =
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared;
  const clamped = Math.min(Math.max(projection, 0), 1);
  const projectedX = start.x + dx * clamped;
  const projectedZ = start.z + dz * clamped;

  return Math.hypot(point.x - projectedX, point.z - projectedZ);
};

export const pointToPolygonEdgeDistance = (
  point: WorldPoint,
  vertices: readonly WorldPoint[]
) => {
  const canonical = canonicalizeVertices(vertices);
  let distance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < canonical.length; index += 1) {
    const current = canonical[index]!;
    const next = canonical[(index + 1) % canonical.length]!;
    distance = Math.min(distance, distancePointToSegment(point, current, next));
  }

  return distance;
};

const toPolyclipRing = (vertices: readonly WorldPoint[]) =>
  canonicalizeVertices(vertices).map(vertex => [vertex.x, vertex.z] as [number, number]);

const toPolyclipPolygon = (vertices: readonly WorldPoint[]): Geom => [toPolyclipRing(vertices)];

const fromPolyclipRing = (ring: readonly [number, number][]): PolygonRing =>
  canonicalizeVertices(ring.map(([x, z]) => ({ x, z })));

const geometryToPolygons = (geometry: Geom): PolygonRing[] => {
  if (!Array.isArray(geometry) || geometry.length === 0) {
    return [];
  }

  const first = geometry[0];

  if (!Array.isArray(first) || first.length === 0) {
    return [];
  }

  if (typeof first[0] === 'number') {
    return [fromPolyclipRing(geometry as [number, number][])];
  }

  return (geometry as Array<Array<[number, number]>>).map(polygon => fromPolyclipRing(polygon[0]!));
};

const assertHoleFreePolygons = (geometry: Geom) => {
  const polygons = Array.isArray(geometry) ? geometry : [];

  for (const polygon of polygons as Array<Array<[number, number][]>>) {
    if (polygon.length > 1) {
      throw new Error('Boolean operation produced polygon holes');
    }
  }
};

const normalizeBooleanResult = (geometry: Geom) => {
  assertHoleFreePolygons(geometry);
  const polygons = geometryToPolygons(geometry);

  return polygons.filter(vertices => computePolygonArea(vertices) > EPSILON);
};

export const intersectPolygons = (
  left: readonly WorldPoint[],
  right: readonly WorldPoint[]
) => normalizeBooleanResult(intersection(toPolyclipPolygon(left), toPolyclipPolygon(right)));

export const unionPolygons = (polygons: readonly (readonly WorldPoint[])[]) => {
  if (polygons.length === 0) {
    return [];
  }

  const [first, ...rest] = polygons;
  return normalizeBooleanResult(
    union(
      toPolyclipPolygon(first!),
      ...rest.map(polygon => toPolyclipPolygon(polygon))
    )
  );
};

export const applyBooleanOperationToPolygons = (
  operation: BooleanOperation,
  polygons: readonly (readonly WorldPoint[])[]
) => {
  if (polygons.length === 0) {
    return [];
  }

  const [first, ...rest] = polygons;
  const operands = rest.map(polygon => toPolyclipPolygon(polygon));

  switch (operation) {
    case 'difference':
      return normalizeBooleanResult(difference(toPolyclipPolygon(first!), ...operands));
    case 'intersection':
      return normalizeBooleanResult(
        intersection(toPolyclipPolygon(first!), ...operands)
      );
    case 'union':
      return normalizeBooleanResult(union(toPolyclipPolygon(first!), ...operands));
    case 'xor':
      return normalizeBooleanResult(xor(toPolyclipPolygon(first!), ...operands));
    default: {
      const exhaustiveCheck: never = operation;
      return exhaustiveCheck;
    }
  }
};

export const averageSourcePolygonParams = (
  polygons: readonly Pick<SourcePolygon, 'params'>[]
): SourcePolygonParams => {
  if (polygons.length === 0) {
    return {
      maxDisplacementMeters: 0,
      noiseScaleMeters: 128,
      roughness: 0
    };
  }

  const totals = polygons.reduce(
    (accumulator, polygon) => ({
      maxDisplacementMeters:
        accumulator.maxDisplacementMeters + polygon.params.maxDisplacementMeters,
      noiseScaleMeters: accumulator.noiseScaleMeters + polygon.params.noiseScaleMeters,
      roughness: accumulator.roughness + polygon.params.roughness
    }),
    {
      maxDisplacementMeters: 0,
      noiseScaleMeters: 0,
      roughness: 0
    }
  );

  return {
    maxDisplacementMeters: totals.maxDisplacementMeters / polygons.length,
    noiseScaleMeters: totals.noiseScaleMeters / polygons.length,
    roughness: totals.roughness / polygons.length
  };
};

export const resolveConnectedLandMasses = (
  polygons: readonly Pick<SourcePolygon, 'id' | 'vertices'>[]
): ResolvedIslandGeometry[] => {
  if (polygons.length === 0) {
    return [];
  }

  const unionedPolygons = unionPolygons(polygons.map(polygon => polygon.vertices));

  return unionedPolygons.map(vertices => {
    const bbox = computePolygonBbox(vertices);
    const sourcePolygonIds = polygons
      .filter(polygon => {
        if (!bboxesIntersect(bbox, computePolygonBbox(polygon.vertices))) {
          return false;
        }

        if (pointInPolygon(polygon.vertices[0]!, vertices)) {
          return true;
        }

        return intersectPolygons(vertices, polygon.vertices).length > 0;
      })
      .map(polygon => polygon.id);

    return {
      areaMeters2: computePolygonArea(vertices),
      bbox,
      centroid: computePolygonCentroid(vertices),
      sourcePolygonIds,
      vertices
    };
  });
};

export const boundsFromPointRadius = (
  point: Pick<WorldPoint, 'x' | 'z'>,
  radius = 0
): WorldBounds => ({
  maxX: point.x + radius,
  maxZ: point.z + radius,
  minX: point.x - radius,
  minZ: point.z - radius
});
