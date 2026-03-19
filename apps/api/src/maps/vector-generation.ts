import type {
  ControlPoint,
  MapMetadata,
  SourcePolygon,
  WorldBounds,
  WorldPoint
} from '../../../../packages/contracts/src/schema/maps';

import {
  classifySurfaceMaterialFromElevation,
  getSurfaceMaterialId
} from '../../../../packages/contracts/src/schema/maps';

import {
  averageSourcePolygonParams,
  boundsFromPointRadius,
  bboxesIntersect,
  canonicalizeVertices,
  computePolygonBbox,
  expandWorldBounds,
  mergeBounds,
  pointInPolygon,
  pointToPolygonEdgeDistance,
  resolveConnectedLandMasses,
  unionPolygons,
  type PolygonRing
} from './geometry';
import { MAP_WATER_LEVEL, type GeneratedMapChunkRecord } from './generation';

type DerivedIslandGeometry = {
  areaMeters2: number;
  bbox: WorldBounds;
  id: string;
  sourcePolygonIds: string[];
  vertices: PolygonRing;
};

type VectorTerrainCompileInput = {
  controlPoints: readonly ControlPoint[];
  map: MapMetadata;
  polygons: readonly SourcePolygon[];
  terrainRevision: number;
  derivedIslands: readonly DerivedIslandGeometry[];
};

type DisplacedPolygon = {
  bbox: WorldBounds;
  params: SourcePolygon['params'];
  sourcePolygonId: string;
  vertices: PolygonRing;
};

type SolveGrid = {
  height: number;
  values: Float32Array;
  width: number;
};

type CompiledIsland = {
  areaMeters2: number;
  bbox: WorldBounds;
  controlPoints: ControlPoint[];
  displacedPolygons: DisplacedPolygon[];
  id: string;
  solveBounds: WorldBounds;
  solveGrid: SolveGrid;
  sourcePolygonIds: string[];
  vertices: PolygonRing;
};

export type CompiledVectorTerrainArtifact = {
  controlPoints: readonly ControlPoint[];
  islands: readonly CompiledIsland[];
  map: MapMetadata;
  oceanFloorElevationMeters: number;
  polygons: readonly SourcePolygon[];
  terrainRevision: number;
};

const compiledArtifactCache = new Map<string, CompiledVectorTerrainArtifact>();

const OCEAN_FLOOR_ELEVATION_METERS = MAP_WATER_LEVEL - 36;
const DETAIL_OCTAVES = 4;
const MIN_SOLVE_SAMPLES = 33;
const MAX_SOLVE_SAMPLES = 129;
const SOLVE_RELAXATION = 1.65;
const SOLVE_EPSILON = 0.025;
const SOLVE_MAX_ITERATIONS = 160;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const xfnv1a = (input: string) => {
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return () => {
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0;
  };
};

const hashUnit = (input: string) => xfnv1a(input)() / 4_294_967_296;

const polygonPerimeter = (vertices: readonly WorldPoint[]) => {
  const canonical = canonicalizeVertices(vertices);
  let perimeter = 0;

  for (let index = 0; index < canonical.length; index += 1) {
    const current = canonical[index]!;
    const next = canonical[(index + 1) % canonical.length]!;
    perimeter += Math.hypot(next.x - current.x, next.z - current.z);
  }

  return perimeter;
};

const fract = (value: number) => value - Math.floor(value);

const noise1d = (seed: string, value: number) => {
  const floorValue = Math.floor(value);
  const amount = fract(value);
  const start = hashUnit(`${seed}:${floorValue}`);
  const end = hashUnit(`${seed}:${floorValue + 1}`);

  return lerp(start, end, smoothstep(0, 1, amount)) * 2 - 1;
};

const noise2d = (seed: string, x: number, z: number) => {
  const floorX = Math.floor(x);
  const floorZ = Math.floor(z);
  const tx = fract(x);
  const tz = fract(z);
  const v00 = hashUnit(`${seed}:${floorX}:${floorZ}`);
  const v10 = hashUnit(`${seed}:${floorX + 1}:${floorZ}`);
  const v01 = hashUnit(`${seed}:${floorX}:${floorZ + 1}`);
  const v11 = hashUnit(`${seed}:${floorX + 1}:${floorZ + 1}`);
  const ix0 = lerp(v00, v10, smoothstep(0, 1, tx));
  const ix1 = lerp(v01, v11, smoothstep(0, 1, tx));

  return lerp(ix0, ix1, smoothstep(0, 1, tz)) * 2 - 1;
};

