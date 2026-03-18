import { z } from 'zod';

import { oc } from '@orpc/contract';
import { type Route } from '@orpc/server';

const finiteNumber = z.number().finite();
const nonNegativeFiniteNumber = z.number().finite().nonnegative();
const timestampSchema = z.string();

const hasAtLeastThreeUniqueVertices = (vertices: readonly { x: number; z: number }[]) =>
  new Set(vertices.map(vertex => `${vertex.x}:${vertex.z}`)).size >= 3;

export const WorldPointSchema = z.object({
  x: finiteNumber,
  z: finiteNumber
});
export type WorldPoint = z.infer<typeof WorldPointSchema>;

export const WorldBoundsSchema = z.object({
  maxX: finiteNumber,
  maxZ: finiteNumber,
  minX: finiteNumber,
  minZ: finiteNumber
});
export type WorldBounds = z.infer<typeof WorldBoundsSchema>;

export const SourcePolygonStatusSchema = z.enum(['active', 'retired']);
export type SourcePolygonStatus = z.infer<typeof SourcePolygonStatusSchema>;

export const SourcePolygonParamsSchema = z.object({
  maxDisplacementMeters: nonNegativeFiniteNumber,
  noiseScaleMeters: z.number().finite().positive(),
  roughness: nonNegativeFiniteNumber
});
export type SourcePolygonParams = z.infer<typeof SourcePolygonParamsSchema>;

export const SourcePolygonSchema = z.object({
  bbox: WorldBoundsSchema,
  createdAt: timestampSchema,
  id: z.string().min(1),
  mapId: z.string().min(1),
  params: SourcePolygonParamsSchema,
  retiredAt: timestampSchema.nullable(),
  status: SourcePolygonStatusSchema,
  updatedAt: timestampSchema,
  vertices: z
    .array(WorldPointSchema)
    .min(3)
    .refine(hasAtLeastThreeUniqueVertices, {
      message: 'Source polygons require at least 3 unique vertices'
    })
});
export type SourcePolygon = z.infer<typeof SourcePolygonSchema>;

export const ControlPointTypeSchema = z.enum(['peak', 'valley', 'plain']);
export type ControlPointType = z.infer<typeof ControlPointTypeSchema>;

export const ControlPointSchema = z.object({
  createdAt: timestampSchema,
  elevationMeters: finiteNumber,
  id: z.string().min(1),
  influenceMeters: z.number().finite().positive(),
  mapId: z.string().min(1),
  strength: nonNegativeFiniteNumber,
  type: ControlPointTypeSchema,
  updatedAt: timestampSchema,
  x: finiteNumber,
  z: finiteNumber
});
export type ControlPoint = z.infer<typeof ControlPointSchema>;

export const DerivedIslandSchema = z.object({
  areaMeters2: nonNegativeFiniteNumber,
  bbox: WorldBoundsSchema,
  centroid: WorldPointSchema,
  createdAt: timestampSchema,
  defaultFaction: z.string().trim().min(1).max(120).nullable(),
  defaultOwner: z.string().trim().min(1).max(120).nullable(),
  id: z.string().min(1),
  mapId: z.string().min(1),
  name: z.string().trim().min(1).max(120).nullable(),
  sourcePolygonIds: z.array(z.string().min(1)),
  updatedAt: timestampSchema
});
export type DerivedIsland = z.infer<typeof DerivedIslandSchema>;

export const MapOverviewClusterSchema = z.object({
  bbox: WorldBoundsSchema,
  centroid: WorldPointSchema,
  controlPointCount: z.number().int().nonnegative(),
  derivedIslandCount: z.number().int().nonnegative(),
  sourcePolygonCount: z.number().int().nonnegative()
});
export type MapOverviewCluster = z.infer<typeof MapOverviewClusterSchema>;

export const MapOverviewCountsSchema = z.object({
  controlPoints: z.number().int().nonnegative(),
  derivedIslands: z.number().int().nonnegative(),
  sourcePolygons: z.number().int().nonnegative()
});
export type MapOverviewCounts = z.infer<typeof MapOverviewCountsSchema>;

export const MapOverviewSchema = z.object({
  bounds: WorldBoundsSchema.nullable(),
  clusters: z.array(MapOverviewClusterSchema),
  counts: MapOverviewCountsSchema,
  mapId: z.string().min(1),
  revision: z.number().int().nonnegative()
});
export type MapOverview = z.infer<typeof MapOverviewSchema>;

export const CreateSourcePolygonInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  mapId: z.string().min(1),
  params: SourcePolygonParamsSchema,
  vertices: SourcePolygonSchema.shape.vertices
});
export type CreateSourcePolygonInput = z.infer<typeof CreateSourcePolygonInput>;

export const CreateSourcePolygonOutput = z.object({
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative(),
  polygon: SourcePolygonSchema
});
export type CreateSourcePolygonOutput = z.infer<typeof CreateSourcePolygonOutput>;

