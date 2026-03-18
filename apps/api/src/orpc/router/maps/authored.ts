import {
  ApplyBooleanInput,
  ApplyBooleanRoute,
  CreateControlPointInput,
  CreateControlPointRoute,
  CreateSourcePolygonInput,
  CreateSourcePolygonRoute,
  DeleteControlPointInput,
  DeleteControlPointRoute,
  DeleteSourcePolygonInput,
  DeleteSourcePolygonRoute,
  GetOverviewInput,
  GetOverviewRoute,
  ListControlPointsInput,
  ListControlPointsRoute,
  ListDerivedIslandsInput,
  ListDerivedIslandsRoute,
  ListSourcePolygonsInput,
  ListSourcePolygonsRoute,
  UpdateControlPointInput,
  UpdateControlPointRoute,
  UpdateDerivedIslandInput,
  UpdateDerivedIslandRoute,
  UpdateSourcePolygonInput,
  UpdateSourcePolygonRoute
} from '../../../../../../packages/contracts/src/schema/maps';

import { ORPCError, os } from '@orpc/server';

import { MapRepositoryError, getMapRepository } from '@/maps/repository';

const asOrpcError = (error: unknown): never => {
  if (error instanceof MapRepositoryError) {
    throw new ORPCError(error.code, {
      message: error.message
    });
  }

  throw error;
};

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
  applyBoolean,
  createControlPoint,
  createSourcePolygon,
  deleteControlPoint,
  deleteSourcePolygon,
  getOverview,
  listControlPoints,
  listDerivedIslands,
  listSourcePolygons,
  updateControlPoint,
  updateDerivedIsland,
  updateSourcePolygon
};