const fbm2d = (
  seed: string,
  x: number,
  z: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5
) => {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += noise2d(seed, x * frequency, z * frequency) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return amplitudeSum === 0 ? 0 : total / amplitudeSum;
};

const computeArcLengths = (vertices: readonly WorldPoint[]) => {
  const canonical = canonicalizeVertices(vertices);
  const arcLengths = new Array<number>(canonical.length + 1).fill(0);

  for (let index = 0; index < canonical.length; index += 1) {
    const current = canonical[index]!;
    const next = canonical[(index + 1) % canonical.length]!;
    arcLengths[index + 1] =
      arcLengths[index]! + Math.hypot(next.x - current.x, next.z - current.z);
  }

  return {
    arcLengths,
    perimeter: arcLengths[canonical.length] ?? 0,
    vertices: canonical
  };
};

const displacePolygon = (
  polygon: SourcePolygon,
  mapSeed: string
): DisplacedPolygon => {
  const { arcLengths, perimeter, vertices } = computeArcLengths(polygon.vertices);
  const signedArea = vertices.reduce((area, current, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return area + current.x * next.z - next.x * current.z;
  }, 0);
  const outwardSign = signedArea >= 0 ? 1 : -1;
  const displaced: PolygonRing = [];
  const phase = hashUnit(`${mapSeed}:${polygon.id}:phase`) * Math.PI * 2;

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const edgeLength = Math.hypot(next.x - current.x, next.z - current.z);
    const steps = Math.max(1, Math.ceil(edgeLength / 32));

    for (let step = 0; step < steps; step += 1) {
      const amount = step / steps;
      const point = {
        x: lerp(current.x, next.x, amount),
        z: lerp(current.z, next.z, amount)
      };
      const dx = next.x - current.x;
      const dz = next.z - current.z;
      const length = Math.hypot(dx, dz) || 1;
      const outwardNormal = {
        x: (dz / length) * outwardSign,
        z: (-dx / length) * outwardSign
      };
      const traveled =
        (arcLengths[index] ?? 0) + edgeLength * amount + phase * polygon.params.noiseScaleMeters;
      const noiseValue = fbm2d(
        `${mapSeed}:${polygon.id}:coast`,
        traveled / Math.max(polygon.params.noiseScaleMeters, 1),
        perimeter / Math.max(polygon.params.noiseScaleMeters, 1),
        3
      );
      const displacement =
        noiseValue *
        polygon.params.maxDisplacementMeters *
        clamp(polygon.params.roughness, 0, 1.5);

      displaced.push({
        x: point.x + outwardNormal.x * displacement,
        z: point.z + outwardNormal.z * displacement
      });
    }
  }

  const normalizedVertices = canonicalizeVertices(displaced);

  return {
    bbox: computePolygonBbox(normalizedVertices),
    params: polygon.params,
    sourcePolygonId: polygon.id,
    vertices: normalizedVertices
  };
};


const boundsToSolveDimensions = (bounds: WorldBounds, metersPerTile: number) => {
  const spanX = Math.max(bounds.maxX - bounds.minX, metersPerTile);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, metersPerTile);
  const longestAxis = Math.max(spanX, spanZ);
  const targetSamples = Math.ceil(longestAxis / Math.max(metersPerTile * 4, 1));
  const width = clamp(targetSamples + 1, MIN_SOLVE_SAMPLES, MAX_SOLVE_SAMPLES);
  const height = clamp(
    Math.round((spanZ / spanX) * width) || width,
    MIN_SOLVE_SAMPLES,
    MAX_SOLVE_SAMPLES
  );

  return {
    height,
    width
  };
};

const worldToSolveCoordinate = (
  bounds: WorldBounds,
  width: number,
  height: number,
  point: WorldPoint
) => ({
  x: ((point.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1)) * (width - 1),
  z: ((point.z - bounds.minZ) / Math.max(bounds.maxZ - bounds.minZ, 1)) * (height - 1)
});

const solveIndex = (x: number, z: number, width: number) => z * width + x;

