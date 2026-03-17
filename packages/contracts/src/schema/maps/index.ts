import { z } from 'zod';

import { oc } from '@orpc/contract';
import { type Route } from '@orpc/server';
import { oz } from '@orpc/zod';

export const MAP_GENERATOR = 'diamond-square' as const;
export const MAP_GENERATOR_ISLANDS = 'island-clusters' as const;
export const MAP_CHUNK_SIZE_TILES = 32;
export const MAP_METERS_PER_TILE = 10;
export const MAP_RENDER_UNITS_PER_TILE = 24;
export const MAX_MAP_TILES = 4096;

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
  type RgbTuple
} from './surface';

// --- Map Kind ---

export const MapKind = z.enum(['wrapped-classic', 'infinite-vector']);
export type MapKind = z.infer<typeof MapKind>;

// --- Map Extent ---

export const FiniteExtentSchema = z.object({
  kind: z.literal('finite'),
  widthMeters: z.number().positive(),
  heightMeters: z.number().positive(),
  widthTiles: z.number().int().positive(),
  heightTiles: z.number().int().positive(),
  wrapX: z.boolean(),
  wrapZ: z.boolean()
});
export type FiniteExtent = z.infer<typeof FiniteExtentSchema>;

export const InfiniteExtentSchema = z.object({
  kind: z.literal('infinite')
});
export type InfiniteExtent = z.infer<typeof InfiniteExtentSchema>;

export const MapExtentSchema = z.discriminatedUnion('kind', [
  FiniteExtentSchema,
  InfiniteExtentSchema
]);
export type MapExtent = z.infer<typeof MapExtentSchema>;

// --- Map Resolution ---

export const MapResolutionSchema = z.object({
  metersPerTile: z.number().positive(),
  chunkSizeTiles: z.number().int().positive()
});
export type MapResolution = z.infer<typeof MapResolutionSchema>;

// --- Generator ---

export const MapGenerator = z.enum([MAP_GENERATOR, MAP_GENERATOR_ISLANDS]);
export type MapGenerator = z.infer<typeof MapGenerator>;

// --- Height Layers ---

export const MapHeightFloat32LayerSchema = z.object({
  encoding: z.literal('float32'),
  unit: z.literal('metres')
});
export type MapHeightFloat32Layer = z.infer<typeof MapHeightFloat32LayerSchema>;

export const MapHeightUint16LayerSchema = z.object({
  encoding: z.literal('uint16'),
  minHeight: z.number(),
  step: z.number().nonnegative(),
  unit: z.literal('metres')
});
export type MapHeightUint16Layer = z.infer<typeof MapHeightUint16LayerSchema>;

export const MapHeightLayerSchema = z.discriminatedUnion('encoding', [
  MapHeightFloat32LayerSchema,
  MapHeightUint16LayerSchema
]);
export type MapHeightLayer = z.infer<typeof MapHeightLayerSchema>;

export const MapChunkLayersSchema = z.object({
  height: MapHeightLayerSchema,
  material: z
    .object({
      encoding: z.literal('uint8'),
      unit: z.literal('surface-material')
    })
    .optional()
});
export type MapChunkLayers = z.infer<typeof MapChunkLayersSchema>;

// --- Map Metadata ---

export const MapMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  kind: MapKind,
  extent: MapExtentSchema,
  resolution: MapResolutionSchema,
  generator: MapGenerator.optional(),
  seed: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type MapMetadata = z.infer<typeof MapMetadataSchema>;

// --- Type Guards ---

export const isFiniteMap = (
  meta: MapMetadata
): meta is MapMetadata & { extent: FiniteExtent } =>
  meta.extent.kind === 'finite';

export const isInfiniteMap = (
  meta: MapMetadata
): meta is MapMetadata & { extent: InfiniteExtent } =>
  meta.extent.kind === 'infinite';

// --- Accessor Helpers ---

export const getMapWidthTiles = (meta: MapMetadata): number | null =>
  meta.extent.kind === 'finite' ? meta.extent.widthTiles : null;

export const getMapHeightTiles = (meta: MapMetadata): number | null =>
  meta.extent.kind === 'finite' ? meta.extent.heightTiles : null;

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
  tileHeight: z.number().int().positive(),
  tileWidth: z.number().int().positive()
});
export type MapChunk = z.infer<typeof MapChunkSchema>;

export const MapChunkMetadataSchema = MapChunkSchema.omit({
  heights: true
});
export type MapChunkMetadata = z.infer<typeof MapChunkMetadataSchema>;

export const MapChunkBinarySchema = MapChunkMetadataSchema.extend({
  heights: oz.blob(),
  materials: oz.blob().optional()
});
export type MapChunkBinary = z.infer<typeof MapChunkBinarySchema>;

// --- Create Map Input (discriminated) ---

