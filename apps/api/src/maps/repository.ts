import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import type {
  ApplyBooleanOutput,
  Archetype,
  AssetVersion,
  BooleanOperation,
  ControlPoint,
  CreateMapExportInput,
  CreateMapInput,
  DerivedIsland,
  MapChunk,
  MapGenerator,
  MapMetadata,
  MapMetadataSummary,
  MapOverview,
  SourcePolygon,
  SourcePolygonParams,
  SourcePolygonStatus,
  StaticEntity,
  StaticEntityExportManifest,
  StaticEntityExportManifestEntry,
  StaticEntityArchetypeSummary,
  StaticEntityListItem,
  WorldBounds,
  WorldPoint,
  ZarchRuntimeEntity
} from 'carrier-contracts';
import {
  normalizeStaticEntityExportManifest,
  slugify
} from 'carrier-contracts';

import {
  HEIGHT_LAYER,
  buildGeneratedMapChunk,
  decodeFloat32Heights,
  deriveChunkMaterialIds,
  encodeFloat32Heights,
  encodeMaterialIds,
  getDefaultMapConfig,
  quantizeUint16Heights,
  toMapChunkResponse
} from './generation';
import {
  applyBooleanOperationToPolygons,
  averageSourcePolygonParams,
  bboxesIntersect,
  boundsFromPointRadius,
  canonicalizeVertices,
  computePolygonArea,
  computePolygonBbox,
  computePolygonCentroid,
  expandWorldBounds,
  intersectPolygons,
  mergeBounds,
  resolveConnectedLandMasses
} from './geometry';
import {
  clearCompiledVectorTerrainArtifact,
  generateVectorChunk,
  getCompiledVectorTerrainArtifact
} from './vector-generation';

type MapRow = {
  chunkSizeTiles: number;
  createdAt: string;
  extentKind: string;
  exportBoundsMaxX: number | null;
  exportBoundsMaxZ: number | null;
  exportBoundsMinX: number | null;
  exportBoundsMinZ: number | null;
  exportedAt: string | null;
  generator: string | null;
  heightTiles: number | null;
  id: string;
  kind: string;
  metersPerTile: number;
  name: string | null;
  revision: number;
  seed: string;
  staticEntityExportArchetypeCount: number | null;
  staticEntityExportEntityCount: number | null;
  staticEntityExportManifestHash: string | null;
  staticEntityExportManifestJson: string | null;
  sourceMapId: string | null;
  sourceRevision: number | null;
  terrainRevision: number;
  updatedAt: string;
  widthTiles: number | null;
  wrapX: number;
  wrapZ: number;
};

type ChunkRow = {
  chunkX: number;
  chunkZ: number;
  heights: Uint8Array;
  mapId: string;
  originTileX: number;
  originTileZ: number;
  samplesHigh: number;
  samplesWide: number;
  tileHeight: number;
  tileWidth: number;
};

type SourcePolygonRow = {
  bboxMaxX: number;
  bboxMaxZ: number;
  bboxMinX: number;
  bboxMinZ: number;
  createdAt: string;
  id: string;
  mapId: string;
  paramsJson: string;
  retiredAt: string | null;
  status: string;
  updatedAt: string;
  verticesJson: string;
};

type ControlPointRow = {
  createdAt: string;
  elevationMeters: number;
  id: string;
  influenceMeters: number;
  mapId: string;
  strength: number;
  type: string;
  updatedAt: string;
  x: number;
  z: number;
};

type DerivedIslandRow = {
  areaMeters2: number;
  bboxMaxX: number;
  bboxMaxZ: number;
  bboxMinX: number;
  bboxMinZ: number;
  createdAt: string;
  defaultFaction: string | null;
  defaultOwner: string | null;
  geometryJson: string;
  id: string;
  mapId: string;
  name: string | null;
  sourcePolygonIdsJson: string;
  updatedAt: string;
};

type AssetVersionRow = {
  collisionBoxJson: string;
  collisionClass: string;
  createdAt: string;
  diagnosticsJson: string;
  footprintJson: string;
  groundingPolicy: string;
  id: string;
  instancingEligible: number;
  mapPreviewCategory: string | null;
  maxHeightDeltaMeters: number;
  originalFileJson: string;
  runtimeFileJson: string | null;
  status: string;
  updatedAt: string;
};

type ArchetypeRow = {
  assetVersionId: string;
  category: string;
  createdAt: string;
  id: string;
  name: string;
  status: string;
  tagsJson: string;
  updatedAt: string;
};

type ZarchRuntimeEntityRow = {
  assetVersionId: string;
  createdAt: string;
  id: string;
  kind: string;
  name: string;
  renderDimensionsJson: string;
  status: string;
  updatedAt: string;
};

type StaticEntityRow = {
  archetypeId: string;
  createdAt: string;
  id: string;
  label: string | null;
  mapId: string;
  positionX: number;
  positionZ: number;
  scale: number;
  state: string;
  updatedAt: string;
  yOffset: number;
  yaw: number;
};

type DerivedIslandGeometryRecord = DerivedIsland & {
  geometry: WorldPoint[];
};

type LineageRow = {
  childIslandId: string | null;
  createdAt: string;
  id: string;
  mapId: string;
  operation: string;
  parentIslandId: string | null;
};

type MutateTerrainOptions = {
  expectedRevision: number;
  mapId: string;
};

type MutateStaticEntityOptions = {
  expectedRevision: number;
  mapId: string;
};

type CreateAssetVersionInput = Omit<AssetVersion, 'createdAt' | 'updatedAt'>;

type UpdateAssetVersionInput = {
  id: string;
  collisionBox?: AssetVersion['collisionBox'];
  collisionClass?: AssetVersion['collisionClass'];
  diagnostics?: AssetVersion['diagnostics'];
  footprint?: AssetVersion['footprint'];
  groundingPolicy?: AssetVersion['groundingPolicy'];
  instancingEligible?: AssetVersion['instancingEligible'];
  maxHeightDeltaMeters?: AssetVersion['maxHeightDeltaMeters'];
  originalFile?: AssetVersion['originalFile'];
  runtimeFile?: AssetVersion['runtimeFile'];
  status?: AssetVersion['status'];
};

type CreateArchetypeInput = Omit<Archetype, 'createdAt' | 'updatedAt'>;

type UpdateArchetypeInput = {
  category?: Archetype['category'];
  id: string;
  name?: string;
  status?: Archetype['status'];
  tags?: Archetype['tags'];
};

type ReviewAssetVersionInput = Omit<
  UpdateAssetVersionInput,
  'originalFile' | 'runtimeFile' | 'status'
>;

type CreateStaticEntityInput = Omit<
  StaticEntity,
  'createdAt' | 'updatedAt' | 'id'
> & {
  expectedRevision: number;
  id?: string;
};

type UpdateStaticEntityInput = {
  expectedRevision: number;
  mapId: string;
  id: string;
  archetypeId?: string;
  label?: string | null;
  position?: StaticEntity['position'];
  rotation?: StaticEntity['rotation'];
  scale?: number;
  state?: StaticEntity['state'];
  yOffset?: number;
};

type DeleteStaticEntityInput = {
  expectedRevision: number;
  id: string;
  mapId: string;
};

type MapRepositoryOptions = {
  dbPath?: string;
};

export type RepositoryErrorCode = 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND';

export class MapRepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ensureDatabasePath = (dbPath: string) => {
  if (dbPath === ':memory:' || dbPath.length === 0) {
    return dbPath;
  }

  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
};

const MAP_ROW_COLUMNS = `
  chunk_size_tiles AS chunkSizeTiles,
  created_at AS createdAt,
  extent_kind AS extentKind,
  export_bounds_max_x AS exportBoundsMaxX,
  export_bounds_max_z AS exportBoundsMaxZ,
  export_bounds_min_x AS exportBoundsMinX,
  export_bounds_min_z AS exportBoundsMinZ,
  exported_at AS exportedAt,
  generator,
  height_tiles AS heightTiles,
  id,
  kind,
  meters_per_tile AS metersPerTile,
  name,
  revision,
  seed,
  static_entity_export_archetype_count AS staticEntityExportArchetypeCount,
  static_entity_export_entity_count AS staticEntityExportEntityCount,
  static_entity_export_manifest_hash AS staticEntityExportManifestHash,
  static_entity_export_manifest_json AS staticEntityExportManifestJson,
  source_map_id AS sourceMapId,
  source_revision AS sourceRevision,
  terrain_revision AS terrainRevision,
  updated_at AS updatedAt,
  width_tiles AS widthTiles,
  wrap_x AS wrapX,
  wrap_z AS wrapZ
`;

const SOURCE_POLYGON_COLUMNS = `
  bbox_max_x AS bboxMaxX,
  bbox_max_z AS bboxMaxZ,
  bbox_min_x AS bboxMinX,
  bbox_min_z AS bboxMinZ,
  created_at AS createdAt,
  id,
  map_id AS mapId,
  params_json AS paramsJson,
  retired_at AS retiredAt,
  status,
  updated_at AS updatedAt,
  vertices_json AS verticesJson
`;

const CONTROL_POINT_COLUMNS = `
  created_at AS createdAt,
  elevation_meters AS elevationMeters,
  id,
  influence_meters AS influenceMeters,
  map_id AS mapId,
  strength,
  type,
  updated_at AS updatedAt,
  x,
  z
`;

const DERIVED_ISLAND_COLUMNS = `
  area_meters2 AS areaMeters2,
  bbox_max_x AS bboxMaxX,
  bbox_max_z AS bboxMaxZ,
  bbox_min_x AS bboxMinX,
  bbox_min_z AS bboxMinZ,
  created_at AS createdAt,
  default_faction AS defaultFaction,
  default_owner AS defaultOwner,
  geometry_json AS geometryJson,
  id,
  map_id AS mapId,
  name,
  source_polygon_ids_json AS sourcePolygonIdsJson,
  updated_at AS updatedAt
`;

const ASSET_VERSION_COLUMNS = `
  collision_box_json AS collisionBoxJson,
  collision_class AS collisionClass,
  created_at AS createdAt,
  diagnostics_json AS diagnosticsJson,
  footprint_json AS footprintJson,
  grounding_policy AS groundingPolicy,
  id,
  instancing_eligible AS instancingEligible,
  map_preview_category AS mapPreviewCategory,
  max_height_delta_meters AS maxHeightDeltaMeters,
  original_file_json AS originalFileJson,
  runtime_file_json AS runtimeFileJson,
  status,
  updated_at AS updatedAt
`;

const ARCHETYPE_COLUMNS = `
  asset_version_id AS assetVersionId,
  category,
  created_at AS createdAt,
  id,
  name,
  status,
  tags_json AS tagsJson,
  updated_at AS updatedAt
`;

const ZARCH_RUNTIME_ENTITY_COLUMNS = `
  asset_version_id AS assetVersionId,
  created_at AS createdAt,
  id,
  kind,
  name,
  render_dimensions_json AS renderDimensionsJson,
  status,
  updated_at AS updatedAt
`;

const STATIC_ENTITY_COLUMNS = `
  archetype_id AS archetypeId,
  created_at AS createdAt,
  id,
  label,
  map_id AS mapId,
  position_x AS positionX,
  position_z AS positionZ,
  scale,
  state,
  updated_at AS updatedAt,
  y_offset AS yOffset,
  yaw
`;

const deriveTileCountFromMeters = (meters: number, metersPerTile: number) => {
  const tiles = meters / metersPerTile;

  if (!Number.isInteger(tiles) || tiles <= 0) {
    throw new Error(
      `Map dimension ${meters}m is invalid for metersPerTile=${metersPerTile}`
    );
  }

  return tiles;
};

const deriveTileCoordinateFromMeters = (
  meters: number,
  metersPerTile: number
) => {
  const tiles = meters / metersPerTile;

  if (!Number.isInteger(tiles)) {
    throw new Error(
      `Map coordinate ${meters}m is invalid for metersPerTile=${metersPerTile}`
    );
  }

  return tiles;
};

const getChunkCount = (tileCount: number, chunkSizeTiles: number) =>
  Math.max(Math.ceil(tileCount / chunkSizeTiles), 1);

const toCanonicalChunkCoordinate = (chunk: number, chunkCount: number) =>
  ((chunk % chunkCount) + chunkCount) % chunkCount;

const rotateWorldOffset = (x: number, z: number, yawDegrees: number) => {
  const yawRadians = (yawDegrees * Math.PI) / 180;
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);

  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine
  };
};

const chunkRowToRecord = (row: ChunkRow) => ({
  ...row,
  heights: decodeFloat32Heights(row.heights)
});

const getStaticEntityExportDetail = (
  row: Pick<
    MapRow,
    | 'staticEntityExportArchetypeCount'
    | 'staticEntityExportEntityCount'
    | 'staticEntityExportManifestHash'
    | 'staticEntityExportManifestJson'
  >,
  options: { includeManifest: boolean }
) => {
  if (
    row.staticEntityExportArchetypeCount === null ||
    row.staticEntityExportEntityCount === null ||
    row.staticEntityExportManifestHash === null
  ) {
    return undefined;
  }

  const summary = {
    archetypeCount: row.staticEntityExportArchetypeCount,
    entityCount: row.staticEntityExportEntityCount,
    fullManifestHash: row.staticEntityExportManifestHash
  };

  if (!options.includeManifest || row.staticEntityExportManifestJson === null) {
    return summary;
  }

  return {
    ...summary,
    manifest: JSON.parse(row.staticEntityExportManifestJson) as StaticEntityExportManifest
  };
};

