import { z } from "zod";

import { oc } from "@orpc/contract";
import { type Route } from "@orpc/server";
import { oz } from "@orpc/zod";

import {
  ArchetypeCategorySchema,
  ArchetypeStatusSchema,
  AssetFileMetadataSchema,
  AssetVersionCollisionBoxSchema,
  AssetVersionFootprintSchema,
  StaticEntitySchema,
  WorldBoundsSchema,
  authoredMapsContract,
} from "./authored";

export * from "./authored";

export const MAP_GENERATOR = "diamond-square" as const;
export const MAP_GENERATOR_ISLANDS = "island-clusters" as const;
export const MAP_CHUNK_SIZE_TILES = 32;
export const MAP_METERS_PER_TILE = 10;
export const MAX_MAP_TILES = 4096;
export const MAX_MAP_METERS = MAX_MAP_TILES * MAP_METERS_PER_TILE;

export {
  classifySurfaceMaterialFromElevation,
  getSurfaceMaterialById,
  getSurfaceMaterialId,
  getSurfaceMaterialColorRgb,
  MAP_SURFACE_MATERIALS,
  resolveSurfaceMaterial,
  tileHash,
  type MapSurfaceMaterialId,
  type MapSurfaceMaterial,
  type RgbTuple,
} from "./surface";

// --- Map Kind ---

export const MapKind = z.enum([
  "wrapped-classic",
  "infinite-vector",
  "finite-vector-slice",
  "wrapped-classic-slice",
]);
export type MapKind = z.infer<typeof MapKind>;

export const MapExportKind = z.enum([
  "finite-vector-slice",
  "wrapped-classic-slice",
]);
export type MapExportKind = z.infer<typeof MapExportKind>;

// --- Map Extent ---

export const FiniteExtentSchema = z.object({
  kind: z.literal("finite"),
  widthMeters: z.number().positive(),
  heightMeters: z.number().positive(),
  widthTiles: z.number().int().positive(),
  heightTiles: z.number().int().positive(),
  wrapX: z.boolean(),
  wrapZ: z.boolean(),
});
export type FiniteExtent = z.infer<typeof FiniteExtentSchema>;

export const InfiniteExtentSchema = z.object({
  kind: z.literal("infinite"),
});
export type InfiniteExtent = z.infer<typeof InfiniteExtentSchema>;

export const MapExtentSchema = z.discriminatedUnion("kind", [
  FiniteExtentSchema,
  InfiniteExtentSchema,
]);
export type MapExtent = z.infer<typeof MapExtentSchema>;

// --- Map Resolution ---

export const MapResolutionSchema = z.object({
  metersPerTile: z.number().positive(),
  chunkSizeTiles: z.number().int().positive(),
});
export type MapResolution = z.infer<typeof MapResolutionSchema>;

// --- Generator ---

export const MapGenerator = z.enum([MAP_GENERATOR, MAP_GENERATOR_ISLANDS]);
export type MapGenerator = z.infer<typeof MapGenerator>;

// --- Height Layers ---

export const MapHeightFloat32LayerSchema = z.object({
  encoding: z.literal("float32"),
  unit: z.literal("metres"),
});
export type MapHeightFloat32Layer = z.infer<typeof MapHeightFloat32LayerSchema>;

export const MapHeightUint16LayerSchema = z.object({
  encoding: z.literal("uint16"),
  minHeight: z.number(),
  step: z.number().nonnegative(),
  unit: z.literal("metres"),
});
export type MapHeightUint16Layer = z.infer<typeof MapHeightUint16LayerSchema>;

export const MapHeightLayerSchema = z.discriminatedUnion("encoding", [
  MapHeightFloat32LayerSchema,
  MapHeightUint16LayerSchema,
]);
export type MapHeightLayer = z.infer<typeof MapHeightLayerSchema>;

export const MapChunkLayersSchema = z.object({
  height: MapHeightLayerSchema,
  material: z
    .object({
      encoding: z.literal("uint8"),
      unit: z.literal("surface-material"),
    })
    .optional(),
});
export type MapChunkLayers = z.infer<typeof MapChunkLayersSchema>;

export const StaticEntityExportManifestHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/);
export type StaticEntityExportManifestHash = z.infer<
  typeof StaticEntityExportManifestHashSchema
>;

export const StaticEntityExportAssetVersionSchema = z.object({
  collisionBox: AssetVersionCollisionBoxSchema,
  collisionClass: z.string().trim().min(1).max(120),
  footprint: AssetVersionFootprintSchema,
  groundingPolicy: z.string().trim().min(1).max(120),
  id: z.string().min(1),
  instancingEligible: z.boolean(),
  maxHeightDeltaMeters: z.number().finite().nonnegative(),
  runtimeFile: AssetFileMetadataSchema,
});
export type StaticEntityExportAssetVersion = z.infer<
  typeof StaticEntityExportAssetVersionSchema