const buildSolveGrid = (
  map: MapMetadata,
  island: DerivedIslandGeometry,
  displacedPolygons: readonly DisplacedPolygon[],
  controlPoints: readonly ControlPoint[]
): SolveGrid => {
  const maxDisplacement = displacedPolygons.reduce(
    (maximum, polygon) => Math.max(maximum, polygon.params.maxDisplacementMeters),
    0
  );
  const bounds = expandWorldBounds(island.bbox, maxDisplacement);
  const { width, height } = boundsToSolveDimensions(bounds, map.resolution.metersPerTile);
  const values = new Float32Array(width * height).fill(MAP_WATER_LEVEL);
  const mask = new Uint8Array(width * height);
  const pinned = new Uint8Array(width * height);
  const centroidPinHeight =
    MAP_WATER_LEVEL + Math.max(28, Math.sqrt(Math.max(island.areaMeters2, 1)) * 0.055);

  for (let gridZ = 0; gridZ < height; gridZ += 1) {
    for (let gridX = 0; gridX < width; gridX += 1) {
      const world = {
        x: lerp(bounds.minX, bounds.maxX, gridX / Math.max(width - 1, 1)),
        z: lerp(bounds.minZ, bounds.maxZ, gridZ / Math.max(height - 1, 1))
      };
      const inside = displacedPolygons.some(polygon => pointInPolygon(world, polygon.vertices));

      if (!inside) {
        continue;
      }

      const index = solveIndex(gridX, gridZ, width);
      mask[index] = 1;
      const shorelineDistance = displacedPolygons.reduce((minimum, polygon) => {
        if (!bboxesIntersect(polygon.bbox, boundsFromPointRadius(world))) {
          return minimum;
        }

        return Math.min(minimum, pointToPolygonEdgeDistance(world, polygon.vertices));
      }, Number.POSITIVE_INFINITY);
      const interiorBias = smoothstep(
        map.resolution.metersPerTile * 2,
        map.resolution.metersPerTile * 14,
        shorelineDistance
      );
      values[index] = lerp(MAP_WATER_LEVEL, centroidPinHeight, interiorBias);
    }
  }

  const implicitPins = [
    {
      elevationMeters: centroidPinHeight - MAP_WATER_LEVEL,
      x: island.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / island.vertices.length,
      z: island.vertices.reduce((sum, vertex) => sum + vertex.z, 0) / island.vertices.length
    },
    ...controlPoints
  ];

  for (const controlPoint of implicitPins) {
    const coordinate = worldToSolveCoordinate(bounds, width, height, controlPoint);
    const gridX = clamp(Math.round(coordinate.x), 0, width - 1);
    const gridZ = clamp(Math.round(coordinate.z), 0, height - 1);
    const index = solveIndex(gridX, gridZ, width);

    if (mask[index] === 0) {
      continue;
    }

    pinned[index] = 1;
    values[index] = MAP_WATER_LEVEL + controlPoint.elevationMeters;
  }

  for (let iteration = 0; iteration < SOLVE_MAX_ITERATIONS; iteration += 1) {
    let maxDelta = 0;

    for (let gridZ = 1; gridZ < height - 1; gridZ += 1) {
      for (let gridX = 1; gridX < width - 1; gridX += 1) {
        const index = solveIndex(gridX, gridZ, width);

        if (mask[index] === 0 || pinned[index] === 1) {
          continue;
        }

        const left = values[solveIndex(gridX - 1, gridZ, width)]!;
        const right = values[solveIndex(gridX + 1, gridZ, width)]!;
        const top = values[solveIndex(gridX, gridZ - 1, width)]!;
        const bottom = values[solveIndex(gridX, gridZ + 1, width)]!;
        const next = (left + right + top + bottom) * 0.25;
        const relaxed = values[index]! + (next - values[index]!) * SOLVE_RELAXATION;
        maxDelta = Math.max(maxDelta, Math.abs(relaxed - values[index]!));
        values[index] = relaxed;
      }
    }

    if (maxDelta <= SOLVE_EPSILON) {
      break;
    }
  }

  return {
    height,
    values,
    width
  };
};

const bilinearSample = (
  bounds: WorldBounds,
  grid: SolveGrid,
  point: WorldPoint
) => {
  const coordinate = worldToSolveCoordinate(bounds, grid.width, grid.height, point);
  const x0 = clamp(Math.floor(coordinate.x), 0, grid.width - 1);
  const z0 = clamp(Math.floor(coordinate.z), 0, grid.height - 1);
  const x1 = clamp(x0 + 1, 0, grid.width - 1);
  const z1 = clamp(z0 + 1, 0, grid.height - 1);
  const tx = clamp(coordinate.x - x0, 0, 1);
  const tz = clamp(coordinate.z - z0, 0, 1);
  const v00 = grid.values[solveIndex(x0, z0, grid.width)]!;
  const v10 = grid.values[solveIndex(x1, z0, grid.width)]!;
  const v01 = grid.values[solveIndex(x0, z1, grid.width)]!;
  const v11 = grid.values[solveIndex(x1, z1, grid.width)]!;

  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz);
};