const mapRowToMetadata = (
  row: MapRow,
  options: { includeExportManifest: boolean }
): MapMetadata => {
  const resolution = {
    chunkSizeTiles: row.chunkSizeTiles,
    metersPerTile: row.metersPerTile
  };
  const exportMetadata =
    row.sourceMapId &&
    row.sourceRevision !== null &&
    row.exportedAt &&
    row.exportBoundsMinX !== null &&
    row.exportBoundsMinZ !== null &&
    row.exportBoundsMaxX !== null &&
    row.exportBoundsMaxZ !== null
      ? {
          bounds: {
            maxX: row.exportBoundsMaxX,
            maxZ: row.exportBoundsMaxZ,
            minX: row.exportBoundsMinX,
            minZ: row.exportBoundsMinZ
          },
          exportedAt: row.exportedAt,
          staticEntities: getStaticEntityExportDetail(row, {
            includeManifest: options.includeExportManifest
          }),
          sourceMapId: row.sourceMapId,
          sourceRevision: row.sourceRevision
        }
      : undefined;

  if (
    row.extentKind === 'finite' &&
    row.widthTiles !== null &&
    row.heightTiles !== null
  ) {
    return {
      createdAt: row.createdAt,
      extent: {
        heightMeters: row.heightTiles * row.metersPerTile,
        heightTiles: row.heightTiles,
        kind: 'finite' as const,
        widthMeters: row.widthTiles * row.metersPerTile,
        widthTiles: row.widthTiles,
        wrapX: row.wrapX === 1,
        wrapZ: row.wrapZ === 1
      },
      export: exportMetadata,
      generator:
        row.kind === 'wrapped-classic'
          ? (row.generator as MapMetadata['generator'])
          : undefined,
      id: row.id,
      kind: row.kind as MapMetadata['kind'],
      name: row.name,
      resolution,
      revision: row.revision,
      seed: row.seed,
      updatedAt: row.updatedAt
    };
  }

  return {
    createdAt: row.createdAt,
    extent: { kind: 'infinite' as const },
    export: exportMetadata,
    generator: undefined,
    id: row.id,
    kind: row.kind as MapMetadata['kind'],
    name: row.name,
    resolution,
    revision: row.revision,
    seed: row.seed,
    updatedAt: row.updatedAt
  };
};

const mapRowToSummaryMetadata = (row: MapRow): MapMetadataSummary =>
  mapRowToMetadata(row, {
    includeExportManifest: false
  });

const rowToBounds = (
  row:
    | Pick<SourcePolygonRow, 'bboxMinX' | 'bboxMinZ' | 'bboxMaxX' | 'bboxMaxZ'>
    | Pick<DerivedIslandRow, 'bboxMinX' | 'bboxMinZ' | 'bboxMaxX' | 'bboxMaxZ'>
) => ({
  maxX: row.bboxMaxX,
  maxZ: row.bboxMaxZ,
  minX: row.bboxMinX,
  minZ: row.bboxMinZ
});

const worldBoundsToPolygon = (bounds: WorldBounds): WorldPoint[] => [
  { x: bounds.minX, z: bounds.minZ },
  { x: bounds.maxX, z: bounds.minZ },
  { x: bounds.maxX, z: bounds.maxZ },
  { x: bounds.minX, z: bounds.maxZ }
];

const parseJson = <Value>(value: string) => JSON.parse(value) as Value;

const normalizeSqliteError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return error;
  }

  if (error.message.includes('UNIQUE constraint failed')) {
    return new MapRepositoryError('CONFLICT', error.message);
  }

  if (error.message.includes('FOREIGN KEY constraint failed')) {
    return new MapRepositoryError('BAD_REQUEST', error.message);
  }

  return error;
};

const sourcePolygonRowToModel = (row: SourcePolygonRow): SourcePolygon => ({
  bbox: rowToBounds(row),
  createdAt: row.createdAt,
  id: row.id,
  mapId: row.mapId,
  params: parseJson<SourcePolygonParams>(row.paramsJson),
  retiredAt: row.retiredAt,
  status: row.status as SourcePolygonStatus,
  updatedAt: row.updatedAt,
  vertices: parseJson<WorldPoint[]>(row.verticesJson)
});

const controlPointRowToModel = (row: ControlPointRow): ControlPoint => ({
  createdAt: row.createdAt,
  elevationMeters: row.elevationMeters,
  id: row.id,
  influenceMeters: row.influenceMeters,
  mapId: row.mapId,
  strength: row.strength,
  type: row.type as ControlPoint['type'],
  updatedAt: row.updatedAt,
  x: row.x,
  z: row.z
});

const derivedIslandRowToModel = (
  row: DerivedIslandRow
): DerivedIslandGeometryRecord => {
  const geometry = parseJson<WorldPoint[]>(row.geometryJson);

  return {
    areaMeters2: row.areaMeters2,
    bbox: rowToBounds(row),
    centroid: computePolygonCentroid(geometry),
    createdAt: row.createdAt,
    defaultFaction: row.defaultFaction,
    defaultOwner: row.defaultOwner,
    geometry,
    id: row.id,
    mapId: row.mapId,
    name: row.name,
    sourcePolygonIds: parseJson<string[]>(row.sourcePolygonIdsJson),
    updatedAt: row.updatedAt
  };
};

const toPublicDerivedIsland = (
  island: DerivedIslandGeometryRecord
): DerivedIsland => ({
  areaMeters2: island.areaMeters2,
  bbox: island.bbox,
  centroid: island.centroid,
  createdAt: island.createdAt,
  defaultFaction: island.defaultFaction,
  defaultOwner: island.defaultOwner,
  id: island.id,
  mapId: island.mapId,
  name: island.name,
  sourcePolygonIds: island.sourcePolygonIds,
  updatedAt: island.updatedAt
});

const assetVersionRowToModel = (row: AssetVersionRow): AssetVersion => ({
  collisionBox: parseJson<AssetVersion['collisionBox']>(row.collisionBoxJson),
  collisionClass: row.collisionClass,
  createdAt: row.createdAt,
  diagnostics: parseJson<AssetVersion['diagnostics']>(row.diagnosticsJson),
  footprint: parseJson<AssetVersion['footprint']>(row.footprintJson),
  groundingPolicy: row.groundingPolicy,
  id: row.id,
  instancingEligible: row.instancingEligible === 1,
  maxHeightDeltaMeters: row.maxHeightDeltaMeters,
  originalFile: parseJson<AssetVersion['originalFile']>(row.originalFileJson),
  runtimeFile: row.runtimeFileJson
    ? parseJson<AssetVersion['runtimeFile']>(row.runtimeFileJson)
    : null,
  status: row.status as AssetVersion['status'],
  updatedAt: row.updatedAt
});

const archetypeRowToModel = (row: ArchetypeRow): Archetype => ({
  assetVersionId: row.assetVersionId,
  category: row.category as Archetype['category'],
  createdAt: row.createdAt,
  id: row.id,
  name: row.name,
  status: row.status as Archetype['status'],
  tags: parseJson<Archetype['tags']>(row.tagsJson),
  updatedAt: row.updatedAt
});

const zarchRuntimeEntityRowToModel = (
  row: ZarchRuntimeEntityRow
): ZarchRuntimeEntity => ({
  assetVersionId: row.assetVersionId,
  createdAt: row.createdAt,
  id: row.id,
  kind: row.kind as ZarchRuntimeEntity['kind'],
  name: row.name,
  renderDimensions: parseJson<ZarchRuntimeEntity['renderDimensions']>(
    row.renderDimensionsJson
  ),
  status: row.status as ZarchRuntimeEntity['status'],
  updatedAt: row.updatedAt
});

const archetypeToStaticEntitySummary = (
  archetype: Archetype
): StaticEntityArchetypeSummary => ({
  assetVersionId: archetype.assetVersionId,
  category: archetype.category,
  id: archetype.id,
  name: archetype.name,
  status: archetype.status
});

const staticEntityRowToModel = (row: StaticEntityRow): StaticEntity => ({
  archetypeId: row.archetypeId,
  createdAt: row.createdAt,
  id: row.id,
  label: row.label,
  mapId: row.mapId,
  position: {
    x: row.positionX,
    z: row.positionZ
  },
  rotation: {
    yaw: row.yaw
  },
  scale: row.scale,
  state: row.state as StaticEntity['state'],
  updatedAt: row.updatedAt,
  yOffset: row.yOffset
});

const getStaticEntityFootprintBounds = (
  entity: StaticEntity,
  assetVersion: Pick<AssetVersion, 'footprint'>
): WorldBounds => {
  const halfWidth = assetVersion.footprint.widthMeters * entity.scale * 0.5;
  const halfDepth = assetVersion.footprint.depthMeters * entity.scale * 0.5;
  const corners = [
    rotateWorldOffset(-halfWidth, -halfDepth, entity.rotation.yaw),
    rotateWorldOffset(halfWidth, -halfDepth, entity.rotation.yaw),
    rotateWorldOffset(halfWidth, halfDepth, entity.rotation.yaw),
    rotateWorldOffset(-halfWidth, halfDepth, entity.rotation.yaw)
  ].map(corner => ({
    x: entity.position.x + corner.x,
    z: entity.position.z + corner.z
  }));

  return {
    maxX: Math.max(...corners.map(corner => corner.x)),
    maxZ: Math.max(...corners.map(corner => corner.z)),
    minX: Math.min(...corners.map(corner => corner.x)),
    minZ: Math.min(...corners.map(corner => corner.z))
  };
};

const assetVersionHasChanges = (
  current: AssetVersion,
  next: AssetVersion
) =>
  JSON.stringify({
    collisionBox: current.collisionBox,
    collisionClass: current.collisionClass,
    diagnostics: current.diagnostics,
    footprint: current.footprint,
    groundingPolicy: current.groundingPolicy,
    instancingEligible: current.instancingEligible,
    maxHeightDeltaMeters: current.maxHeightDeltaMeters,
    originalFile: current.originalFile,
    runtimeFile: current.runtimeFile,
    status: current.status
  }) !==
  JSON.stringify({
    collisionBox: next.collisionBox,
    collisionClass: next.collisionClass,
    diagnostics: next.diagnostics,
    footprint: next.footprint,
    groundingPolicy: next.groundingPolicy,
    instancingEligible: next.instancingEligible,
    maxHeightDeltaMeters: next.maxHeightDeltaMeters,
    originalFile: next.originalFile,
    runtimeFile: next.runtimeFile,
    status: next.status
  });

const ensurePolygonVertices = (vertices: readonly WorldPoint[]) => {
  const canonical = canonicalizeVertices(vertices);

  if (canonical.length < 3 || computePolygonArea(canonical) <= 1e-6) {
    throw new MapRepositoryError(
      'BAD_REQUEST',
      'Source polygons must contain at least 3 non-collinear vertices'
    );
  }

  return canonical;
};

const ensureChunkBounds = (
  chunkX: number,
  chunkZ: number,
  chunkSizeTiles: number,
  metersPerTile: number
) => {
  const chunkWorldSize = chunkSizeTiles * metersPerTile;

  return {
    maxX: (chunkX + 1) * chunkWorldSize,
    maxZ: (chunkZ + 1) * chunkWorldSize,
    minX: chunkX * chunkWorldSize,
    minZ: chunkZ * chunkWorldSize
  };
};

export class MapRepository {
  readonly db: Database;