>;

export const StaticEntityExportArchetypeSchema = z.object({
  assetVersionId: z.string().min(1),
  category: ArchetypeCategorySchema,
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  status: ArchetypeStatusSchema,
  tags: z.array(z.string().trim().min(1).max(120)).max(100),
});
export type StaticEntityExportArchetype = z.infer<
  typeof StaticEntityExportArchetypeSchema
>;

export const StaticEntityExportManifestEntrySchema = z.object({
  archetype: StaticEntityExportArchetypeSchema,
  assetVersion: StaticEntityExportAssetVersionSchema,
});
export type StaticEntityExportManifestEntry = z.infer<
  typeof StaticEntityExportManifestEntrySchema
>;

export const StaticEntityExportManifestSchema = z.array(
  StaticEntityExportManifestEntrySchema,
);
export type StaticEntityExportManifest = z.infer<
  typeof StaticEntityExportManifestSchema
>;

export const normalizeStaticEntityExportManifest = (
  manifest: readonly StaticEntityExportManifestEntry[],
): StaticEntityExportManifest =>
  manifest
    .map(
      (entry): StaticEntityExportManifestEntry => ({
        archetype: {
          assetVersionId: entry.archetype.assetVersionId,
          category: entry.archetype.category,
          id: entry.archetype.id,
          name: entry.archetype.name,
          status: entry.archetype.status,
          tags: [...entry.archetype.tags].sort((left, right) =>
            left.localeCompare(right),
          ),
        },
        assetVersion: {
          collisionBox: entry.assetVersion.collisionBox,
          collisionClass: entry.assetVersion.collisionClass,
          footprint: entry.assetVersion.footprint,
          groundingPolicy: entry.assetVersion.groundingPolicy,
          id: entry.assetVersion.id,
          instancingEligible: entry.assetVersion.instancingEligible,
          maxHeightDeltaMeters: entry.assetVersion.maxHeightDeltaMeters,
          runtimeFile: entry.assetVersion.runtimeFile,
        },
      }),
    )
    .sort(
      (left, right) =>
        left.archetype.id.localeCompare(right.archetype.id) ||
        left.assetVersion.id.localeCompare(right.assetVersion.id),
    );

export const stringifyStaticEntityExportManifest = (
  manifest: readonly StaticEntityExportManifestEntry[],
) => JSON.stringify(normalizeStaticEntityExportManifest(manifest));

export const hasCompatibleStaticEntityExportManifestHash = (
  expectedHash: string,
  actualHash: string,
) => expectedHash === actualHash;

export const MapExportStaticEntitiesSummarySchema = z.object({
  archetypeCount: z.number().int().nonnegative(),
  entityCount: z.number().int().nonnegative(),
  fullManifestHash: StaticEntityExportManifestHashSchema,
});
export type MapExportStaticEntitiesSummary = z.infer<
  typeof MapExportStaticEntitiesSummarySchema
>;

export const MapExportStaticEntitiesDetailSchema =
  MapExportStaticEntitiesSummarySchema.extend({
    manifest: StaticEntityExportManifestSchema,
  });
export type MapExportStaticEntitiesDetail = z.infer<
  typeof MapExportStaticEntitiesDetailSchema
>;

export const MapExportMetadataSchema = z.object({
  bounds: WorldBoundsSchema,
  exportedAt: z.string(),
  sourceMapId: z.string().min(1),
  sourceRevision: z.number().int().nonnegative(),
  staticEntities: MapExportStaticEntitiesDetailSchema.optional(),
});
export type MapExportMetadata = z.infer<typeof MapExportMetadataSchema>;

export const MapExportMetadataSummarySchema = MapExportMetadataSchema.extend({
  staticEntities: MapExportStaticEntitiesSummarySchema.optional(),
});
export type MapExportMetadataSummary = z.infer<
  typeof MapExportMetadataSummarySchema
>;

// --- Map Metadata ---

export const MapMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  kind: MapKind,
  extent: MapExtentSchema,
  export: MapExportMetadataSchema.optional(),
  resolution: MapResolutionSchema,
  revision: z.number().int().nonnegative(),
  generator: MapGenerator.optional(),
  seed: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MapMetadata = z.infer<typeof MapMetadataSchema>;

export const MapMetadataSummarySchema = MapMetadataSchema.extend({
  export: MapExportMetadataSummarySchema.optional(),
});
export type MapMetadataSummary = z.infer<typeof MapMetadataSummarySchema>;

// --- Type Guards ---

export const isFiniteMap = (
  meta: MapMetadata | null | undefined,
): meta is MapMetadata & { extent: FiniteExtent } =>
  meta?.extent?.kind === "finite";