const compileIsland = (
  map: MapMetadata,
  island: DerivedIslandGeometry,
  polygonsById: ReadonlyMap<string, SourcePolygon>,
  allControlPoints: readonly ControlPoint[]
): CompiledIsland => {
  const islandPolygons = island.sourcePolygonIds
    .map(sourcePolygonId => polygonsById.get(sourcePolygonId))
    .filter((polygon): polygon is SourcePolygon => polygon !== undefined);
  const displacedPolygons = islandPolygons.map(polygon => displacePolygon(polygon, map.seed));
  const displacedUnion = unionPolygons(displacedPolygons.map(polygon => polygon.vertices));
  const displacedBounds = displacedUnion.reduce<WorldBounds | null>(
    (bounds, vertices) => mergeBounds(bounds, computePolygonBbox(vertices)),
    null
  );
  const islandControlPoints = allControlPoints.filter(controlPoint =>
    pointInPolygon(controlPoint, island.vertices)
  );
  const solveBounds = expandWorldBounds(
    displacedBounds ?? island.bbox,
    displacedPolygons.reduce(
      (maximum, polygon) => Math.max(maximum, polygon.params.maxDisplacementMeters),
      0
    )
  );
  const solveGrid = buildSolveGrid(map, island, displacedPolygons, islandControlPoints);

  return {
    areaMeters2: island.areaMeters2,
    bbox: displacedBounds ?? island.bbox,
    controlPoints: islandControlPoints,
    displacedPolygons,
    id: island.id,
    solveBounds,
    solveGrid,
    sourcePolygonIds: island.sourcePolygonIds,
    vertices: island.vertices
  };
};

const compileArtifact = (
  input: VectorTerrainCompileInput
): CompiledVectorTerrainArtifact => {
  const polygonsById = new Map(input.polygons.map(polygon => [polygon.id, polygon]));

  return {
    controlPoints: input.controlPoints,
    islands: input.derivedIslands.map(island =>
      compileIsland(input.map, island, polygonsById, input.controlPoints)
    ),
    map: input.map,
    oceanFloorElevationMeters: OCEAN_FLOOR_ELEVATION_METERS,
    polygons: input.polygons,
    terrainRevision: input.terrainRevision
  };
};

const cacheKeyFor = (mapId: string, terrainRevision: number) =>
  `${mapId}:${terrainRevision}`;

export const getCompiledVectorTerrainArtifact = (
  input: VectorTerrainCompileInput
) => {
  const cacheKey = cacheKeyFor(input.map.id, input.terrainRevision);
  const cached = compiledArtifactCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const derivedIslands =
    input.derivedIslands.length > 0
      ? input.derivedIslands
      : resolveConnectedLandMasses(input.polygons).map((island, index) => ({
          ...island,
          id: `derived:${input.map.id}:${index}`
        }));
  const compiled = compileArtifact({
    ...input,
    derivedIslands
  });
  compiledArtifactCache.set(cacheKey, compiled);
  return compiled;
};

export const clearCompiledVectorTerrainArtifact = (
  mapId: string,
  terrainRevision: number
) => {
  compiledArtifactCache.delete(cacheKeyFor(mapId, terrainRevision));
};

const resolvePointParams = (
  point: WorldPoint,
  displacedPolygons: readonly DisplacedPolygon[]
) => {
  const containing = displacedPolygons.filter(polygon =>
    bboxesIntersect(polygon.bbox, boundsFromPointRadius(point)) &&
    pointInPolygon(point, polygon.vertices)
  );

  return averageSourcePolygonParams(containing);
};

const applyControlPointInfluence = (
  baseHeight: number,
  point: WorldPoint,
  controlPoints: readonly ControlPoint[]
) =>
  controlPoints.reduce((height, controlPoint) => {
    const distance = Math.hypot(point.x - controlPoint.x, point.z - controlPoint.z);

    if (distance > controlPoint.influenceMeters) {
      return height;
    }

    const weight = 1 - distance / Math.max(controlPoint.influenceMeters, 1);
    const targetHeight = MAP_WATER_LEVEL + controlPoint.elevationMeters;
    const influenceStrength = clamp(controlPoint.strength, 0, 2) * weight * weight;
    return lerp(height, targetHeight, influenceStrength);
  }, baseHeight);

