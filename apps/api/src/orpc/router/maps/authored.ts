import {
  ApproveAssetVersionInput,
  ApproveAssetVersionRoute,
  ApplyBooleanInput,
  ApplyBooleanRoute,
  CreateArchetypeInput,
  CreateArchetypeRoute,
  CreateControlPointInput,
  CreateControlPointRoute,
  CreateSourcePolygonInput,
  CreateSourcePolygonRoute,
  DeleteControlPointInput,
  DeleteControlPointRoute,
  DeleteSourcePolygonInput,
  DeleteSourcePolygonRoute,
  GetAssetVersionInput,
  GetAssetVersionRoute,
  GetOverviewInput,
  GetOverviewRoute,
  ListAssetVersionsInput,
  ListAssetVersionsRoute,
  ListControlPointsInput,
  ListControlPointsRoute,
  ListDerivedIslandsInput,
  ListDerivedIslandsRoute,
  ListSourcePolygonsInput,
  ListSourcePolygonsRoute,
  UpdateAssetVersionReviewInput,
  UpdateAssetVersionReviewRoute,
  UpdateControlPointInput,
  UpdateControlPointRoute,
  UpdateDerivedIslandInput,
  UpdateDerivedIslandRoute,
  UpdateSourcePolygonInput,
  UpdateSourcePolygonRoute
} from '../../../../../../packages/contracts/src/schema/maps';

import { ORPCError, os } from '@orpc/server';

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
      return getMapRepository().listAssetVersions(input.status);
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
  approveAssetVersion,
  applyBoolean,
  createArchetype,
  createControlPoint,
  createSourcePolygon,
  deleteControlPoint,
  deleteSourcePolygon,
  getAssetVersion,
  getOverview,
  listAssetVersions,
  listControlPoints,
  listDerivedIslands,
  listSourcePolygons,
  updateAssetVersionReview,
  updateControlPoint,
  updateDerivedIsland,
  updateSourcePolygon
};