export const UpdateSourcePolygonInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  mapId: z.string().min(1),
  params: SourcePolygonParamsSchema.optional(),
  vertices: SourcePolygonSchema.shape.vertices.optional()
});
export type UpdateSourcePolygonInput = z.infer<typeof UpdateSourcePolygonInput>;

export const UpdateSourcePolygonOutput = z.object({
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative(),
  polygon: SourcePolygonSchema
});
export type UpdateSourcePolygonOutput = z.infer<typeof UpdateSourcePolygonOutput>;

export const DeleteSourcePolygonInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  mapId: z.string().min(1)
});
export type DeleteSourcePolygonInput = z.infer<typeof DeleteSourcePolygonInput>;

export const DeleteSourcePolygonOutput = z.object({
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative(),
  polygon: SourcePolygonSchema
});
export type DeleteSourcePolygonOutput = z.infer<typeof DeleteSourcePolygonOutput>;

export const ListSourcePolygonsInput = z.object({
  mapId: z.string().min(1),
  status: SourcePolygonStatusSchema.optional()
});
export type ListSourcePolygonsInput = z.infer<typeof ListSourcePolygonsInput>;

export const ListSourcePolygonsOutput = z.array(SourcePolygonSchema);
export type ListSourcePolygonsOutput = z.infer<typeof ListSourcePolygonsOutput>;

export const CreateControlPointInput = z.object({
  elevationMeters: finiteNumber,
  expectedRevision: z.number().int().nonnegative(),
  influenceMeters: z.number().finite().positive(),
  mapId: z.string().min(1),
  strength: nonNegativeFiniteNumber.default(1),
  type: ControlPointTypeSchema,
  x: finiteNumber,
  z: finiteNumber
});
export type CreateControlPointInput = z.infer<typeof CreateControlPointInput>;

export const CreateControlPointOutput = z.object({
  controlPoint: ControlPointSchema,
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative()
});
export type CreateControlPointOutput = z.infer<typeof CreateControlPointOutput>;

export const UpdateControlPointInput = z.object({
  elevationMeters: finiteNumber.optional(),
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  influenceMeters: z.number().finite().positive().optional(),
  mapId: z.string().min(1),
  strength: nonNegativeFiniteNumber.optional(),
  type: ControlPointTypeSchema.optional(),
  x: finiteNumber.optional(),
  z: finiteNumber.optional()
});
export type UpdateControlPointInput = z.infer<typeof UpdateControlPointInput>;

export const UpdateControlPointOutput = z.object({
  controlPoint: ControlPointSchema,
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative()
});
export type UpdateControlPointOutput = z.infer<typeof UpdateControlPointOutput>;

export const DeleteControlPointInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  mapId: z.string().min(1)
});
export type DeleteControlPointInput = z.infer<typeof DeleteControlPointInput>;

export const DeleteControlPointOutput = z.object({
  controlPoint: ControlPointSchema,
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative()
});
export type DeleteControlPointOutput = z.infer<typeof DeleteControlPointOutput>;

export const ListControlPointsInput = z.object({
  mapId: z.string().min(1)
});
export type ListControlPointsInput = z.infer<typeof ListControlPointsInput>;

export const ListControlPointsOutput = z.array(ControlPointSchema);
export type ListControlPointsOutput = z.infer<typeof ListControlPointsOutput>;

export const ListDerivedIslandsInput = z.object({
  mapId: z.string().min(1)
});
export type ListDerivedIslandsInput = z.infer<typeof ListDerivedIslandsInput>;

export const ListDerivedIslandsOutput = z.array(DerivedIslandSchema);
export type ListDerivedIslandsOutput = z.infer<typeof ListDerivedIslandsOutput>;

export const UpdateDerivedIslandInput = z.object({
  defaultFaction: z.string().trim().min(1).max(120).nullable().optional(),
  defaultOwner: z.string().trim().min(1).max(120).nullable().optional(),
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  mapId: z.string().min(1),
  name: z.string().trim().min(1).max(120).nullable().optional()
});
export type UpdateDerivedIslandInput = z.infer<typeof UpdateDerivedIslandInput>;

export const UpdateDerivedIslandOutput = z.object({
  island: DerivedIslandSchema,
  mapRevision: z.number().int().nonnegative()
});
export type UpdateDerivedIslandOutput = z.infer<typeof UpdateDerivedIslandOutput>;

export const BooleanOperationSchema = z.enum([
  'union',
  'intersection',
  'xor',
  'difference'
]);
export type BooleanOperation = z.infer<typeof BooleanOperationSchema>;

export const ApplyBooleanInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  mapId: z.string().min(1),
  operation: BooleanOperationSchema,
  polygonIds: z.array(z.string().min(1)).min(1)
});
export type ApplyBooleanInput = z.infer<typeof ApplyBooleanInput>;

export const ApplyBooleanOutput = z.object({
  createdPolygons: z.array(SourcePolygonSchema),
  dirtyBounds: WorldBoundsSchema,
  mapRevision: z.number().int().nonnegative(),
  retiredPolygonIds: z.array(z.string().min(1))
});
export type ApplyBooleanOutput = z.infer<typeof ApplyBooleanOutput>;