const CreateWrappedClassicMapInput = z.object({
  kind: z.literal('wrapped-classic'),
  generator: MapGenerator.default(MAP_GENERATOR),
  heightTiles: z.number().int().min(1).max(MAX_MAP_TILES),
  widthTiles: z.number().int().min(1).max(MAX_MAP_TILES),
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.string().trim().min(1).max(120).optional(),
  wrapX: z.boolean().default(false),
  wrapZ: z.boolean().default(false)
});

const CreateInfiniteVectorMapInput = z.object({
  kind: z.literal('infinite-vector'),
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.string().trim().min(1).max(120).optional()
});

export const CreateMapInput = z.discriminatedUnion('kind', [
  CreateWrappedClassicMapInput,
  CreateInfiniteVectorMapInput
]);
export type CreateMapInput = z.infer<typeof CreateMapInput>;

export const CreateMapOutput = MapMetadataSchema;
export type CreateMapOutput = z.infer<typeof CreateMapOutput>;

// --- Other Inputs/Outputs ---

export const DeleteMapInput = z.object({
  id: z.string().min(1)
});
export type DeleteMapInput = z.infer<typeof DeleteMapInput>;

export const DeleteMapOutput = z.object({
  deleted: z.literal(true),
  id: z.string().min(1)
});
export type DeleteMapOutput = z.infer<typeof DeleteMapOutput>;

export const GetMapInput = z.object({
  id: z.string().min(1)
});
export type GetMapInput = z.infer<typeof GetMapInput>;

export const GetMapOutput = MapMetadataSchema;
export type GetMapOutput = z.infer<typeof GetMapOutput>;

export const GetMapChunkInput = z.object({
  chunkX: z.coerce.number().int(),
  chunkZ: z.coerce.number().int(),
  mapId: z.string().min(1)
});
export type GetMapChunkInput = z.infer<typeof GetMapChunkInput>;

export const GetMapChunkOutput = MapChunkSchema;
export type GetMapChunkOutput = z.infer<typeof GetMapChunkOutput>;

export const GetMapChunkBinaryOutput = MapChunkBinarySchema;
export type GetMapChunkBinaryOutput = z.infer<typeof GetMapChunkBinaryOutput>;

export const ListMapsInput = z.object({});
export type ListMapsInput = z.infer<typeof ListMapsInput>;

export const ListMapsOutput = z.array(MapMetadataSchema);
export type ListMapsOutput = z.infer<typeof ListMapsOutput>;

export const UpdateMapInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).nullable().optional()
});
export type UpdateMapInput = z.infer<typeof UpdateMapInput>;

export const UpdateMapOutput = MapMetadataSchema;
export type UpdateMapOutput = z.infer<typeof UpdateMapOutput>;

// --- Routes ---

export const CreateMapRoute: Route = {
  description: 'Create and persist a generated map',
  method: 'POST',
  path: '/maps',
  tags: ['maps']
} as const;

export const DeleteMapRoute: Route = {
  description: 'Delete a map and all of its chunks',
  method: 'DELETE',
  path: '/maps/{id}',
  tags: ['maps']
} as const;

export const GetMapRoute: Route = {
  description: 'Retrieve map metadata',
  method: 'GET',
  path: '/maps/{id}',
  tags: ['maps']
} as const;

export const GetMapChunkRoute: Route = {
  description: 'Retrieve a single map chunk',
  method: 'GET',
  path: '/maps/{mapId}/chunks/{chunkX}/{chunkZ}',
  tags: ['maps']
} as const;

export const GetMapChunkBinaryRoute: Route = {
  description: 'Retrieve a single map chunk with binary height data',
  method: 'GET',
  path: '/maps/{mapId}/chunks/{chunkX}/{chunkZ}/binary',
  tags: ['maps']
} as const;

export const ListMapsRoute: Route = {
  description: 'List maps ordered by most recently updated first',
  method: 'GET',
  path: '/maps',
  tags: ['maps']
} as const;

export const UpdateMapRoute: Route = {
  description: 'Update map properties',
  method: 'PATCH',
  path: '/maps/{id}',
  tags: ['maps']
} as const;

export const mapsContract = {
  create: oc.route(CreateMapRoute).input(CreateMapInput).output(CreateMapOutput),
  delete: oc.route(DeleteMapRoute).input(DeleteMapInput).output(DeleteMapOutput),
  find: oc.route(GetMapRoute).input(GetMapInput).output(GetMapOutput),
  getChunk: oc
    .route(GetMapChunkRoute)
    .input(GetMapChunkInput)
    .output(GetMapChunkOutput),
  getChunkBinary: oc
    .route(GetMapChunkBinaryRoute)
    .input(GetMapChunkInput)
    .output(GetMapChunkBinaryOutput),
  list: oc.route(ListMapsRoute).input(ListMapsInput).output(ListMapsOutput),
  update: oc.route(UpdateMapRoute).input(UpdateMapInput).output(UpdateMapOutput)
};

export {
  decodeFloat32HeightsBlob,
  decodeMapChunkBinary,
  type RuntimeMapChunk
} from './binary';