export const isInfiniteMap = (
  meta: MapMetadata | null | undefined,
): meta is MapMetadata & { extent: InfiniteExtent } =>
  meta?.extent?.kind === "infinite";

export const getMapChunkSizeTiles = (meta: MapMetadata): number =>
  meta.resolution.chunkSizeTiles;

export const getMapMetersPerTile = (meta: MapMetadata): number =>
  meta.resolution.metersPerTile;

// --- Chunk Schemas (signed coordinates) ---

export const MapChunkSchema = z.object({
  chunkX: z.number().int(),
  chunkZ: z.number().int(),
  heights: z.array(z.number()),
  layers: MapChunkLayersSchema,
  materials: z.array(z.number().int().min(0)).optional(),
  mapId: z.string().min(1),
  originTileX: z.number().int(),
  originTileZ: z.number().int(),
  samplesHigh: z.number().int().min(2),
  samplesWide: z.number().int().min(2),
  staticEntities: z.array(StaticEntitySchema),
  tileHeight: z.number().int().positive(),
  tileWidth: z.number().int().positive(),
});
export type MapChunk = z.infer<typeof MapChunkSchema>;

export const MapChunkMetadataSchema = MapChunkSchema.omit({
  heights: true,
});
export type MapChunkMetadata = z.infer<typeof MapChunkMetadataSchema>;

export const MapChunkBinarySchema = MapChunkMetadataSchema.extend({
  heights: oz.blob(),
  materials: oz.blob().optional(),
  staticEntitiesJson: z.string().optional(),
});
export type MapChunkBinary = z.infer<typeof MapChunkBinarySchema>;

// --- Create Map Input (discriminated) ---

const CreateWrappedClassicMapInput = z.object({
  kind: z.literal("wrapped-classic"),
  generator: MapGenerator.default(MAP_GENERATOR),
  heightMeters: z
    .number()
    .int()
    .min(MAP_METERS_PER_TILE)
    .max(MAX_MAP_METERS)
    .refine((value) => value % MAP_METERS_PER_TILE === 0, {
      message: `heightMeters must be a multiple of ${MAP_METERS_PER_TILE}`,
    }),
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.string().trim().min(1).max(120).optional(),
  widthMeters: z
    .number()
    .int()
    .min(MAP_METERS_PER_TILE)
    .max(MAX_MAP_METERS)
    .refine((value) => value % MAP_METERS_PER_TILE === 0, {
      message: `widthMeters must be a multiple of ${MAP_METERS_PER_TILE}`,
    }),
});

const CreateInfiniteVectorMapInput = z.object({
  kind: z.literal("infinite-vector"),
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.string().trim().min(1).max(120).optional(),
});

export const CreateMapInput = z.discriminatedUnion("kind", [
  CreateWrappedClassicMapInput,
  CreateInfiniteVectorMapInput,
]);
export type CreateMapInput = z.infer<typeof CreateMapInput>;

export const CreateMapOutput = MapMetadataSchema;
export type CreateMapOutput = z.infer<typeof CreateMapOutput>;

// --- Other Inputs/Outputs ---

export const DeleteMapInput = z.object({
  id: z.string().min(1),
});
export type DeleteMapInput = z.infer<typeof DeleteMapInput>;

export const DeleteMapOutput = z.object({
  deleted: z.literal(true),
  id: z.string().min(1),
});
export type DeleteMapOutput = z.infer<typeof DeleteMapOutput>;

export const GetMapInput = z.object({
  id: z.string().min(1),
});
export type GetMapInput = z.infer<typeof GetMapInput>;

export const GetMapOutput = MapMetadataSchema;
export type GetMapOutput = z.infer<typeof GetMapOutput>;

export const GetMapChunkInput = z.object({
  chunkX: z.coerce.number().int(),
  chunkZ: z.coerce.number().int(),
  mapId: z.string().min(1),
});
export type GetMapChunkInput = z.infer<typeof GetMapChunkInput>;

export const GetMapChunkOutput = MapChunkSchema;
export type GetMapChunkOutput = z.infer<typeof GetMapChunkOutput>;

export const GetMapChunkBinaryOutput = MapChunkBinarySchema;
export type GetMapChunkBinaryOutput = z.infer<typeof GetMapChunkBinaryOutput>;

export const ListMapsInput = z.object({});
export type ListMapsInput = z.infer<typeof ListMapsInput>;

export const ListMapsOutput = z.array(MapMetadataSummarySchema);
export type ListMapsOutput = z.infer<typeof ListMapsOutput>;

