import {
  CreateMapInput,
  CreateMapRoute,
  DeleteMapInput,
  DeleteMapRoute,
  GetMapChunkInput,
  GetMapChunkBinaryRoute,
  GetMapChunkRoute,
  GetMapInput,
  GetMapRoute,
  ListMapsInput,
  ListMapsRoute,
  UpdateMapInput,
  UpdateMapRoute
} from '../../../../../../packages/contracts/src/schema/maps';

import { ORPCError, os } from '@orpc/server';

import { getMapRepository } from '@/maps/repository';

const create = os
  .route(CreateMapRoute)
  .input(CreateMapInput)
  .handler(async ({ input }) => getMapRepository().createMap(input));

const remove = os
  .route(DeleteMapRoute)
  .input(DeleteMapInput)
  .handler(async ({ input }) => {
    if (!getMapRepository().deleteMap(input.id)) {
      throw new ORPCError('NOT_FOUND', {
        message: `Map ${input.id} was not found`
      });
    }

    return {
      deleted: true as const,
      id: input.id
    };
  });

const find = os
  .route(GetMapRoute)
  .input(GetMapInput)
  .handler(async ({ input }) => {
    const map = getMapRepository().getMap(input.id);

    if (!map) {
      throw new ORPCError('NOT_FOUND', {
        message: `Map ${input.id} was not found`
      });
    }

    return map;
  });

const getChunk = os
  .route(GetMapChunkRoute)
  .input(GetMapChunkInput)
  .handler(async ({ input }) => {
    const chunk = getMapRepository().getMapChunk(
      input.mapId,
      input.chunkX,
      input.chunkZ
    );

    if (!chunk) {
      throw new ORPCError('NOT_FOUND', {
        message: `Chunk ${input.chunkX},${input.chunkZ} was not found for map ${input.mapId}`
      });
    }

    return chunk;
  });

const getChunkBinary = os
  .route(GetMapChunkBinaryRoute)
  .input(GetMapChunkInput)
  .handler(async ({ input }) => {
    const chunk = getMapRepository().getMapChunkBinary(
      input.mapId,
      input.chunkX,
      input.chunkZ
    );

    if (!chunk) {
      throw new ORPCError('NOT_FOUND', {
        message: `Chunk ${input.chunkX},${input.chunkZ} was not found for map ${input.mapId}`
      });
    }

    return {
      ...chunk,
      heights: new Blob([chunk.heights], {
        type: 'application/octet-stream'
      }),
      materials: chunk.materials
        ? new Blob([chunk.materials], {
            type: 'application/octet-stream'
          })
        : undefined
    };
  });

const list = os
  .route(ListMapsRoute)
  .input(ListMapsInput)
  .handler(async () => getMapRepository().listMaps());

const update = os
  .route(UpdateMapRoute)
  .input(UpdateMapInput)
  .handler(async ({ input }) => {
    const map = getMapRepository().updateMap(input.id, {
      name: input.name
    });

    if (!map) {
      throw new ORPCError('NOT_FOUND', {
        message: `Map ${input.id} was not found`
      });
    }

    return map;
  });

export const maps = {
  create,
  delete: remove,
  find,
  getChunk,
  getChunkBinary,
  list,
  update
};