export const GetOverviewInput = z.object({
  mapId: z.string().min(1)
});
export type GetOverviewInput = z.infer<typeof GetOverviewInput>;

export const GetOverviewOutput = MapOverviewSchema;
export type GetOverviewOutput = z.infer<typeof GetOverviewOutput>;

export const ListSourcePolygonsRoute: Route = {
  description: 'List authored source polygons for an infinite-vector map',
  method: 'GET',
  path: '/maps/{mapId}/polygons',
  tags: ['maps']
} as const;

export const CreateSourcePolygonRoute: Route = {
  description: 'Create a source polygon for an infinite-vector map',
  method: 'POST',
  path: '/maps/{mapId}/polygons',
  tags: ['maps']
} as const;

export const UpdateSourcePolygonRoute: Route = {
  description: 'Update a source polygon for an infinite-vector map',
  method: 'PATCH',
  path: '/maps/{mapId}/polygons/{id}',
  tags: ['maps']
} as const;

export const DeleteSourcePolygonRoute: Route = {
  description: 'Retire a source polygon for an infinite-vector map',
  method: 'DELETE',
  path: '/maps/{mapId}/polygons/{id}',
  tags: ['maps']
} as const;

export const ListControlPointsRoute: Route = {
  description: 'List authored control points for an infinite-vector map',
  method: 'GET',
  path: '/maps/{mapId}/controls',
  tags: ['maps']
} as const;

export const CreateControlPointRoute: Route = {
  description: 'Create a control point for an infinite-vector map',
  method: 'POST',
  path: '/maps/{mapId}/controls',
  tags: ['maps']
} as const;

export const UpdateControlPointRoute: Route = {
  description: 'Update a control point for an infinite-vector map',
  method: 'PATCH',
  path: '/maps/{mapId}/controls/{id}',
  tags: ['maps']
} as const;

export const DeleteControlPointRoute: Route = {
  description: 'Delete a control point for an infinite-vector map',
  method: 'DELETE',
  path: '/maps/{mapId}/controls/{id}',
  tags: ['maps']
} as const;

export const ListDerivedIslandsRoute: Route = {
  description: 'List derived islands for an infinite-vector map',
  method: 'GET',
  path: '/maps/{mapId}/islands',
  tags: ['maps']
} as const;

export const UpdateDerivedIslandRoute: Route = {
  description: 'Update derived island metadata for an infinite-vector map',
  method: 'PATCH',
  path: '/maps/{mapId}/islands/{id}',
  tags: ['maps']
} as const;

export const ApplyBooleanRoute: Route = {
  description: 'Apply a boolean operation to source polygons',
  method: 'POST',
  path: '/maps/{mapId}/boolean',
  tags: ['maps']
} as const;

export const GetOverviewRoute: Route = {
  description: 'Retrieve authored overview data for an infinite-vector map',
  method: 'GET',
  path: '/maps/{mapId}/overview',
  tags: ['maps']
} as const;

export const authoredMapsContract = {
  applyBoolean: oc
    .route(ApplyBooleanRoute)
    .input(ApplyBooleanInput)
    .output(ApplyBooleanOutput),
  createControlPoint: oc
    .route(CreateControlPointRoute)
    .input(CreateControlPointInput)
    .output(CreateControlPointOutput),
  createSourcePolygon: oc
    .route(CreateSourcePolygonRoute)
    .input(CreateSourcePolygonInput)
    .output(CreateSourcePolygonOutput),
  deleteControlPoint: oc
    .route(DeleteControlPointRoute)
    .input(DeleteControlPointInput)
    .output(DeleteControlPointOutput),
  deleteSourcePolygon: oc
    .route(DeleteSourcePolygonRoute)
    .input(DeleteSourcePolygonInput)
    .output(DeleteSourcePolygonOutput),
  getOverview: oc.route(GetOverviewRoute).input(GetOverviewInput).output(GetOverviewOutput),
  listControlPoints: oc
    .route(ListControlPointsRoute)
    .input(ListControlPointsInput)
    .output(ListControlPointsOutput),
  listDerivedIslands: oc
    .route(ListDerivedIslandsRoute)
    .input(ListDerivedIslandsInput)
    .output(ListDerivedIslandsOutput),
  listSourcePolygons: oc
    .route(ListSourcePolygonsRoute)
    .input(ListSourcePolygonsInput)
    .output(ListSourcePolygonsOutput),
  updateControlPoint: oc
    .route(UpdateControlPointRoute)
    .input(UpdateControlPointInput)
    .output(UpdateControlPointOutput),
  updateDerivedIsland: oc
    .route(UpdateDerivedIslandRoute)
    .input(UpdateDerivedIslandInput)
    .output(UpdateDerivedIslandOutput),
  updateSourcePolygon: oc
    .route(UpdateSourcePolygonRoute)
    .input(UpdateSourcePolygonInput)
    .output(UpdateSourcePolygonOutput)
};