export const CreateMapExportInput = z.object({
  bounds: WorldBoundsSchema.refine(
    (bounds) => bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ,
    {
      message: "Export bounds must have positive width and height",
    },
  ),
  chunkSizeTiles: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(),
  kind: MapExportKind.default("finite-vector-slice"),
  mapId: z.string().min(1),
  metersPerTile: z.number().positive(),
  name: z.string().trim().min(1).max(120).optional(),
});
export type CreateMapExportInput = z.infer<typeof CreateMapExportInput>;

export const CreateMapExportOutput = MapMetadataSchema;
export type CreateMapExportOutput = z.infer<typeof CreateMapExportOutput>;

export const FindMapExportInput = z.object({
  id: z.string().min(1),
});
export type FindMapExportInput = z.infer<typeof FindMapExportInput>;

export const FindMapExportOutput = MapMetadataSchema;
export type FindMapExportOutput = z.infer<typeof FindMapExportOutput>;

export const ListMapExportsInput = z.object({
  mapId: z.string().min(1),
});
export type ListMapExportsInput = z.infer<typeof ListMapExportsInput>;

export const ListMapExportsOutput = z.array(MapMetadataSummarySchema);
export type ListMapExportsOutput = z.infer<typeof ListMapExportsOutput>;

export const UpdateMapInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).nullable().optional(),
});
export type UpdateMapInput = z.infer<typeof UpdateMapInput>;

export const UpdateMapOutput = MapMetadataSchema;
export type UpdateMapOutput = z.infer<typeof UpdateMapOutput>;

// --- Routes ---

export const CreateMapRoute: Route = {
  description: "Create and persist a generated map",
  method: "POST",
  path: "/maps",
  tags: ["maps"],
} as const;

export const DeleteMapRoute: Route = {
  description: "Delete a map and all of its chunks",
  method: "DELETE",
  path: "/maps/{id}",
  tags: ["maps"],
} as const;

export const GetMapRoute: Route = {
  description: "Retrieve map metadata",
  method: "GET",
  path: "/maps/{id}",
  tags: ["maps"],
} as const;

export const GetMapChunkRoute: Route = {
  description: "Retrieve a single map chunk",
  method: "GET",
  path: "/maps/{mapId}/chunks/{chunkX}/{chunkZ}",
  tags: ["maps"],
} as const;

export const GetMapChunkBinaryRoute: Route = {
  description: "Retrieve a single map chunk with binary height data",
  method: "GET",
  path: "/maps/{mapId}/chunks/{chunkX}/{chunkZ}/binary",
  tags: ["maps"],
} as const;

export const CreateMapExportRoute: Route = {
  description: "Create a finite exported slice from an infinite-vector map",
  method: "POST",
  path: "/maps/{mapId}/exports",
  tags: ["maps"],
} as const;

export const FindMapExportRoute: Route = {
  description: "Retrieve exported slice metadata",
  method: "GET",
  path: "/maps/exports/{id}",
  tags: ["maps"],
} as const;

export const ListMapExportsRoute: Route = {
  description: "List exported slices for an infinite-vector map",
  method: "GET",
  path: "/maps/{mapId}/exports",
  tags: ["maps"],
} as const;

export const ListMapsRoute: Route = {
  description: "List maps ordered by most recently updated first",
  method: "GET",
  path: "/maps",
  tags: ["maps"],
} as const;

export const UpdateMapRoute: Route = {
  description: "Update map properties",
  method: "PATCH",
  path: "/maps/{id}",
  tags: ["maps"],
} as const;

export const mapsContract = {
  ...authoredMapsContract,
  create: oc
    .route(CreateMapRoute)
    .input(CreateMapInput)
    .output(CreateMapOutput),
  createExport: oc
    .route(CreateMapExportRoute)
    .input(CreateMapExportInput)
    .output(CreateMapExportOutput),
  delete: oc
    .route(DeleteMapRoute)
    .input(DeleteMapInput)
    .output(DeleteMapOutput),
  find: oc.route(GetMapRoute).input(GetMapInput).output(GetMapOutput),
  findExport: oc
    .route(FindMapExportRoute)
    .input(FindMapExportInput)
    .output(FindMapExportOutput),
  getChunk: oc
    .route(GetMapChunkRoute)
    .input(GetMapChunkInput)
    .output(GetMapChunkOutput),
  getChunkBinary: oc
    .route(GetMapChunkBinaryRoute)
    .input(GetMapChunkInput)
    .output(GetMapChunkBinaryOutput),
  listExports: oc
    .route(ListMapExportsRoute)
    .input(ListMapExportsInput)
    .output(ListMapExportsOutput),
  list: oc.route(ListMapsRoute).input(ListMapsInput).output(ListMapsOutput),
  update: oc
    .route(UpdateMapRoute)
    .input(UpdateMapInput)
    .output(UpdateMapOutput),
};

export {
  decodeFloat32HeightsBlob,
  decodeMapChunkBinary,
  type RuntimeMapChunk,
} from "./binary";
