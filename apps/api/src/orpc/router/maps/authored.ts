import {
  ArchiveAssetVersionInput,
  ArchiveAssetVersionRoute,
  ApproveAssetVersionInput,
  ApproveAssetVersionRoute,
  ApplyBooleanInput,
  ApplyBooleanRoute,
  CreateArchetypeInput,
  CreateArchetypeRoute,
  CreateControlPointInput,
  CreateControlPointRoute,
  CreateStaticEntityInput,
  CreateStaticEntityRoute,
  CreateSourcePolygonInput,
  CreateSourcePolygonRoute,
  DeleteAssetVersionInput,
  DeleteAssetVersionRoute,
  DeleteControlPointInput,
  DeleteControlPointRoute,
  DeleteStaticEntityInput,
  DeleteStaticEntityRoute,
  DeleteSourcePolygonInput,
  DeleteSourcePolygonRoute,
  GetArchetypeInput,
  GetArchetypeRoute,
  GetAssetVersionInput,
  GetAssetVersionRoute,
  GetOverviewInput,
  GetOverviewRoute,
  GetZarchRuntimeEntityInput,
  GetZarchRuntimeEntityRoute,
  ListArchetypesInput,
  ListArchetypesRoute,
  ListAssetVersionsInput,
  ListAssetVersionsRoute,
  ListControlPointsInput,
  ListControlPointsRoute,
  ListDerivedIslandsInput,
  ListDerivedIslandsRoute,
  ListReferencedArchetypesInput,
  ListReferencedArchetypesRoute,
  ListStaticEntitiesInput,
  ListStaticEntitiesRoute,
  ListSourcePolygonsInput,
  ListSourcePolygonsRoute,
  ListZarchRuntimeEntitiesInput,
  ListZarchRuntimeEntitiesRoute,
  UpdateArchetypeInput,
  UpdateArchetypeRoute,
  UpdateAssetVersionReviewInput,
  UpdateAssetVersionReviewRoute,
  UpdateControlPointInput,
  UpdateControlPointRoute,
  UpdateDerivedIslandInput,
  UpdateDerivedIslandRoute,
  UpdateStaticEntityInput,
  UpdateStaticEntityRoute,
  UpdateSourcePolygonInput,
  UpdateSourcePolygonRoute,
  UpsertZarchRuntimeEntityInput,
  UpsertZarchRuntimeEntityRoute
} from '../../../../../../packages/contracts/src/schema/maps';

import { ORPCError, os } from '@orpc/server';

import { getAssetPipeline } from '@/maps/assets';
import { getMapRepository } from '@/maps/repository';

import { asOrpcError } from './errors';

const listSourcePolygons = os
  .route(ListSourcePolygonsRoute)
  .input(ListSourcePolygonsInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listSourcePolygons(input.mapId, input.status);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listAssetVersions = os
  .route(ListAssetVersionsRoute)
  .input(ListAssetVersionsInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listAssetVersionItems(
        input.status === 'all' ? undefined : input.status
      );
    } catch (error) {
      return asOrpcError(error);
    }
  });

const getAssetVersion = os
  .route(GetAssetVersionRoute)
  .input(GetAssetVersionInput)
  .handler(async ({ input }) => {
    try {
      const assetVersion = getMapRepository().getAssetVersion(input.id);
      if (!assetVersion) {
        throw new ORPCError('NOT_FOUND', {
          message: `Asset version ${input.id} was not found`
        });
      }

      return assetVersion;
    } catch (error) {
      return asOrpcError(error);
    }
  });