  constructor(options: MapRepositoryOptions = {}) {
    this.db = new Database(
      ensureDatabasePath(
        options.dbPath ?? process.env.API_DB_PATH ?? '.data/carrier.sqlite'
      )
    );
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private runInTransaction<Value>(fn: () => Value): Value {
    this.db.exec('BEGIN IMMEDIATE');

    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private findMapRow(id: string) {
    return this.db
      .query<MapRow, [string]>(
        `
        SELECT ${MAP_ROW_COLUMNS}
        FROM maps
        WHERE id = ?
      `
      )
      .get(id);
  }

  private getMapRowOrThrow(id: string) {
    const row = this.findMapRow(id);

    if (!row) {
      throw new MapRepositoryError('NOT_FOUND', `Map ${id} was not found`);
    }

    return row;
  }

  private ensureInfiniteVectorMapRow(id: string) {
    const row = this.getMapRowOrThrow(id);

    if (row.kind !== 'infinite-vector') {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Map ${id} is not an infinite-vector map`
      );
    }

    return row;
  }

  private ensureExportedMapRow(id: string) {
    const row = this.getMapRowOrThrow(id);

    if (
      row.sourceMapId === null ||
      row.sourceRevision === null ||
      row.exportedAt === null
    ) {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Map ${id} is not an exported slice`
      );
    }

    return row;
  }

  private assertExpectedRevision(row: MapRow, expectedRevision: number) {
    if (row.revision !== expectedRevision) {
      throw new MapRepositoryError(
        'CONFLICT',
        `Expected revision ${expectedRevision} but found ${row.revision}`
      );
    }
  }

  private getChunkRow(
    mapId: string,
    chunkX: number,
    chunkZ: number
  ): ChunkRow | null {
    return this.db
      .query<ChunkRow, [string, number, number]>(
        `
        SELECT
          chunk_x AS chunkX,
          chunk_z AS chunkZ,
          heights,
          map_id AS mapId,
          origin_tile_x AS originTileX,
          origin_tile_z AS originTileZ,
          samples_high AS samplesHigh,
          samples_wide AS samplesWide,
          tile_height AS tileHeight,
          tile_width AS tileWidth
        FROM map_chunks
        WHERE map_id = ? AND chunk_x = ? AND chunk_z = ?
      `
      )
      .get(mapId, chunkX, chunkZ);
  }

  private resolveStoredFiniteChunkRow(
    row: MapRow,
    requestedChunkX: number,
    requestedChunkZ: number
  ) {
    if (row.widthTiles === null || row.heightTiles === null) {
      return null;
    }

    const chunkCountX = getChunkCount(row.widthTiles, row.chunkSizeTiles);
    const chunkCountZ = getChunkCount(row.heightTiles, row.chunkSizeTiles);
    const wrapped = row.wrapX === 1 && row.wrapZ === 1;

    if (!wrapped) {
      if (
        requestedChunkX < 0 ||
        requestedChunkZ < 0 ||
        requestedChunkX >= chunkCountX ||
        requestedChunkZ >= chunkCountZ
      ) {
        return null;
      }

      return this.getChunkRow(row.id, requestedChunkX, requestedChunkZ);
    }

    const canonicalChunkX = toCanonicalChunkCoordinate(
      requestedChunkX,
      chunkCountX
    );
    const canonicalChunkZ = toCanonicalChunkCoordinate(
      requestedChunkZ,
      chunkCountZ
    );

    return this.getChunkRow(row.id, canonicalChunkX, canonicalChunkZ);
  }

  private listSourcePolygonRows(
    mapId: string,
    status?: SourcePolygonStatus
  ): SourcePolygonRow[] {
    return status
      ? this.db
          .query<SourcePolygonRow, [string, string]>(
            `
            SELECT ${SOURCE_POLYGON_COLUMNS}
            FROM map_source_polygons
            WHERE map_id = ? AND status = ?
            ORDER BY created_at ASC, id ASC
          `
          )
          .all(mapId, status)
      : this.db
          .query<SourcePolygonRow, [string]>(
            `
            SELECT ${SOURCE_POLYGON_COLUMNS}
            FROM map_source_polygons
            WHERE map_id = ?
            ORDER BY created_at ASC, id ASC
          `
          )
          .all(mapId);
  }

  private getSourcePolygonRow(
    mapId: string,
    id: string
  ): SourcePolygonRow | null {
    return this.db
      .query<SourcePolygonRow, [string, string]>(
        `
        SELECT ${SOURCE_POLYGON_COLUMNS}
        FROM map_source_polygons
        WHERE map_id = ? AND id = ?
      `
      )
      .get(mapId, id);
  }

  private getSourcePolygonRowOrThrow(
    mapId: string,
    id: string,
    status: SourcePolygonStatus | 'any' = 'any'
  ) {
    const row = this.getSourcePolygonRow(mapId, id);

    if (!row || (status !== 'any' && row.status !== status)) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Source polygon ${id} was not found for map ${mapId}`
      );
    }

    return row;
  }

  private listControlPointRows(mapId: string): ControlPointRow[] {
    return this.db
      .query<ControlPointRow, [string]>(
        `
        SELECT ${CONTROL_POINT_COLUMNS}
        FROM map_control_points
        WHERE map_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(mapId);
  }

  private getControlPointRow(mapId: string, id: string) {
    return this.db
      .query<ControlPointRow, [string, string]>(
        `
        SELECT ${CONTROL_POINT_COLUMNS}
        FROM map_control_points
        WHERE map_id = ? AND id = ?
      `
      )
      .get(mapId, id);
  }

  private getControlPointRowOrThrow(mapId: string, id: string) {
    const row = this.getControlPointRow(mapId, id);

    if (!row) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Control point ${id} was not found for map ${mapId}`
      );
    }

    return row;
  }

  private listDerivedIslandRows(mapId: string): DerivedIslandRow[] {
    return this.db
      .query<DerivedIslandRow, [string]>(
        `
        SELECT ${DERIVED_ISLAND_COLUMNS}
        FROM map_derived_islands
        WHERE map_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(mapId);
  }

  private getDerivedIslandRow(mapId: string, id: string) {
    return this.db
      .query<DerivedIslandRow, [string, string]>(
        `
        SELECT ${DERIVED_ISLAND_COLUMNS}
        FROM map_derived_islands
        WHERE map_id = ? AND id = ?
      `
      )
      .get(mapId, id);
  }

  private getDerivedIslandRowOrThrow(mapId: string, id: string) {
    const row = this.getDerivedIslandRow(mapId, id);

    if (!row) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Derived island ${id} was not found for map ${mapId}`
      );
    }

    return row;
  }

  private listAssetVersionRows(
    status?: AssetVersion['status']
  ): AssetVersionRow[] {
    return status
      ? this.db
          .query<AssetVersionRow, [string]>(
            `
            SELECT ${ASSET_VERSION_COLUMNS}
            FROM asset_versions
            WHERE status = ?
            ORDER BY created_at ASC, id ASC
          `
          )
          .all(status)
      : this.db
          .query<AssetVersionRow, []>(
            `
            SELECT ${ASSET_VERSION_COLUMNS}
            FROM asset_versions
            ORDER BY created_at ASC, id ASC
          `
          )
          .all();
  }

  private getAssetVersionRow(id: string) {
    return this.db
      .query<AssetVersionRow, [string]>(
        `
        SELECT ${ASSET_VERSION_COLUMNS}
        FROM asset_versions
        WHERE id = ?
      `
      )
      .get(id);
  }

  private getAssetVersionRowOrThrow(id: string) {
    const row = this.getAssetVersionRow(id);

    if (!row) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Asset version ${id} was not found`
      );
    }