const sampleIslandHeight = (
  island: CompiledIsland,
  point: WorldPoint,
  mapSeed: string
) => {
  if (!bboxesIntersect(island.bbox, boundsFromPointRadius(point))) {
    return null;
  }

  const shorelineDistance = island.displacedPolygons.reduce((minimum, polygon) => {
    if (!bboxesIntersect(polygon.bbox, boundsFromPointRadius(point))) {
      return minimum;
    }

    if (!pointInPolygon(point, polygon.vertices)) {
      return minimum;
    }

    return Math.min(minimum, pointToPolygonEdgeDistance(point, polygon.vertices));
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(shorelineDistance)) {
    return null;
  }

  let height = bilinearSample(island.solveBounds, island.solveGrid, point);
  height = applyControlPointInfluence(height, point, island.controlPoints);
  const params = resolvePointParams(point, island.displacedPolygons);
  const interiorMask = smoothstep(6, 60, shorelineDistance);
  const normalizedElevation = clamp((height - MAP_WATER_LEVEL) / 96, 0, 1);
  const detailAmplitude = params.roughness * 14 * interiorMask * normalizedElevation;
  const detail = fbm2d(
    `${mapSeed}:${island.id}:detail`,
    point.x / Math.max(params.noiseScaleMeters, 1),
    point.z / Math.max(params.noiseScaleMeters, 1),
    DETAIL_OCTAVES
  );

  height += detail * detailAmplitude;
  return height;
};

export const generateVectorChunk = (
  artifact: CompiledVectorTerrainArtifact,
  chunkX: number,
  chunkZ: number,
  options: {
    mapId?: string;
    materialOriginTileX?: number;
    materialOriginTileZ?: number;
    metersPerTile?: number;
    originTileX?: number;
    originTileZ?: number;
    tileHeight?: number;
    tileWidth?: number;
    worldOriginX?: number;
    worldOriginZ?: number;
  } = {}
): GeneratedMapChunkRecord => {
  const {
    chunkSizeTiles,
    metersPerTile: mapMetersPerTile
  } = artifact.map.resolution;
  const metersPerTile = options.metersPerTile ?? mapMetersPerTile;
  const originTileX = options.originTileX ?? chunkX * chunkSizeTiles;
  const originTileZ = options.originTileZ ?? chunkZ * chunkSizeTiles;
  const tileWidth = options.tileWidth ?? chunkSizeTiles;
  const tileHeight = options.tileHeight ?? chunkSizeTiles;
  const samplesWide = tileWidth + 1;
  const samplesHigh = tileHeight + 1;
  const heights = new Float32Array(samplesWide * samplesHigh);
  const materialOriginTileX = options.materialOriginTileX ?? originTileX;
  const materialOriginTileZ = options.materialOriginTileZ ?? originTileZ;
  const chunkWorldBounds = {
    maxX: (options.worldOriginX ?? originTileX * metersPerTile) + tileWidth * metersPerTile,
    maxZ: (options.worldOriginZ ?? originTileZ * metersPerTile) + tileHeight * metersPerTile,
    minX: options.worldOriginX ?? originTileX * metersPerTile,
    minZ: options.worldOriginZ ?? originTileZ * metersPerTile
  };
  const candidateIslands = artifact.islands.filter(island =>
    bboxesIntersect(island.bbox, chunkWorldBounds)
  );

  for (let sampleZ = 0; sampleZ < samplesHigh; sampleZ += 1) {
    for (let sampleX = 0; sampleX < samplesWide; sampleX += 1) {
      const point = {
        x: chunkWorldBounds.minX + sampleX * metersPerTile,
        z: chunkWorldBounds.minZ + sampleZ * metersPerTile
      };
      const height =
        candidateIslands
          .map(island => sampleIslandHeight(island, point, artifact.map.seed))
          .find((value): value is number => value !== null) ??
        artifact.oceanFloorElevationMeters;

      heights[sampleZ * samplesWide + sampleX] = height;
    }
  }

  return {
    chunkX,
    chunkZ,
    heights,
    mapId: options.mapId ?? artifact.map.id,
    originTileX,
    originTileZ,
    samplesHigh,
    samplesWide,
    tileHeight,
    tileWidth,
    materials: Array.from({ length: tileWidth * tileHeight }, (_, index) => {
      const localX = index % tileWidth;
      const localZ = Math.floor(index / tileWidth);
      const h00 = heights[localZ * samplesWide + localX]!;
      const h10 = heights[localZ * samplesWide + localX + 1]!;
      const h01 = heights[(localZ + 1) * samplesWide + localX]!;
      const h11 = heights[(localZ + 1) * samplesWide + localX + 1]!;
      const elevation = (h00 + h10 + h01 + h11) * 0.25;
      return getSurfaceMaterialId(
        classifySurfaceMaterialFromElevation(
          materialOriginTileX + localX,
          materialOriginTileZ + localZ,
          elevation
        )
      );
    })
  };
};
