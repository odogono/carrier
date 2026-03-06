import { z } from 'zod';

import { oc } from '@orpc/contract';
import { type Route } from '@orpc/server';

export const MAP_GENERATOR = 'diamond-square' as const;
export const MAP_GENERATOR_ISLANDS = 'island-clusters' as const;
export const MAP_CHUNK_SIZE_TILES = 32;
export const MAP_METERS_PER_TILE = 10;
export const MAP_RENDER_UNITS_PER_TILE = 24;
export const MAX_MAP_TILES = 4096;

export const MapGenerator = z.enum([MAP_GENERATOR, MAP_GENERATOR_ISLANDS]);
export type MapGenerator = z.infer<typeof MapGenerator>;

export const MapHeightLayerSchema = z.object({
  encoding: z.literal('float32'),
  unit: z.literal('metres')
});
export type MapHeightLayer = z.infer<typeof MapHeightLayerSchema>;

export const MapChunkLayersSchema = z.object({
  height: MapHeightLayerSchema
});
export type MapChunkLayers = z.infer<typeof MapChunkLayersSchema>;

export const MapMetadataSchema = z.object({
  chunkSizeTiles: z.number().int().positive(),
  createdAt: z.string(),
  generator: MapGenerator,
  heightMeters: z.number().positive(),
  heightTiles: z.number().int().positive(),
  id: z.string().min(1),
  metersPerTile: z.number().positive(),
  name: z.string().nullable(),
  renderUnitsPerTile: z.number().positive(),
  seed: z.string().min(1),
  updatedAt: z.string(),
  widthMeters: z.number().positive(),
  widthTiles: z.number().int().positive()
});
export type MapMetadata = z.infer<typeof MapMetadataSchema>;

export const MapChunkSchema = z.object({
  chunkX: z.number().int().min(0),
  chunkZ: z.number().int().min(0),
  heights: z.array(z.number()),
  layers: MapChunkLayersSchema,
  mapId: z.string().min(1),
  originTileX: z.number().int().min(0),
  originTileZ: z.number().int().min(0),
  samplesHigh: z.number().int().min(2),
  samplesWide: z.number().int().min(2),
  tileHeight: z.number().int().positive(),
  tileWidth: z.number().int().positive()
});
export type MapChunk = z.infer<typeof MapChunkSchema>;

export const CreateMapInput = z.object({
  generator: MapGenerator.default(MAP_GENERATOR),
  heightTiles: z.number().int().min(1).max(MAX_MAP_TILES),
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.string().trim().min(1).max(120).optional(),
  widthTiles: z.number().int().min(1).max(MAX_MAP_TILES)
});
export type CreateMapInput = z.infer<typeof CreateMapInput>;

export const CreateMapOutput = MapMetadataSchema;
export type CreateMapOutput = z.infer<typeof CreateMapOutput>;

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
  chunkX: z.coerce.number().int().min(0),
  chunkZ: z.coerce.number().int().min(0),
  mapId: z.string().min(1)
});
export type GetMapChunkInput = z.infer<typeof GetMapChunkInput>;

export const GetMapChunkOutput = MapChunkSchema;
export type GetMapChunkOutput = z.infer<typeof GetMapChunkOutput>;

export const ListMapsInput = z.object({});
export type ListMapsInput = z.infer<typeof ListMapsInput>;

export const ListMapsOutput = z.array(MapMetadataSchema);
export type ListMapsOutput = z.infer<typeof ListMapsOutput>;

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

export const ListMapsRoute: Route = {
  description: 'List maps ordered by most recently updated first',
  method: 'GET',
  path: '/maps',
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
  list: oc.route(ListMapsRoute).input(ListMapsInput).output(ListMapsOutput)
};