const updateAssetVersionReview = os
  .route(UpdateAssetVersionReviewRoute)
  .input(UpdateAssetVersionReviewInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().reviewAssetVersion(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const approveAssetVersion = os
  .route(ApproveAssetVersionRoute)
  .input(ApproveAssetVersionInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().approveAssetVersion(input.id);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const archiveAssetVersion = os
  .route(ArchiveAssetVersionRoute)
  .input(ArchiveAssetVersionInput)
  .handler(async ({ input }) => {
    try {
      return getAssetPipeline().archive(input.id);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const deleteAssetVersion = os
  .route(DeleteAssetVersionRoute)
  .input(DeleteAssetVersionInput)
  .handler(async ({ input }) => {
    try {
      getAssetPipeline().delete(input.id);
      return {
        deleted: true as const,
        id: input.id
      };
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listZarchRuntimeEntities = os
  .route(ListZarchRuntimeEntitiesRoute)
  .input(ListZarchRuntimeEntitiesInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listZarchRuntimeEntities(input.status);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const getZarchRuntimeEntity = os
  .route(GetZarchRuntimeEntityRoute)
  .input(GetZarchRuntimeEntityInput)
  .handler(async ({ input }) => {
    try {
      const runtimeEntity = getMapRepository().getZarchRuntimeEntity(input.id);
      if (!runtimeEntity) {
        throw new ORPCError('NOT_FOUND', {
          message: `Zarch runtime entity ${input.id} was not found`
        });
      }

      return runtimeEntity;
    } catch (error) {
      return asOrpcError(error);
    }
  });

const upsertZarchRuntimeEntity = os
  .route(UpsertZarchRuntimeEntityRoute)
  .input(UpsertZarchRuntimeEntityInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().upsertZarchRuntimeEntity(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const createArchetype = os
  .route(CreateArchetypeRoute)
  .input(CreateArchetypeInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().createArchetype(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listArchetypes = os
  .route(ListArchetypesRoute)
  .input(ListArchetypesInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listArchetypes(input.status);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const getArchetype = os
  .route(GetArchetypeRoute)
  .input(GetArchetypeInput)
  .handler(async ({ input }) => {
    try {
      const archetype = getMapRepository().getArchetype(input.id);
      if (!archetype) {
        throw new ORPCError('NOT_FOUND', {
          message: `Archetype ${input.id} was not found`
        });
      }

      return archetype;
    } catch (error) {
      return asOrpcError(error);
    }
  });

const updateArchetype = os
  .route(UpdateArchetypeRoute)
  .input(UpdateArchetypeInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().updateArchetype(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listReferencedArchetypes = os
  .route(ListReferencedArchetypesRoute)
  .input(ListReferencedArchetypesInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listReferencedArchetypes(input.mapId);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const createStaticEntity = os
  .route(CreateStaticEntityRoute)
  .input(CreateStaticEntityInput)
  .handler(async ({ input }) => {
    try {
      const result = getMapRepository().createStaticEntity(input);
      return {
        entity: result.result,
        mapRevision: result.mapRevision
      };
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listStaticEntities = os
  .route(ListStaticEntitiesRoute)
  .input(ListStaticEntitiesInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listStaticEntityItems(input.mapId);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const updateStaticEntity = os
  .route(UpdateStaticEntityRoute)
  .input(UpdateStaticEntityInput)
  .handler(async ({ input }) => {
    try {
      const result = getMapRepository().updateStaticEntity(input);
      return {
        entity: result.result,
        mapRevision: result.mapRevision
      };
    } catch (error) {
      return asOrpcError(error);
    }
  });

const deleteStaticEntity = os
  .route(DeleteStaticEntityRoute)
  .input(DeleteStaticEntityInput)
  .handler(async ({ input }) => {
    try {
      const result = getMapRepository().deleteStaticEntity(input);
      return {
        entity: result.result,
        mapRevision: result.mapRevision
      };
    } catch (error) {
      return asOrpcError(error);
    }
  });

const createSourcePolygon = os
  .route(CreateSourcePolygonRoute)
  .input(CreateSourcePolygonInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().createSourcePolygon(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const updateSourcePolygon = os
  .route(UpdateSourcePolygonRoute)
  .input(UpdateSourcePolygonInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().updateSourcePolygon(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const deleteSourcePolygon = os
  .route(DeleteSourcePolygonRoute)
  .input(DeleteSourcePolygonInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().deleteSourcePolygon(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listControlPoints = os
  .route(ListControlPointsRoute)
  .input(ListControlPointsInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listControlPoints(input.mapId);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const createControlPoint = os
  .route(CreateControlPointRoute)
  .input(CreateControlPointInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().createControlPoint(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const updateControlPoint = os
  .route(UpdateControlPointRoute)
  .input(UpdateControlPointInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().updateControlPoint(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const deleteControlPoint = os
  .route(DeleteControlPointRoute)
  .input(DeleteControlPointInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().deleteControlPoint(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const listDerivedIslands = os
  .route(ListDerivedIslandsRoute)
  .input(ListDerivedIslandsInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().listDerivedIslands(input.mapId);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const updateDerivedIsland = os
  .route(UpdateDerivedIslandRoute)
  .input(UpdateDerivedIslandInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().updateDerivedIslandMetadata(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const applyBoolean = os
  .route(ApplyBooleanRoute)
  .input(ApplyBooleanInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().applyBoolean(input);
    } catch (error) {
      return asOrpcError(error);
    }
  });

const getOverview = os
  .route(GetOverviewRoute)
  .input(GetOverviewInput)
  .handler(async ({ input }) => {
    try {
      return getMapRepository().getOverview(input.mapId);
    } catch (error) {
      return asOrpcError(error);
    }
  });

export const authored = {
  archiveAssetVersion,
  approveAssetVersion,
  applyBoolean,
  createArchetype,
  createControlPoint,
  createStaticEntity,
  createSourcePolygon,
  deleteAssetVersion,
  deleteControlPoint,
  deleteStaticEntity,
  deleteSourcePolygon,
  getArchetype,
  getAssetVersion,
  getOverview,
  getZarchRuntimeEntity,
  listArchetypes,
  listAssetVersions,
  listControlPoints,
  listDerivedIslands,
  listReferencedArchetypes,
  listStaticEntities,
  listSourcePolygons,
  listZarchRuntimeEntities,
  updateArchetype,
  updateAssetVersionReview,
  updateControlPoint,
  updateDerivedIsland,
  updateStaticEntity,
  updateSourcePolygon,
  upsertZarchRuntimeEntity
};