    return row;
  }

  private listZarchRuntimeEntityRows(
    status?: ZarchRuntimeEntity['status']
  ): ZarchRuntimeEntityRow[] {
    if (status) {
      return this.db
        .query<ZarchRuntimeEntityRow, [string]>(
          `
          SELECT ${ZARCH_RUNTIME_ENTITY_COLUMNS}
          FROM zarch_runtime_entities
          WHERE status = ?
          ORDER BY created_at ASC, id ASC
        `
        )
        .all(status);
    }

    return this.db
      .query<ZarchRuntimeEntityRow, []>(
        `
        SELECT ${ZARCH_RUNTIME_ENTITY_COLUMNS}
        FROM zarch_runtime_entities
        ORDER BY created_at ASC, id ASC
      `
      )
      .all();
  }

  private getZarchRuntimeEntityRow(id: string) {
    return this.db
      .query<ZarchRuntimeEntityRow, [string]>(
        `
        SELECT ${ZARCH_RUNTIME_ENTITY_COLUMNS}
        FROM zarch_runtime_entities
        WHERE id = ?
      `
      )
      .get(id);
  }

  private getZarchRuntimeEntityRowOrThrow(id: string) {
    const row = this.getZarchRuntimeEntityRow(id);

    if (!row) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Zarch runtime entity ${id} was not found`
      );
    }

    return row;
  }

  private listArchetypeRows(status?: Archetype['status']): ArchetypeRow[] {
    if (status) {
      return this.db
        .query<ArchetypeRow, [string]>(
          `
          SELECT ${ARCHETYPE_COLUMNS}
          FROM archetypes
          WHERE status = ?
          ORDER BY created_at ASC, id ASC
        `
        )
        .all(status);
    }

    return this.db
      .query<ArchetypeRow, []>(
        `
        SELECT ${ARCHETYPE_COLUMNS}
        FROM archetypes
        ORDER BY created_at ASC, id ASC
      `
      )
      .all();
  }

  private getArchetypeRow(id: string) {
    return this.db
      .query<ArchetypeRow, [string]>(
        `
        SELECT ${ARCHETYPE_COLUMNS}
        FROM archetypes
        WHERE id = ?
      `
      )
      .get(id);
  }

  private getArchetypeRowOrThrow(id: string) {
    const row = this.getArchetypeRow(id);

    if (!row) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Archetype ${id} was not found`
      );
    }

    return row;
  }

  private getPlaceableArchetypeOrThrow(id: string) {
    const archetype = archetypeRowToModel(this.getArchetypeRowOrThrow(id));

    if (archetype.status !== 'active') {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Archetype ${id} is not active and cannot be placed`
      );
    }

    return archetype;
  }

  private listStaticEntityRows(mapId: string): StaticEntityRow[] {
    return this.db
      .query<StaticEntityRow, [string]>(
        `
        SELECT ${STATIC_ENTITY_COLUMNS}
        FROM map_static_entities
        WHERE map_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(mapId);
  }

  private getStaticEntityRow(mapId: string, id: string) {
    return this.db
      .query<StaticEntityRow, [string, string]>(
        `
        SELECT ${STATIC_ENTITY_COLUMNS}
        FROM map_static_entities
        WHERE map_id = ? AND id = ?
      `
      )
      .get(mapId, id);
  }

  private getStaticEntityRowOrThrow(mapId: string, id: string) {
    const row = this.getStaticEntityRow(mapId, id);

    if (!row) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Static entity ${id} was not found for map ${mapId}`
      );
    }

    return row;
  }

  private nextStaticEntityId(mapId: string, archetypeId: string) {
    const baseId = slugify(archetypeId) || 'entity';
    const existingIds = new Set(
      this.listStaticEntityRows(mapId).map(staticEntity => staticEntity.id)
    );
    let suffix = 1;
    let candidate = `${baseId}-${suffix}`;

    while (existingIds.has(candidate)) {
      suffix += 1;
      candidate = `${baseId}-${suffix}`;
    }

    return candidate;
  }

  private listResolvedStaticEntities(mapId: string) {
    const entities = this.listStaticEntityRows(mapId).map(staticEntityRowToModel);

    if (entities.length === 0) {
      return {
        archetypesById: new Map<string, Archetype>(),
        assetVersionsById: new Map<string, AssetVersion>(),
        entities
      };
    }

    const referencedArchetypes = this.listReferencedArchetypes(mapId);
    const archetypesById = new Map(
      referencedArchetypes.map(archetype => [archetype.id, archetype])
    );
    const assetVersionsById = new Map<string, AssetVersion>();

    for (const archetype of referencedArchetypes) {
      if (!assetVersionsById.has(archetype.assetVersionId)) {
        assetVersionsById.set(
          archetype.assetVersionId,
          assetVersionRowToModel(
            this.getAssetVersionRowOrThrow(archetype.assetVersionId)
          )
        );
      }
    }

    return {
      archetypesById,
      assetVersionsById,
      entities
    };
  }

  private getStaticEntityExportManifestEntry(
    archetype: Archetype,
    assetVersion: AssetVersion
  ): StaticEntityExportManifestEntry {
    if (assetVersion.runtimeFile === null) {
      throw new MapRepositoryError(
        'CONFLICT',
        `Asset version ${assetVersion.id} is missing a runtime file for exported manifest snapshotting`
      );
    }

    return {
      archetype: {
        assetVersionId: archetype.assetVersionId,
        category: archetype.category,
        id: archetype.id,
        name: archetype.name,
        status: archetype.status,
        tags: archetype.tags
      },
      assetVersion: {
        collisionBox: assetVersion.collisionBox,
        collisionClass: assetVersion.collisionClass,
        footprint: assetVersion.footprint,
        groundingPolicy: assetVersion.groundingPolicy,
        id: assetVersion.id,
        instancingEligible: assetVersion.instancingEligible,
        maxHeightDeltaMeters: assetVersion.maxHeightDeltaMeters,
        runtimeFile: assetVersion.runtimeFile
      }
    };
  }

  private snapshotStaticEntitiesForExport(
    sourceMapId: string,
    exportMapId: string,
    bounds: WorldBounds,
    now: string
  ) {
    const { archetypesById, assetVersionsById, entities } =
      this.listResolvedStaticEntities(sourceMapId);
    const insertStaticEntity = this.db.prepare(`
      INSERT INTO map_static_entities (
        id, map_id, label, archetype_id, position_x, position_z,
        yaw, scale, y_offset, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const manifestEntriesByArchetypeId = new Map<
      string,
      StaticEntityExportManifestEntry
    >();
    let entityCount = 0;

    for (const entity of entities) {
      const archetype = archetypesById.get(entity.archetypeId);

      if (!archetype) {
        throw new MapRepositoryError(
          'NOT_FOUND',
          `Archetype ${entity.archetypeId} was not found for static entity ${entity.id}`
        );
      }

      const assetVersion = assetVersionsById.get(archetype.assetVersionId);

      if (!assetVersion) {
        throw new MapRepositoryError(
          'NOT_FOUND',
          `Asset version ${archetype.assetVersionId} was not found for archetype ${archetype.id}`
        );
      }

      if (
        !bboxesIntersect(bounds, getStaticEntityFootprintBounds(entity, assetVersion))
      ) {
        continue;
      }

      insertStaticEntity.run(
        entity.id,
        exportMapId,
        entity.label ?? null,
        entity.archetypeId,
        entity.position.x - bounds.minX,
        entity.position.z - bounds.minZ,
        entity.rotation.yaw,
        entity.scale,
        entity.yOffset,
        entity.state,
        now,
        now
      );
      entityCount += 1;

      if (!manifestEntriesByArchetypeId.has(archetype.id)) {
        manifestEntriesByArchetypeId.set(
          archetype.id,
          this.getStaticEntityExportManifestEntry(archetype, assetVersion)
        );
      }
    }

    const manifest = normalizeStaticEntityExportManifest([
      ...manifestEntriesByArchetypeId.values()
    ]);
    const manifestJson = JSON.stringify(manifest);
    const fullManifestHash = createHash('sha256')
      .update(manifestJson)
      .digest('hex');

    this.db
      .prepare(
        `
        UPDATE maps
        SET
          static_entity_export_manifest_json = ?,
          static_entity_export_manifest_hash = ?,
          static_entity_export_entity_count = ?,
          static_entity_export_archetype_count = ?
        WHERE id = ?
      `
      )
      .run(
        manifestJson,
        fullManifestHash,
        entityCount,
        manifest.length,
        exportMapId
      );
  }

  private listStaticEntitiesForChunk(
    mapRow: MapRow,
    chunkX: number,
    chunkZ: number
  ) {
    const chunkBounds = ensureChunkBounds(chunkX, chunkZ, mapRow.chunkSizeTiles, mapRow.metersPerTile);
    const { archetypesById, assetVersionsById, entities } =
      this.listResolvedStaticEntities(mapRow.id);

    return entities.filter(entity => {
      const archetype = archetypesById.get(entity.archetypeId);

      if (!archetype) {
        throw new MapRepositoryError(
          'NOT_FOUND',
          `Archetype ${entity.archetypeId} was not found for static entity ${entity.id}`
        );
      }

      const assetVersion = assetVersionsById.get(archetype.assetVersionId);

      if (!assetVersion) {
        throw new MapRepositoryError(
          'NOT_FOUND',
          `Asset version ${archetype.assetVersionId} was not found for archetype ${archetype.id}`
        );
      }

      return bboxesIntersect(
        chunkBounds,
        getStaticEntityFootprintBounds(entity, assetVersion)
      );
    });
  }

  private bumpMapRevisions(
    mapId: string,
    options: { terrainAffecting: boolean }
  ) {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        UPDATE maps
        SET
          revision = revision + 1,
          terrain_revision = terrain_revision + ?,
          updated_at = ?
        WHERE id = ?
      `
      )
      .run(options.terrainAffecting ? 1 : 0, now, mapId);

    return this.getMapRowOrThrow(mapId);
  }

  private loadVectorTerrainState(mapRow: MapRow) {
    const map = mapRowToMetadata(mapRow, {
      includeExportManifest: false
    });
    const polygons = this.listSourcePolygonRows(mapRow.id, 'active').map(
      sourcePolygonRowToModel
    );
    const controlPoints = this.listControlPointRows(mapRow.id).map(
      controlPointRowToModel
    );
    const derivedIslands = this.listDerivedIslandRows(mapRow.id).map(
      derivedIslandRowToModel
    );

    return {
      controlPoints,
      derivedIslands,
      map,
      polygons,
      terrainRevision: mapRow.terrainRevision
    };
  }

  private insertSourcePolygonRecord(
    mapId: string,
    vertices: readonly WorldPoint[],
    params: SourcePolygonParams,
    now: string,
    id = randomUUID()
  ) {
    const canonicalVertices = ensurePolygonVertices(vertices);
    const bbox = computePolygonBbox(canonicalVertices);

    this.db
      .prepare(
        `
        INSERT INTO map_source_polygons (
          id, map_id, status, vertices_json, params_json,
          bbox_min_x, bbox_min_z, bbox_max_x, bbox_max_z,
          created_at, updated_at, retired_at
        ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `
      )
      .run(
        id,
        mapId,
        JSON.stringify(canonicalVertices),
        JSON.stringify(params),
        bbox.minX,
        bbox.minZ,
        bbox.maxX,
        bbox.maxZ,
        now,
        now
      );

    return this.getSourcePolygonRowOrThrow(mapId, id, 'active');
  }

  private rebuildDerivedIslands(mapId: string, now: string) {
    const previous = this.listDerivedIslandRows(mapId).map(
      derivedIslandRowToModel
    );
    const activePolygons = this.listSourcePolygonRows(mapId, 'active').map(
      sourcePolygonRowToModel
    );
    const resolved = resolveConnectedLandMasses(activePolygons);
    const overlaps = previous.map(previousIsland =>
      resolved.map((resolvedIsland, resolvedIndex) => ({
        overlapArea: intersectPolygons(
          previousIsland.geometry,
          resolvedIsland.vertices
        ).reduce((sum, polygon) => sum + computePolygonArea(polygon), 0),
        previousId: previousIsland.id,
        resolvedIndex
      }))
    );
    const predecessorIdsByResolved = new Map<number, string[]>();
    const bestPredecessorByResolved = new Map<
      number,
      { overlapArea: number; previousId: string }
    >();
    const proposedIds = new Array<string | null>(resolved.length).fill(null);

    for (const overlapGroup of overlaps) {
      const candidates = overlapGroup
        .filter(candidate => candidate.overlapArea > 1e-6)
        .sort((left, right) => right.overlapArea - left.overlapArea);

      if (candidates.length === 0) {
        continue;
      }

      for (const candidate of candidates) {
        const predecessors =
          predecessorIdsByResolved.get(candidate.resolvedIndex) ?? [];
        predecessors.push(candidate.previousId);
        predecessorIdsByResolved.set(candidate.resolvedIndex, predecessors);

        const bestPredecessor = bestPredecessorByResolved.get(
          candidate.resolvedIndex
        );

        if (
          !bestPredecessor ||
          candidate.overlapArea > bestPredecessor.overlapArea
        ) {
          bestPredecessorByResolved.set(candidate.resolvedIndex, {
            overlapArea: candidate.overlapArea,
            previousId: candidate.previousId
          });
        }
      }
    }

    bestPredecessorByResolved.forEach((candidate, resolvedIndex) => {
      proposedIds[resolvedIndex] = candidate.previousId;
    });

    const claimedByPrevious = new Map<
      string,
      Array<{ overlapArea: number; resolvedIndex: number }>
    >();

    overlaps.forEach(overlapGroup => {
      overlapGroup
        .filter(candidate => candidate.overlapArea > 1e-6)
        .forEach(candidate => {
          const claims = claimedByPrevious.get(candidate.previousId) ?? [];
          claims.push({
            overlapArea: candidate.overlapArea,
            resolvedIndex: candidate.resolvedIndex
          });
          claimedByPrevious.set(candidate.previousId, claims);
        });
    });

    for (const [previousId, claims] of claimedByPrevious) {
      if (claims.length <= 1) {
        continue;
      }

      claims.sort((left, right) => right.overlapArea - left.overlapArea);

      claims.slice(1).forEach(claim => {
        if (proposedIds[claim.resolvedIndex] === previousId) {
          proposedIds[claim.resolvedIndex] = null;
        }
      });
    }

    const previousById = new Map(previous.map(island => [island.id, island]));
    const nextIslands = resolved.map((resolvedIsland, index) => {
      const predecessorId = proposedIds[index];
      const predecessor = predecessorId
        ? previousById.get(predecessorId)
        : undefined;
      const geometry = resolvedIsland.vertices;
      const bbox = computePolygonBbox(geometry);

      return {
        areaMeters2: resolvedIsland.areaMeters2,
        bbox,
        createdAt: predecessor?.createdAt ?? now,
        defaultFaction: predecessor?.defaultFaction ?? null,
        defaultOwner: predecessor?.defaultOwner ?? null,
        geometry,
        id: predecessor?.id ?? randomUUID(),
        mapId,
        name: predecessor?.name ?? null,
        sourcePolygonIds: resolvedIsland.sourcePolygonIds,
        updatedAt: now
      };
    });

    this.db
      .prepare('DELETE FROM map_derived_islands WHERE map_id = ?')
      .run(mapId);

    const insertDerivedIsland = this.db.prepare(`
      INSERT INTO map_derived_islands (
        id, map_id, name, default_owner, default_faction,
        bbox_min_x, bbox_min_z, bbox_max_x, bbox_max_z,
        area_meters2, geometry_json, source_polygon_ids_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const island of nextIslands) {
      insertDerivedIsland.run(
        island.id,
        island.mapId,
        island.name,
        island.defaultOwner,
        island.defaultFaction,
        island.bbox.minX,
        island.bbox.minZ,
        island.bbox.maxX,
        island.bbox.maxZ,
        island.areaMeters2,
        JSON.stringify(island.geometry),
        JSON.stringify(island.sourcePolygonIds),
        island.createdAt,
        island.updatedAt
      );
    }

    const parentIdsByChild = new Map<string, string[]>();
    const childIdsByParent = new Map<string, string[]>();

    nextIslands.forEach((island, index) => {
      const predecessorIds = predecessorIdsByResolved.get(index) ?? [];
      parentIdsByChild.set(island.id, predecessorIds);

      predecessorIds.forEach(parentId => {
        const childIds = childIdsByParent.get(parentId) ?? [];
        childIds.push(island.id);
        childIdsByParent.set(parentId, childIds);
      });
    });

    const insertLineage = this.db.prepare(`
      INSERT INTO map_derived_island_lineage (
        id, map_id, operation, parent_island_id, child_island_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    nextIslands.forEach(island => {
      const parents = parentIdsByChild.get(island.id) ?? [];

      if (parents.length === 0) {
        insertLineage.run(randomUUID(), mapId, 'create', null, island.id, now);
        return;
      }

      const operation = parents.length > 1 ? 'merge' : 'update';

      parents.forEach(parentId => {
        insertLineage.run(
          randomUUID(),
          mapId,
          operation,
          parentId,
          island.id,
          now
        );
      });
    });

    previous.forEach(island => {
      const children = childIdsByParent.get(island.id) ?? [];

      if (children.length === 0) {
        insertLineage.run(randomUUID(), mapId, 'retire', island.id, null, now);
        return;
      }

      if (children.length > 1) {
        children.forEach(childId => {
          insertLineage.run(
            randomUUID(),
            mapId,
            'split',
            island.id,
            childId,
            now
          );
        });
      }
    });

    return nextIslands.map(island =>
      toPublicDerivedIsland({
        ...island,
        centroid: computePolygonCentroid(island.geometry)
      })
    );
  }

  private computeInvalidationExpansion(
    polygons: readonly SourcePolygon[],
    controlPoints: readonly ControlPoint[],
    dirtyBounds: WorldBounds
  ) {
    const maxDisplacement = polygons.reduce((maximum, polygon) => {
      if (!bboxesIntersect(polygon.bbox, dirtyBounds)) {
        return maximum;
      }

      return Math.max(maximum, polygon.params.maxDisplacementMeters);
    }, 0);
    const maxInfluence = controlPoints.reduce((maximum, point) => {
      const bounds = boundsFromPointRadius(point, point.influenceMeters);

      if (!bboxesIntersect(bounds, dirtyBounds)) {
        return maximum;
      }

      return Math.max(maximum, point.influenceMeters);
    }, 0);

    return maxDisplacement + maxInfluence;
  }

  private getExpandedDirtyBounds(
    mapId: string,
    dirtyBounds: WorldBounds | null
  ) {
    if (!dirtyBounds) {
      return null;
    }

    const mapRow = this.getMapRowOrThrow(mapId);
    const polygons = this.listSourcePolygonRows(mapId, 'active').map(
      sourcePolygonRowToModel
    );
    const controlPoints = this.listControlPointRows(mapId).map(
      controlPointRowToModel
    );
    const expansion = this.computeInvalidationExpansion(
      polygons,
      controlPoints,
      dirtyBounds
    );
    return expandWorldBounds(dirtyBounds, expansion);
  }

  private invalidateChunks(mapId: string, dirtyBounds: WorldBounds | null) {
    const expandedBounds = this.getExpandedDirtyBounds(mapId, dirtyBounds);

    if (!expandedBounds) {
      return;
    }

    const mapRow = this.getMapRowOrThrow(mapId);
    const chunkWorldSize = mapRow.chunkSizeTiles * mapRow.metersPerTile;
    const minChunkX = Math.floor(expandedBounds.minX / chunkWorldSize);
    const maxChunkX = Math.floor(expandedBounds.maxX / chunkWorldSize);
    const minChunkZ = Math.floor(expandedBounds.minZ / chunkWorldSize);
    const maxChunkZ = Math.floor(expandedBounds.maxZ / chunkWorldSize);

    this.db
      .prepare(
        `
        DELETE FROM map_chunks
        WHERE
          map_id = ? AND
          chunk_x BETWEEN ? AND ? AND
          chunk_z BETWEEN ? AND ?
      `
      )
      .run(mapId, minChunkX, maxChunkX, minChunkZ, maxChunkZ);
  }

  private performTerrainMutation<Value>(
    options: MutateTerrainOptions,
    mutate: (
      mapRow: MapRow,
      now: string
    ) => {
      dirtyBounds: WorldBounds | null;
      result: Value;
    }
  ) {
    return this.runInTransaction(() => {
      const mapRow = this.ensureInfiniteVectorMapRow(options.mapId);
      this.assertExpectedRevision(mapRow, options.expectedRevision);
      const now = new Date().toISOString();
      const previousTerrainRevision = mapRow.terrainRevision;
      const { dirtyBounds, result } = mutate(mapRow, now);
      const updatedMapRow = this.bumpMapRevisions(options.mapId, {
        terrainAffecting: true
      });
      const expandedDirtyBounds = this.getExpandedDirtyBounds(
        options.mapId,
        dirtyBounds
      );

      this.rebuildDerivedIslands(options.mapId, now);
      this.invalidateChunks(options.mapId, dirtyBounds);
      clearCompiledVectorTerrainArtifact(
        options.mapId,
        previousTerrainRevision
      );

      return {
        dirtyBounds: expandedDirtyBounds,
        mapRevision: updatedMapRow.revision,
        result
      };
    });
  }

  private performStaticEntityMutation<Value>(
    options: MutateStaticEntityOptions,
    mutate: (mapRow: MapRow, now: string) => Value
  ) {
    return this.runInTransaction(() => {
      const mapRow = this.getMapRowOrThrow(options.mapId);
      this.assertExpectedRevision(mapRow, options.expectedRevision);
      const now = new Date().toISOString();
      const result = mutate(mapRow, now);
      const updatedMapRow = this.bumpMapRevisions(options.mapId, {
        terrainAffecting: false
      });

      return {
        mapRevision: updatedMapRow.revision,
        result
      };
    });
  }

  private buildInfiniteVectorChunkRow(
    row: MapRow,
    chunkX: number,
    chunkZ: number
  ): ChunkRow {
    const cached = this.getChunkRow(row.id, chunkX, chunkZ);

    if (cached) {
      return cached;
    }

    const terrainState = this.loadVectorTerrainState(row);
    const artifact = getCompiledVectorTerrainArtifact({
      controlPoints: terrainState.controlPoints,
      derivedIslands: terrainState.derivedIslands.map(island => ({
        areaMeters2: island.areaMeters2,
        bbox: island.bbox,
        id: island.id,
        sourcePolygonIds: island.sourcePolygonIds,
        vertices: island.geometry
      })),
      map: terrainState.map,
      polygons: terrainState.polygons,
      terrainRevision: terrainState.terrainRevision
    });
    const generated = generateVectorChunk(artifact, chunkX, chunkZ);
    const encodedHeights = encodeFloat32Heights(generated.heights);

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO map_chunks (
          map_id, chunk_x, chunk_z,
          origin_tile_x, origin_tile_z,
          tile_width, tile_height,
          samples_wide, samples_high, heights
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        row.id,
        generated.chunkX,
        generated.chunkZ,
        generated.originTileX,
        generated.originTileZ,
        generated.tileWidth,
        generated.tileHeight,
        generated.samplesWide,
        generated.samplesHigh,
        encodedHeights
      );

    return (
      this.getChunkRow(row.id, chunkX, chunkZ) ?? {
        chunkX,
        chunkZ,
        heights: encodedHeights,
        mapId: row.id,
        originTileX: generated.originTileX,
        originTileZ: generated.originTileZ,
        samplesHigh: generated.samplesHigh,
        samplesWide: generated.samplesWide,
        tileHeight: generated.tileHeight,
        tileWidth: generated.tileWidth
      }
    );
  }

  private snapshotDerivedIslandsForExport(
    sourceMapId: string,
    exportMapId: string,
    bounds: WorldBounds,
    now: string
  ) {
    const clipPolygon = worldBoundsToPolygon(bounds);
    const islands = this.listDerivedIslandRows(sourceMapId).map(
      derivedIslandRowToModel
    );
    const insertDerivedIsland = this.db.prepare(`
      INSERT INTO map_derived_islands (
        id, map_id, name, default_owner, default_faction,
        bbox_min_x, bbox_min_z, bbox_max_x, bbox_max_z,
        area_meters2, geometry_json, source_polygon_ids_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const island of islands) {
      if (!bboxesIntersect(island.bbox, bounds)) {
        continue;
      }

      const clippedFragments = intersectPolygons(island.geometry, clipPolygon);

      clippedFragments.forEach((fragment, fragmentIndex) => {
        const areaMeters2 = computePolygonArea(fragment);

        if (areaMeters2 <= 1e-6) {
          return;
        }

        const translated = canonicalizeVertices(
          fragment.map(vertex => ({
            x: vertex.x - bounds.minX,
            z: vertex.z - bounds.minZ
          }))
        );
        const bbox = computePolygonBbox(translated);

        insertDerivedIsland.run(
          `${island.id}:${fragmentIndex}`,
          exportMapId,
          island.name,
          island.defaultOwner,
          island.defaultFaction,
          bbox.minX,
          bbox.minZ,
          bbox.maxX,
          bbox.maxZ,
          areaMeters2,
          JSON.stringify(translated),
          JSON.stringify(island.sourcePolygonIds),
          now,
          now
        );
      });
    }
  }

  private createExportedVectorMap(input: CreateMapExportInput): MapMetadata {
    return this.runInTransaction(() => {
      const sourceRow = this.ensureInfiniteVectorMapRow(input.mapId);
      this.assertExpectedRevision(sourceRow, input.expectedRevision);

      let widthTiles: number;
      let heightTiles: number;
      let sourceTileOffsetX: number;
      let sourceTileOffsetZ: number;

      try {
        const widthMeters = input.bounds.maxX - input.bounds.minX;
        const heightMeters = input.bounds.maxZ - input.bounds.minZ;
        widthTiles = deriveTileCountFromMeters(
          widthMeters,
          input.metersPerTile
        );
        heightTiles = deriveTileCountFromMeters(
          heightMeters,
          input.metersPerTile
        );
        sourceTileOffsetX = deriveTileCoordinateFromMeters(
          input.bounds.minX,
          input.metersPerTile
        );
        sourceTileOffsetZ = deriveTileCoordinateFromMeters(
          input.bounds.minZ,
          input.metersPerTile
        );
      } catch (error) {
        throw new MapRepositoryError(
          'BAD_REQUEST',
          error instanceof Error ? error.message : 'Invalid export bounds'
        );
      }

      const now = new Date().toISOString();
      const id = randomUUID();
      const wrap = input.kind === 'wrapped-classic-slice';
      const row: MapRow = {
        chunkSizeTiles: input.chunkSizeTiles,
        createdAt: now,
        extentKind: 'finite',
        exportBoundsMaxX: input.bounds.maxX,
        exportBoundsMaxZ: input.bounds.maxZ,
        exportBoundsMinX: input.bounds.minX,
        exportBoundsMinZ: input.bounds.minZ,
        exportedAt: now,
        generator: null,
        heightTiles,
        id,
        kind: input.kind,
        metersPerTile: input.metersPerTile,
        name: input.name ?? null,
        revision: 0,
        seed: sourceRow.seed,
        staticEntityExportArchetypeCount: null,
        staticEntityExportEntityCount: null,
        staticEntityExportManifestHash: null,
        staticEntityExportManifestJson: null,
        sourceMapId: sourceRow.id,
        sourceRevision: sourceRow.revision,
        terrainRevision: 0,
        updatedAt: now,
        widthTiles,
        wrapX: wrap ? 1 : 0,
        wrapZ: wrap ? 1 : 0
      };

      this.db
        .prepare(
          `
        INSERT INTO maps (
          id, name, kind, extent_kind,
          width_tiles, height_tiles, wrap_x, wrap_z,
          meters_per_tile, chunk_size_tiles,
          generator, seed, revision, terrain_revision,
          source_map_id, source_revision, exported_at,
          export_bounds_min_x, export_bounds_min_z, export_bounds_max_x, export_bounds_max_z,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          row.id,
          row.name,
          row.kind,
          row.extentKind,
          row.widthTiles,
          row.heightTiles,
          row.wrapX,
          row.wrapZ,
          row.metersPerTile,
          row.chunkSizeTiles,
          row.generator,
          row.seed,
          row.revision,
          row.terrainRevision,
          row.sourceMapId,
          row.sourceRevision,
          row.exportedAt,
          row.exportBoundsMinX,
          row.exportBoundsMinZ,
          row.exportBoundsMaxX,
          row.exportBoundsMaxZ,
          row.createdAt,
          row.updatedAt
        );

      const sourceTerrainState = this.loadVectorTerrainState(sourceRow);
      const artifact = getCompiledVectorTerrainArtifact({
        controlPoints: sourceTerrainState.controlPoints,
        derivedIslands: sourceTerrainState.derivedIslands.map(island => ({
          areaMeters2: island.areaMeters2,
          bbox: island.bbox,
          id: island.id,
          sourcePolygonIds: island.sourcePolygonIds,
          vertices: island.geometry
        })),
        map: sourceTerrainState.map,
        polygons: sourceTerrainState.polygons,
        terrainRevision: sourceTerrainState.terrainRevision
      });
      const insertChunk = this.db.prepare(`
        INSERT INTO map_chunks (
          map_id, chunk_x, chunk_z,
          origin_tile_x, origin_tile_z,
          tile_width, tile_height,
          samples_wide, samples_high, heights
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const chunkCountX = getChunkCount(widthTiles, input.chunkSizeTiles);
      const chunkCountZ = getChunkCount(heightTiles, input.chunkSizeTiles);

      for (let chunkZ = 0; chunkZ < chunkCountZ; chunkZ += 1) {
        for (let chunkX = 0; chunkX < chunkCountX; chunkX += 1) {
          const originTileX = chunkX * input.chunkSizeTiles;
          const originTileZ = chunkZ * input.chunkSizeTiles;
          const tileWidth = Math.min(
            input.chunkSizeTiles,
            widthTiles - originTileX
          );
          const tileHeight = Math.min(
            input.chunkSizeTiles,
            heightTiles - originTileZ
          );
          const generated = generateVectorChunk(artifact, chunkX, chunkZ, {
            mapId: id,
            materialOriginTileX: sourceTileOffsetX + originTileX,
            materialOriginTileZ: sourceTileOffsetZ + originTileZ,
            metersPerTile: input.metersPerTile,
            originTileX,
            originTileZ,
            tileHeight,
            tileWidth,
            worldOriginX: input.bounds.minX + originTileX * input.metersPerTile,
            worldOriginZ: input.bounds.minZ + originTileZ * input.metersPerTile
          });

          insertChunk.run(
            id,
            generated.chunkX,
            generated.chunkZ,
            generated.originTileX,
            generated.originTileZ,
            generated.tileWidth,
            generated.tileHeight,
            generated.samplesWide,
            generated.samplesHigh,
            encodeFloat32Heights(generated.heights)
          );
        }
      }

      this.snapshotDerivedIslandsForExport(sourceRow.id, id, input.bounds, now);
      this.snapshotStaticEntitiesForExport(sourceRow.id, id, input.bounds, now);

      return mapRowToMetadata(this.getMapRowOrThrow(id), {
        includeExportManifest: true
      });
    });
  }

  private ensureWrappedClassicChunkRow(
    row: MapRow,
    requestedChunkX: number,
    requestedChunkZ: number
  ) {
    if (
      row.kind !== 'wrapped-classic' ||
      row.generator === null ||
      row.widthTiles === null ||
      row.heightTiles === null
    ) {
      return null;
    }

    const canonicalChunkX = toCanonicalChunkCoordinate(
      requestedChunkX,
      getChunkCount(row.widthTiles, row.chunkSizeTiles)
    );
    const canonicalChunkZ = toCanonicalChunkCoordinate(
      requestedChunkZ,
      getChunkCount(row.heightTiles, row.chunkSizeTiles)
    );
    const cached = this.getChunkRow(row.id, canonicalChunkX, canonicalChunkZ);

    if (cached) {
      return cached;
    }

    const generated = buildGeneratedMapChunk(
      {
        chunkSizeTiles: row.chunkSizeTiles,
        generator: row.generator as MapGenerator,
        heightTiles: row.heightTiles,
        id: row.id,
        metersPerTile: row.metersPerTile,
        seed: row.seed,
        widthTiles: row.widthTiles
      },
      requestedChunkX,
      requestedChunkZ
    );

    const encodedHeights = encodeFloat32Heights(generated.heights);

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO map_chunks (
          map_id, chunk_x, chunk_z,
          origin_tile_x, origin_tile_z,
          tile_width, tile_height,
          samples_wide, samples_high, heights
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        row.id,
        generated.chunkX,
        generated.chunkZ,
        generated.originTileX,
        generated.originTileZ,
        generated.tileWidth,
        generated.tileHeight,
        generated.samplesWide,
        generated.samplesHigh,
        encodedHeights
      );

    return {
      chunkX: generated.chunkX,
      chunkZ: generated.chunkZ,
      heights: encodedHeights,
      mapId: row.id,
      originTileX: generated.originTileX,
      originTileZ: generated.originTileZ,
      samplesHigh: generated.samplesHigh,
      samplesWide: generated.samplesWide,
      tileHeight: generated.tileHeight,
      tileWidth: generated.tileWidth
    };
  }

  private resolveChunkRowForMap(row: MapRow, chunkX: number, chunkZ: number) {
    if (row.kind === 'wrapped-classic') {
      return this.ensureWrappedClassicChunkRow(row, chunkX, chunkZ);
    }

    if (row.kind === 'infinite-vector') {
      return this.buildInfiniteVectorChunkRow(row, chunkX, chunkZ);
    }

    return this.resolveStoredFiniteChunkRow(row, chunkX, chunkZ);
  }

  createMap(input: CreateMapInput): MapMetadata {
    const now = new Date().toISOString();
    const defaults = getDefaultMapConfig();
    const id = randomUUID();
    const seed = input.seed ?? randomUUID();

    let row: MapRow;

    if (input.kind === 'wrapped-classic') {
      const widthTiles = deriveTileCountFromMeters(
        input.widthMeters,
        defaults.metersPerTile
      );
      const heightTiles = deriveTileCountFromMeters(
        input.heightMeters,
        defaults.metersPerTile
      );
      row = {
        chunkSizeTiles: defaults.chunkSizeTiles,
        createdAt: now,
        extentKind: 'finite',
        exportBoundsMaxX: null,
        exportBoundsMaxZ: null,
        exportBoundsMinX: null,
        exportBoundsMinZ: null,
        exportedAt: null,
        generator: input.generator,
        heightTiles,
        id,
        kind: 'wrapped-classic',
        metersPerTile: defaults.metersPerTile,
        name: input.name ?? null,
        revision: 0,
        seed,
        staticEntityExportArchetypeCount: null,
        staticEntityExportEntityCount: null,
        staticEntityExportManifestHash: null,
        staticEntityExportManifestJson: null,
        sourceMapId: null,
        sourceRevision: null,
        terrainRevision: 0,
        updatedAt: now,
        widthTiles,
        wrapX: 1,
        wrapZ: 1
      };
    } else {
      row = {
        chunkSizeTiles: defaults.chunkSizeTiles,
        createdAt: now,
        extentKind: 'infinite',
        exportBoundsMaxX: null,
        exportBoundsMaxZ: null,
        exportBoundsMinX: null,
        exportBoundsMinZ: null,
        exportedAt: null,
        generator: null,
        heightTiles: null,
        id,
        kind: 'infinite-vector',
        metersPerTile: defaults.metersPerTile,
        name: input.name ?? null,
        revision: 0,
        seed,
        staticEntityExportArchetypeCount: null,
        staticEntityExportEntityCount: null,
        staticEntityExportManifestHash: null,
        staticEntityExportManifestJson: null,
        sourceMapId: null,
        sourceRevision: null,
        terrainRevision: 0,
        updatedAt: now,
        widthTiles: null,
        wrapX: 0,
        wrapZ: 0
      };
    }

    this.db
      .prepare(
        `
      INSERT INTO maps (
        id, name, kind, extent_kind,
        width_tiles, height_tiles, wrap_x, wrap_z,
        meters_per_tile, chunk_size_tiles,
        generator, seed, revision, terrain_revision,
        source_map_id, source_revision, exported_at,
        export_bounds_min_x, export_bounds_min_z, export_bounds_max_x, export_bounds_max_z,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        row.id,
        row.name,
        row.kind,
        row.extentKind,
        row.widthTiles,
        row.heightTiles,
        row.wrapX,
        row.wrapZ,
        row.metersPerTile,
        row.chunkSizeTiles,
        row.generator,
        row.seed,
        row.revision,
        row.terrainRevision,
        row.sourceMapId,
        row.sourceRevision,
        row.exportedAt,
        row.exportBoundsMinX,
        row.exportBoundsMinZ,
        row.exportBoundsMaxX,
        row.exportBoundsMaxZ,
        row.createdAt,
        row.updatedAt
      );

    return mapRowToMetadata(row, {
      includeExportManifest: false
    });
  }

  createMapExport(input: CreateMapExportInput): MapMetadata {
    return this.createExportedVectorMap(input);
  }

  deleteMap(id: string) {
    const row = this.findMapRow(id);
    const result = this.db.prepare('DELETE FROM maps WHERE id = ?').run(id);

    if (result.changes > 0 && row) {
      clearCompiledVectorTerrainArtifact(id, row.terrainRevision);
    }

    return result.changes > 0;
  }

  getMap(id: string) {
    const row = this.findMapRow(id);
    return row
      ? mapRowToMetadata(row, {
          includeExportManifest: true
        })
      : null;
  }

  createAssetVersion(input: CreateAssetVersionInput) {
    const now = new Date().toISOString();

    try {
      this.db
        .prepare(
          `
          INSERT INTO asset_versions (
            id, status, original_file_json, runtime_file_json,
            diagnostics_json, footprint_json, collision_box_json,
            collision_class, grounding_policy, max_height_delta_meters,
            instancing_eligible, map_preview_category, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          input.id,
          input.status,
          JSON.stringify(input.originalFile),
          input.runtimeFile ? JSON.stringify(input.runtimeFile) : null,
          JSON.stringify(input.diagnostics),
          JSON.stringify(input.footprint),
          JSON.stringify(input.collisionBox),
          input.collisionClass,
          input.groundingPolicy,
          input.maxHeightDeltaMeters,
          input.instancingEligible ? 1 : 0,
          null,
          now,
          now
        );
    } catch (error) {
      throw normalizeSqliteError(error);
    }

    return assetVersionRowToModel(this.getAssetVersionRowOrThrow(input.id));
  }

  listAssetVersions(status?: AssetVersion['status']) {
    return this.listAssetVersionRows(status).map(assetVersionRowToModel);
  }

  listAssetVersionIdsByPrefix(prefix: string) {
    return this.db
      .query<{ id: string }, [string]>(
        `
        SELECT id FROM asset_versions
        WHERE id LIKE ?
        ORDER BY id ASC
      `
      )
      .all(`${prefix}%`)
      .map(row => row.id);
  }

  getAssetVersion(id: string) {
    const row = this.getAssetVersionRow(id);
    return row ? assetVersionRowToModel(row) : null;
  }

  updateAssetVersion(
    input: UpdateAssetVersionInput,
    prefetched?: AssetVersion
  ) {
    const current =
      prefetched ??
      assetVersionRowToModel(this.getAssetVersionRowOrThrow(input.id));
    const next: AssetVersion = {
      ...current,
      collisionBox: input.collisionBox ?? current.collisionBox,
      collisionClass: input.collisionClass ?? current.collisionClass,
      diagnostics: input.diagnostics ?? current.diagnostics,
      footprint: input.footprint ?? current.footprint,
      groundingPolicy: input.groundingPolicy ?? current.groundingPolicy,
      instancingEligible:
        input.instancingEligible ?? current.instancingEligible,
      maxHeightDeltaMeters:
        input.maxHeightDeltaMeters ?? current.maxHeightDeltaMeters,
      originalFile: input.originalFile ?? current.originalFile,
      runtimeFile:
        input.runtimeFile === undefined
          ? current.runtimeFile
          : input.runtimeFile,
      status: input.status ?? current.status,
      updatedAt: new Date().toISOString()
    };

    if (current.status === 'ready' && assetVersionHasChanges(current, next)) {
      throw new MapRepositoryError(
        'CONFLICT',
        `Asset version ${input.id} is ready and immutable`
      );
    }

    try {
      this.db
        .prepare(
          `
          UPDATE asset_versions
          SET
            status = ?,
            original_file_json = ?,
            runtime_file_json = ?,
            diagnostics_json = ?,
            footprint_json = ?,
            collision_box_json = ?,
            collision_class = ?,
            grounding_policy = ?,
            max_height_delta_meters = ?,
            instancing_eligible = ?,
            updated_at = ?
          WHERE id = ?
        `
        )
        .run(
          next.status,
          JSON.stringify(next.originalFile),
          next.runtimeFile ? JSON.stringify(next.runtimeFile) : null,
          JSON.stringify(next.diagnostics),
          JSON.stringify(next.footprint),
          JSON.stringify(next.collisionBox),
          next.collisionClass,
          next.groundingPolicy,
          next.maxHeightDeltaMeters,
          next.instancingEligible ? 1 : 0,
          next.updatedAt,
          input.id
        );
    } catch (error) {
      throw normalizeSqliteError(error);
    }

    return next;
  }

  reviewAssetVersion(input: ReviewAssetVersionInput) {
    const current = assetVersionRowToModel(
      this.getAssetVersionRowOrThrow(input.id)
    );

    if (current.status !== 'review') {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Asset version ${input.id} is not in review`
      );
    }

    return this.updateAssetVersion(input, current);
  }

  approveAssetVersion(id: string) {
    const current = assetVersionRowToModel(this.getAssetVersionRowOrThrow(id));

    if (current.status !== 'review') {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Asset version ${id} must be in review before approval`
      );
    }

    if (current.runtimeFile === null) {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Asset version ${id} is missing a runtime artifact`
      );
    }

    return this.updateAssetVersion({ id, status: 'ready' }, current);
  }

  listZarchRuntimeEntities(status?: ZarchRuntimeEntity['status']) {
    return this.listZarchRuntimeEntityRows(status).map(
      zarchRuntimeEntityRowToModel
    );
  }

  getZarchRuntimeEntity(id: string) {
    const row = this.getZarchRuntimeEntityRow(id);
    return row ? zarchRuntimeEntityRowToModel(row) : null;
  }

  upsertZarchRuntimeEntity(
    input: Omit<ZarchRuntimeEntity, 'createdAt' | 'updatedAt'>
  ) {
    const assetVersion = assetVersionRowToModel(
      this.getAssetVersionRowOrThrow(input.assetVersionId)
    );

    if (assetVersion.status !== 'ready' || assetVersion.runtimeFile === null) {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Asset version ${input.assetVersionId} is not ready for runtime entity binding`
      );
    }

    const existing = this.getZarchRuntimeEntity(input.id);
    const now = new Date().toISOString();

    try {
      if (existing) {
        this.db
          .prepare(
            `
            UPDATE zarch_runtime_entities
            SET
              name = ?,
              kind = ?,
              asset_version_id = ?,
              render_dimensions_json = ?,
              status = ?,
              updated_at = ?
            WHERE id = ?
          `
          )
          .run(
            input.name,
            input.kind,
            input.assetVersionId,
            JSON.stringify(input.renderDimensions),
            input.status,
            now,
            input.id
          );
      } else {
        this.db
          .prepare(
            `
            INSERT INTO zarch_runtime_entities (
              id, name, kind, asset_version_id, render_dimensions_json,
              status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            input.id,
            input.name,
            input.kind,
            input.assetVersionId,
            JSON.stringify(input.renderDimensions),
            input.status,
            now,
            now
          );
      }
    } catch (error) {
      throw normalizeSqliteError(error);
    }

    return zarchRuntimeEntityRowToModel(
      this.getZarchRuntimeEntityRowOrThrow(input.id)
    );
  }

  createArchetype(input: CreateArchetypeInput) {
    const now = new Date().toISOString();
    const assetVersion = assetVersionRowToModel(
      this.getAssetVersionRowOrThrow(input.assetVersionId)
    );

    if (assetVersion.status !== 'ready') {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        `Asset version ${input.assetVersionId} is not ready for archetype creation`
      );
    }

    try {
      this.db
        .prepare(
          `
          INSERT INTO archetypes (
            id, name, category, tags_json, asset_version_id,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          input.id,
          input.name,
          input.category,
          JSON.stringify(input.tags),
          input.assetVersionId,
          input.status,
          now,
          now
        );
    } catch (error) {
      throw normalizeSqliteError(error);
    }

    return archetypeRowToModel(this.getArchetypeRowOrThrow(input.id));
  }

  listArchetypes(status?: Archetype['status']) {
    return this.listArchetypeRows(status).map(archetypeRowToModel);
  }

  getArchetype(id: string) {
    const row = this.getArchetypeRow(id);

    return row ? archetypeRowToModel(row) : null;
  }

  updateArchetype(input: UpdateArchetypeInput) {
    const current = archetypeRowToModel(this.getArchetypeRowOrThrow(input.id));
    const next = {
      category: input.category ?? current.category,
      name: input.name ?? current.name,
      status: input.status ?? current.status,
      tags: input.tags ?? current.tags
    };
    const now = new Date().toISOString();

    try {
      this.db
        .prepare(
          `
          UPDATE archetypes
          SET
            name = ?,
            category = ?,
            tags_json = ?,
            status = ?,
            updated_at = ?
          WHERE id = ?
        `
        )
        .run(
          next.name,
          next.category,
          JSON.stringify(next.tags),
          next.status,
          now,
          input.id
        );
    } catch (error) {
      throw normalizeSqliteError(error);
    }

    return archetypeRowToModel(this.getArchetypeRowOrThrow(input.id));
  }

  listReferencedArchetypes(mapId: string) {
    if (!this.findMapRow(mapId)) {
      throw new MapRepositoryError('NOT_FOUND', `Map ${mapId} was not found`);
    }

    return this.db
      .query<ArchetypeRow, [string]>(
        `
        SELECT DISTINCT ${ARCHETYPE_COLUMNS}
        FROM archetypes
        WHERE id IN (
          SELECT archetype_id FROM map_static_entities WHERE map_id = ?
        )
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(mapId)
      .map(archetypeRowToModel);
  }

  getMapChunk(mapId: string, chunkX: number, chunkZ: number): MapChunk | null {
    const mapRow = this.findMapRow(mapId);

    if (!mapRow) {
      return null;
    }

    const row = this.resolveChunkRowForMap(mapRow, chunkX, chunkZ);

    if (!row) {
      return null;
    }

    const staticEntities = this.listStaticEntitiesForChunk(
      mapRow,
      row.chunkX,
      row.chunkZ
    );

    return toMapChunkResponse({
      ...chunkRowToRecord(row),
      staticEntities
    });
  }

  getMapChunkBinary(mapId: string, chunkX: number, chunkZ: number) {
    const mapRow = this.findMapRow(mapId);

    if (!mapRow) {
      return null;
    }

    const row = this.resolveChunkRowForMap(mapRow, chunkX, chunkZ);

    if (!row) {
      return null;
    }

    const heights = decodeFloat32Heights(row.heights);
    const materialOriginTileX =
      mapRow.exportBoundsMinX !== null
        ? deriveTileCoordinateFromMeters(
            mapRow.exportBoundsMinX,
            mapRow.metersPerTile
          ) + row.originTileX
        : row.originTileX;
    const materialOriginTileZ =
      mapRow.exportBoundsMinZ !== null
        ? deriveTileCoordinateFromMeters(
            mapRow.exportBoundsMinZ,
            mapRow.metersPerTile
          ) + row.originTileZ
        : row.originTileZ;
    const quantized = quantizeUint16Heights(heights);
    const materials = deriveChunkMaterialIds(
      heights,
      row.samplesWide,
      row.tileWidth,
      row.tileHeight,
      row.originTileX,
      row.originTileZ,
      materialOriginTileX,
      materialOriginTileZ
    );
    const staticEntities = this.listStaticEntitiesForChunk(
      mapRow,
      row.chunkX,
      row.chunkZ
    );

    return {
      chunkX: row.chunkX,
      chunkZ: row.chunkZ,
      heights: quantized.data,
      layers: {
        height: quantized.layer,
        material: {
          encoding: 'uint8' as const,
          unit: 'surface-material' as const
        }
      },
      mapId: row.mapId,
      materials: encodeMaterialIds(materials),
      originTileX: row.originTileX,
      originTileZ: row.originTileZ,
      samplesHigh: row.samplesHigh,
      samplesWide: row.samplesWide,
      staticEntities,
      tileHeight: row.tileHeight,
      tileWidth: row.tileWidth
    };
  }

  createStaticEntity(input: CreateStaticEntityInput) {
    return this.performStaticEntityMutation(input, (mapRow, now) => {
      this.getPlaceableArchetypeOrThrow(input.archetypeId);
      const entityId = input.id ?? this.nextStaticEntityId(mapRow.id, input.archetypeId);

      try {
        this.db
          .prepare(
            `
            INSERT INTO map_static_entities (
              id, map_id, label, archetype_id, position_x, position_z,
              yaw, scale, y_offset, state, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            entityId,
            mapRow.id,
            input.label ?? null,
            input.archetypeId,
            input.position.x,
            input.position.z,
            input.rotation.yaw,
            input.scale,
            input.yOffset,
            input.state,
            now,
            now
          );
      } catch (error) {
        throw normalizeSqliteError(error);
      }

      return staticEntityRowToModel(
        this.getStaticEntityRowOrThrow(mapRow.id, entityId)
      );
    });
  }

  updateStaticEntity(input: UpdateStaticEntityInput) {
    return this.performStaticEntityMutation(input, (mapRow, now) => {
      const current = this.getStaticEntityRowOrThrow(mapRow.id, input.id);
      const next = {
        archetypeId: input.archetypeId ?? current.archetypeId,
        label: input.label === undefined ? current.label : input.label,
        positionX: input.position?.x ?? current.positionX,
        positionZ: input.position?.z ?? current.positionZ,
        scale: input.scale ?? current.scale,
        state: input.state ?? current.state,
        yOffset: input.yOffset ?? current.yOffset,
        yaw: input.rotation?.yaw ?? current.yaw
      };
      this.getPlaceableArchetypeOrThrow(next.archetypeId);

      try {
        this.db
          .prepare(
            `
            UPDATE map_static_entities
            SET
              label = ?,
              archetype_id = ?,
              position_x = ?,
              position_z = ?,
              yaw = ?,
              scale = ?,
              y_offset = ?,
              state = ?,
              updated_at = ?
            WHERE map_id = ? AND id = ?
          `
          )
          .run(
            next.label,
            next.archetypeId,
            next.positionX,
            next.positionZ,
            next.yaw,
            next.scale,
            next.yOffset,
            next.state,
            now,
            mapRow.id,
            input.id
          );
      } catch (error) {
        throw normalizeSqliteError(error);
      }

      return staticEntityRowToModel(
        this.getStaticEntityRowOrThrow(mapRow.id, input.id)
      );
    });
  }

  deleteStaticEntity(input: DeleteStaticEntityInput) {
    return this.performStaticEntityMutation(input, mapRow => {
      const current = staticEntityRowToModel(
        this.getStaticEntityRowOrThrow(mapRow.id, input.id)
      );
      this.db
        .prepare(
          `
          DELETE FROM map_static_entities
          WHERE map_id = ? AND id = ?
        `
        )
        .run(mapRow.id, input.id);

      return current;
    });
  }

  listStaticEntities(mapId: string) {
    this.getMapRowOrThrow(mapId);
    return this.listStaticEntityRows(mapId).map(staticEntityRowToModel);
  }

  listStaticEntityItems(mapId: string): StaticEntityListItem[] {
    this.getMapRowOrThrow(mapId);

    const { archetypesById, entities } = this.listResolvedStaticEntities(mapId);

    return entities.map(entity => {
      const archetype = archetypesById.get(entity.archetypeId);

      if (!archetype) {
        throw new MapRepositoryError(
          'NOT_FOUND',
          `Archetype ${entity.archetypeId} was not found for static entity ${entity.id}`
        );
      }

      return {
        archetype: archetypeToStaticEntitySummary(archetype),
        entity
      };
    });
  }

  updateMap(id: string, input: { name?: string | null }) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare('UPDATE maps SET name = ?, updated_at = ? WHERE id = ?')
      .run(input.name ?? null, now, id);

    return result.changes === 0 ? null : this.getMap(id);
  }

  listMaps() {
    return this.db
      .query<MapRow, []>(
        `
        SELECT ${MAP_ROW_COLUMNS}
        FROM maps
        ORDER BY updated_at DESC, created_at DESC
      `
      )
      .all()
      .map(mapRowToSummaryMetadata);
  }

  findExport(id: string) {
    const row = this.findMapRow(id);

    if (
      !row ||
      row.sourceMapId === null ||
      row.sourceRevision === null ||
      row.exportedAt === null
    ) {
      return null;
    }

    return mapRowToMetadata(row, {
      includeExportManifest: true
    });
  }

  listExports(mapId: string) {
    this.ensureInfiniteVectorMapRow(mapId);

    return this.db
      .query<MapRow, [string]>(
        `
        SELECT ${MAP_ROW_COLUMNS}
        FROM maps
        WHERE source_map_id = ?
        ORDER BY exported_at DESC, created_at DESC
      `
      )
      .all(mapId)
      .map(mapRowToSummaryMetadata);
  }

  listSourcePolygons(mapId: string, status?: SourcePolygonStatus) {
    this.ensureInfiniteVectorMapRow(mapId);
    return this.listSourcePolygonRows(mapId, status).map(
      sourcePolygonRowToModel
    );
  }

  createSourcePolygon(input: {
    expectedRevision: number;
    mapId: string;
    params: SourcePolygonParams;
    vertices: WorldPoint[];
  }) {
    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      (_mapRow, now) => {
        const row = this.insertSourcePolygonRecord(
          input.mapId,
          input.vertices,
          input.params,
          now
        );

        return {
          dirtyBounds: rowToBounds(row),
          result: sourcePolygonRowToModel(row)
        };
      }
    );

    return {
      dirtyBounds: dirtyBounds ?? result.bbox,
      mapRevision,
      polygon: result
    };
  }

  updateSourcePolygon(input: {
    expectedRevision: number;
    id: string;
    mapId: string;
    params?: SourcePolygonParams;
    vertices?: WorldPoint[];
  }) {
    if (!input.params && !input.vertices) {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        'At least one source polygon field must be updated'
      );
    }

    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      (_mapRow, now) => {
        const existing = this.getSourcePolygonRowOrThrow(
          input.mapId,
          input.id,
          'active'
        );
        const nextVertices = input.vertices
          ? ensurePolygonVertices(input.vertices)
          : parseJson<WorldPoint[]>(existing.verticesJson);
        const nextParams =
          input.params ?? parseJson<SourcePolygonParams>(existing.paramsJson);
        const nextBounds = computePolygonBbox(nextVertices);

        this.db
          .prepare(
            `
            UPDATE map_source_polygons
            SET
              vertices_json = ?,
              params_json = ?,
              bbox_min_x = ?,
              bbox_min_z = ?,
              bbox_max_x = ?,
              bbox_max_z = ?,
              updated_at = ?
            WHERE map_id = ? AND id = ?
          `
          )
          .run(
            JSON.stringify(nextVertices),
            JSON.stringify(nextParams),
            nextBounds.minX,
            nextBounds.minZ,
            nextBounds.maxX,
            nextBounds.maxZ,
            now,
            input.mapId,
            input.id
          );

        const row = this.getSourcePolygonRowOrThrow(
          input.mapId,
          input.id,
          'active'
        );

        return {
          dirtyBounds: mergeBounds(rowToBounds(existing), rowToBounds(row)),
          result: sourcePolygonRowToModel(row)
        };
      }
    );

    return {
      dirtyBounds: dirtyBounds ?? result.bbox,
      mapRevision,
      polygon: result
    };
  }

  deleteSourcePolygon(input: {
    expectedRevision: number;
    id: string;
    mapId: string;
  }) {
    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      (_mapRow, now) => {
        const existing = this.getSourcePolygonRowOrThrow(
          input.mapId,
          input.id,
          'active'
        );

        this.db
          .prepare(
            `
            UPDATE map_source_polygons
            SET status = 'retired', retired_at = ?, updated_at = ?
            WHERE map_id = ? AND id = ?
          `
          )
          .run(now, now, input.mapId, input.id);

        const row = this.getSourcePolygonRowOrThrow(input.mapId, input.id);

        return {
          dirtyBounds: rowToBounds(existing),
          result: sourcePolygonRowToModel(row)
        };
      }
    );

    return {
      dirtyBounds: dirtyBounds ?? result.bbox,
      mapRevision,
      polygon: result
    };
  }

  listControlPoints(mapId: string) {
    this.ensureInfiniteVectorMapRow(mapId);
    return this.listControlPointRows(mapId).map(controlPointRowToModel);
  }

  createControlPoint(
    input: Omit<ControlPoint, 'createdAt' | 'id' | 'updatedAt'> & {
      expectedRevision: number;
    }
  ) {
    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      (_mapRow, now) => {
        const id = randomUUID();

        this.db
          .prepare(
            `
            INSERT INTO map_control_points (
              id, map_id, x, z, type, elevation_meters, influence_meters, strength,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            id,
            input.mapId,
            input.x,
            input.z,
            input.type,
            input.elevationMeters,
            input.influenceMeters,
            input.strength,
            now,
            now
          );

        const row = this.getControlPointRowOrThrow(input.mapId, id);

        return {
          dirtyBounds: boundsFromPointRadius(row, row.influenceMeters),
          result: controlPointRowToModel(row)
        };
      }
    );

    return {
      controlPoint: result,
      dirtyBounds:
        dirtyBounds ?? boundsFromPointRadius(result, result.influenceMeters),
      mapRevision
    };
  }

  updateControlPoint(input: {
    elevationMeters?: number;
    expectedRevision: number;
    id: string;
    influenceMeters?: number;
    mapId: string;
    strength?: number;
    type?: ControlPoint['type'];
    x?: number;
    z?: number;
  }) {
    if (
      input.elevationMeters === undefined &&
      input.influenceMeters === undefined &&
      input.strength === undefined &&
      input.type === undefined &&
      input.x === undefined &&
      input.z === undefined
    ) {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        'At least one control point field must be updated'
      );
    }

    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      (_mapRow, now) => {
        const existing = this.getControlPointRowOrThrow(input.mapId, input.id);

        this.db
          .prepare(
            `
            UPDATE map_control_points
            SET
              x = ?,
              z = ?,
              type = ?,
              elevation_meters = ?,
              influence_meters = ?,
              strength = ?,
              updated_at = ?
            WHERE map_id = ? AND id = ?
          `
          )
          .run(
            input.x ?? existing.x,
            input.z ?? existing.z,
            input.type ?? existing.type,
            input.elevationMeters ?? existing.elevationMeters,
            input.influenceMeters ?? existing.influenceMeters,
            input.strength ?? existing.strength,
            now,
            input.mapId,
            input.id
          );

        const row = this.getControlPointRowOrThrow(input.mapId, input.id);

        return {
          dirtyBounds: mergeBounds(
            boundsFromPointRadius(existing, existing.influenceMeters),
            boundsFromPointRadius(row, row.influenceMeters)
          ),
          result: controlPointRowToModel(row)
        };
      }
    );

    return {
      controlPoint: result,
      dirtyBounds:
        dirtyBounds ?? boundsFromPointRadius(result, result.influenceMeters),
      mapRevision
    };
  }

  deleteControlPoint(input: {
    expectedRevision: number;
    id: string;
    mapId: string;
  }) {
    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      () => {
        const existing = this.getControlPointRowOrThrow(input.mapId, input.id);
        const model = controlPointRowToModel(existing);
        this.db
          .prepare('DELETE FROM map_control_points WHERE map_id = ? AND id = ?')
          .run(input.mapId, input.id);

        return {
          dirtyBounds: boundsFromPointRadius(
            existing,
            existing.influenceMeters
          ),
          result: model
        };
      }
    );

    return {
      controlPoint: result,
      dirtyBounds:
        dirtyBounds ?? boundsFromPointRadius(result, result.influenceMeters),
      mapRevision
    };
  }

  listDerivedIslands(mapId: string): DerivedIsland[] {
    this.ensureInfiniteVectorMapRow(mapId);
    return this.listDerivedIslandRows(mapId)
      .map(derivedIslandRowToModel)
      .map(toPublicDerivedIsland);
  }

  updateDerivedIslandMetadata(input: {
    defaultFaction?: string | null;
    defaultOwner?: string | null;
    expectedRevision: number;
    id: string;
    mapId: string;
    name?: string | null;
  }) {
    return this.runInTransaction(() => {
      const mapRow = this.ensureInfiniteVectorMapRow(input.mapId);
      this.assertExpectedRevision(mapRow, input.expectedRevision);
      const existing = this.getDerivedIslandRowOrThrow(input.mapId, input.id);
      const now = new Date().toISOString();

      this.db
        .prepare(
          `
          UPDATE map_derived_islands
          SET
            name = ?,
            default_owner = ?,
            default_faction = ?,
            updated_at = ?
          WHERE map_id = ? AND id = ?
        `
        )
        .run(
          input.name === undefined ? existing.name : input.name,
          input.defaultOwner === undefined
            ? existing.defaultOwner
            : input.defaultOwner,
          input.defaultFaction === undefined
            ? existing.defaultFaction
            : input.defaultFaction,
          now,
          input.mapId,
          input.id
        );

      const updatedMapRow = this.bumpMapRevisions(input.mapId, {
        terrainAffecting: false
      });
      const island = derivedIslandRowToModel(
        this.getDerivedIslandRowOrThrow(input.mapId, input.id)
      );

      return {
        island: toPublicDerivedIsland(island),
        mapRevision: updatedMapRow.revision
      };
    });
  }

  applyBoolean(input: {
    expectedRevision: number;
    mapId: string;
    operation: BooleanOperation;
    polygonIds: string[];
  }): ApplyBooleanOutput {
    const { dirtyBounds, mapRevision, result } = this.performTerrainMutation(
      {
        expectedRevision: input.expectedRevision,
        mapId: input.mapId
      },
      (_mapRow, now) => {
        const operands = input.polygonIds.map(polygonId =>
          sourcePolygonRowToModel(
            this.getSourcePolygonRowOrThrow(input.mapId, polygonId, 'active')
          )
        );
        let resultPolygons: WorldPoint[][];

        try {
          resultPolygons = applyBooleanOperationToPolygons(
            input.operation,
            operands.map(operand => operand.vertices)
          );
        } catch (error) {
          throw new MapRepositoryError(
            'BAD_REQUEST',
            error instanceof Error ? error.message : 'Boolean operation failed'
          );
        }

        if (resultPolygons.length === 0) {
          throw new MapRepositoryError(
            'BAD_REQUEST',
            `Boolean ${input.operation} produced no source polygons`
          );
        }

        const combinedParams = averageSourcePolygonParams(operands);
        const createdRows = resultPolygons.map(vertices =>
          this.insertSourcePolygonRecord(
            input.mapId,
            vertices,
            combinedParams,
            now
          )
        );

        const retire = this.db.prepare(`
          UPDATE map_source_polygons
          SET status = 'retired', retired_at = ?, updated_at = ?
          WHERE map_id = ? AND id = ?
        `);

        operands.forEach(operand => {
          retire.run(now, now, input.mapId, operand.id);
        });

        const dirtyBounds = [
          ...operands.map(operand => operand.bbox),
          ...createdRows.map(rowToBounds)
        ].reduce<WorldBounds | null>(
          (bounds, bbox) => mergeBounds(bounds, bbox),
          null
        );

        return {
          dirtyBounds,
          result: {
            createdPolygons: createdRows.map(sourcePolygonRowToModel),
            retiredPolygonIds: operands.map(operand => operand.id)
          }
        };
      }
    );

    return {
      createdPolygons: result.createdPolygons,
      dirtyBounds: dirtyBounds ??
        result.createdPolygons
          .map(polygon => polygon.bbox)
          .reduce<WorldBounds | null>(
            (bounds, bbox) => mergeBounds(bounds, bbox),
            null
          ) ?? {
          maxX: 0,
          maxZ: 0,
          minX: 0,
          minZ: 0
        },
      mapRevision,
      retiredPolygonIds: result.retiredPolygonIds
    };
  }

  getOverview(mapId: string): MapOverview {
    const map = this.ensureInfiniteVectorMapRow(mapId);
    const polygons = this.listSourcePolygonRows(mapId, 'active').map(
      sourcePolygonRowToModel
    );
    const controlPoints = this.listControlPointRows(mapId).map(
      controlPointRowToModel
    );
    const islands = this.listDerivedIslandRows(mapId).map(
      derivedIslandRowToModel
    );
    const overallBounds = [
      ...polygons.map(polygon => polygon.bbox),
      ...controlPoints.map(point => boundsFromPointRadius(point))
    ].reduce<WorldBounds | null>(
      (bounds, bbox) => mergeBounds(bounds, bbox),
      null
    );
    const padding = map.chunkSizeTiles * map.metersPerTile;
    const nodes = [
      ...polygons.map(polygon => ({
        bbox: polygon.bbox,
        controlPointCount: 0,
        sourcePolygonCount: 1
      })),
      ...controlPoints.map(point => ({
        bbox: boundsFromPointRadius(point),
        controlPointCount: 1,
        sourcePolygonCount: 0
      }))
    ];
    const visited = new Set<number>();
    const clusters: MapOverview['clusters'] = [];

    for (let index = 0; index < nodes.length; index += 1) {
      if (visited.has(index)) {
        continue;
      }

      const queue = [index];
      visited.add(index);
      let clusterBounds: WorldBounds | null = null;
      let controlPointCount = 0;
      let sourcePolygonCount = 0;

      while (queue.length > 0) {
        const currentIndex = queue.shift()!;
        const current = nodes[currentIndex]!;
        clusterBounds = mergeBounds(clusterBounds, current.bbox);
        controlPointCount += current.controlPointCount;
        sourcePolygonCount += current.sourcePolygonCount;

        for (
          let candidateIndex = 0;
          candidateIndex < nodes.length;
          candidateIndex += 1
        ) {
          if (visited.has(candidateIndex)) {
            continue;
          }

          const candidate = nodes[candidateIndex]!;
          if (
            bboxesIntersect(
              expandWorldBounds(current.bbox, padding),
              expandWorldBounds(candidate.bbox, padding)
            )
          ) {
            visited.add(candidateIndex);
            queue.push(candidateIndex);
          }
        }
      }

      if (!clusterBounds) {
        continue;
      }

      clusters.push({
        bbox: clusterBounds,
        centroid: {
          x: (clusterBounds.minX + clusterBounds.maxX) * 0.5,
          z: (clusterBounds.minZ + clusterBounds.maxZ) * 0.5
        },
        controlPointCount,
        derivedIslandCount: islands.filter(island =>
          bboxesIntersect(island.bbox, clusterBounds)
        ).length,
        sourcePolygonCount
      });
    }

    return {
      bounds: overallBounds,
      clusters,
      counts: {
        controlPoints: controlPoints.length,
        derivedIslands: islands.length,
        sourcePolygons: polygons.length
      },
      mapId,
      revision: map.revision
    };
  }

  listDerivedIslandLineage(mapId: string) {
    return this.db
      .query<LineageRow, [string]>(
        `
        SELECT
          child_island_id AS childIslandId,
          created_at AS createdAt,
          id,
          map_id AS mapId,
          operation,
          parent_island_id AS parentIslandId
        FROM map_derived_island_lineage
        WHERE map_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(mapId);
  }

  private ensureColumnExists(
    table: string,
    column: string,
    definition: string
  ) {
    const columns = this.db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map(row => row.name);

    if (!columns.includes(column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private migrate() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY,
        name TEXT,
        kind TEXT NOT NULL,
        extent_kind TEXT NOT NULL,
        width_tiles INTEGER,
        height_tiles INTEGER,
        wrap_x INTEGER NOT NULL DEFAULT 0,
        wrap_z INTEGER NOT NULL DEFAULT 0,
        meters_per_tile INTEGER NOT NULL,
        chunk_size_tiles INTEGER NOT NULL,
        generator TEXT,
        seed TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        terrain_revision INTEGER NOT NULL DEFAULT 0,
        source_map_id TEXT,
        source_revision INTEGER,
        exported_at TEXT,
        export_bounds_min_x REAL,
        export_bounds_min_z REAL,
        export_bounds_max_x REAL,
        export_bounds_max_z REAL,
        static_entity_export_manifest_json TEXT,
        static_entity_export_manifest_hash TEXT,
        static_entity_export_entity_count INTEGER,
        static_entity_export_archetype_count INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_map_id) REFERENCES maps(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS map_chunks (
        map_id TEXT NOT NULL,
        chunk_x INTEGER NOT NULL,
        chunk_z INTEGER NOT NULL,
        origin_tile_x INTEGER NOT NULL,
        origin_tile_z INTEGER NOT NULL,
        tile_width INTEGER NOT NULL,
        tile_height INTEGER NOT NULL,
        samples_wide INTEGER NOT NULL,
        samples_high INTEGER NOT NULL,
        heights BLOB NOT NULL,
        PRIMARY KEY (map_id, chunk_x, chunk_z),
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS map_source_polygons (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        vertices_json TEXT NOT NULL,
        params_json TEXT NOT NULL,
        bbox_min_x REAL NOT NULL,
        bbox_min_z REAL NOT NULL,
        bbox_max_x REAL NOT NULL,
        bbox_max_z REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        retired_at TEXT,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS map_control_points (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        type TEXT NOT NULL,
        elevation_meters REAL NOT NULL,
        influence_meters REAL NOT NULL,
        strength REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS map_derived_islands (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        name TEXT,
        default_owner TEXT,
        default_faction TEXT,
        bbox_min_x REAL NOT NULL,
        bbox_min_z REAL NOT NULL,
        bbox_max_x REAL NOT NULL,
        bbox_max_z REAL NOT NULL,
        area_meters2 REAL NOT NULL,
        geometry_json TEXT NOT NULL,
        source_polygon_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS map_derived_island_lineage (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        parent_island_id TEXT,
        child_island_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS asset_versions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        original_file_json TEXT NOT NULL,
        runtime_file_json TEXT,
        diagnostics_json TEXT NOT NULL,
        footprint_json TEXT NOT NULL,
        collision_box_json TEXT NOT NULL,
        collision_class TEXT NOT NULL,
        grounding_policy TEXT NOT NULL,
        max_height_delta_meters REAL NOT NULL,
        instancing_eligible INTEGER NOT NULL DEFAULT 0,
        map_preview_category TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS zarch_runtime_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        asset_version_id TEXT NOT NULL,
        render_dimensions_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (asset_version_id) REFERENCES asset_versions(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS archetypes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        asset_version_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (asset_version_id) REFERENCES asset_versions(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS map_static_entities (
        id TEXT NOT NULL,
        map_id TEXT NOT NULL,
        label TEXT,
        archetype_id TEXT NOT NULL,
        position_x REAL NOT NULL,
        position_z REAL NOT NULL,
        yaw REAL NOT NULL,
        scale REAL NOT NULL,
        y_offset REAL NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (map_id, id),
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (archetype_id) REFERENCES archetypes(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_map_source_polygons_map_status
        ON map_source_polygons(map_id, status);
      CREATE INDEX IF NOT EXISTS idx_map_source_polygons_bbox
        ON map_source_polygons(map_id, bbox_min_x, bbox_min_z, bbox_max_x, bbox_max_z);
      CREATE INDEX IF NOT EXISTS idx_map_control_points_map
        ON map_control_points(map_id);
      CREATE INDEX IF NOT EXISTS idx_map_derived_islands_map
        ON map_derived_islands(map_id);
      CREATE INDEX IF NOT EXISTS idx_map_derived_island_lineage_map
        ON map_derived_island_lineage(map_id);
      CREATE INDEX IF NOT EXISTS idx_archetypes_status
        ON archetypes(status);
      CREATE INDEX IF NOT EXISTS idx_zarch_runtime_entities_status
        ON zarch_runtime_entities(status);
      CREATE INDEX IF NOT EXISTS idx_zarch_runtime_entities_asset_version
        ON zarch_runtime_entities(asset_version_id);
      CREATE INDEX IF NOT EXISTS idx_map_static_entities_map
        ON map_static_entities(map_id);
      CREATE INDEX IF NOT EXISTS idx_map_static_entities_archetype
        ON map_static_entities(archetype_id);
    `);

    this.ensureColumnExists('maps', 'revision', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumnExists(
      'maps',
      'terrain_revision',
      'INTEGER NOT NULL DEFAULT 0'
    );
    this.ensureColumnExists('maps', 'source_map_id', 'TEXT');
    this.ensureColumnExists('maps', 'source_revision', 'INTEGER');
    this.ensureColumnExists('maps', 'exported_at', 'TEXT');
    this.ensureColumnExists('maps', 'export_bounds_min_x', 'REAL');
    this.ensureColumnExists('maps', 'export_bounds_min_z', 'REAL');
    this.ensureColumnExists('maps', 'export_bounds_max_x', 'REAL');
    this.ensureColumnExists('maps', 'export_bounds_max_z', 'REAL');
    this.ensureColumnExists('maps', 'static_entity_export_manifest_json', 'TEXT');
    this.ensureColumnExists('maps', 'static_entity_export_manifest_hash', 'TEXT');
    this.ensureColumnExists(
      'maps',
      'static_entity_export_entity_count',
      'INTEGER'
    );
    this.ensureColumnExists(
      'maps',
      'static_entity_export_archetype_count',
      'INTEGER'
    );

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_maps_source_map
        ON maps(source_map_id, exported_at);
    `);
  }
}

let repository: MapRepository | undefined;

export const getMapRepository = () => {
  if (!repository) {
    repository = new MapRepository();
  }

  return repository;
};

export const resetMapRepository = () => {
  repository?.close();
  repository = undefined;
};
