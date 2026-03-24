import { z } from 'zod';

import { oc } from '@orpc/contract';
import { type Route } from '@orpc/server';

const finiteNumber = z.number().finite();
const nonNegativeFiniteNumber = z.number().finite().nonnegative();
const positiveFiniteNumber = z.number().finite().positive();
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

export const AssetVersionStatusSchema = z.enum([
  'uploaded',
  'processing',
  'review',
  'ready',
  'failed'
]);
export type AssetVersionStatus = z.infer<typeof AssetVersionStatusSchema>;

export const ArchetypeStatusSchema = z.enum(['active', 'deprecated', 'archived']);
export type ArchetypeStatus = z.infer<typeof ArchetypeStatusSchema>;

export const StaticEntityStateSchema = z.enum(['active', 'disabled']);
export type StaticEntityState = z.infer<typeof StaticEntityStateSchema>;

export const ArchetypeCategorySchema = z.enum([
  'building',
  'landmark',
  'industrial',
  'natural-prop'
]);
export type ArchetypeCategory = z.infer<typeof ArchetypeCategorySchema>;

export const AssetFileMetadataSchema = z.object({
  contentType: z.string().trim().min(1).max(255).nullable(),
  path: z.string().trim().min(1).max(1024),
  sizeBytes: z.number().int().nonnegative()
});
export type AssetFileMetadata = z.infer<typeof AssetFileMetadataSchema>;

export const AssetVersionFootprintSchema = z.object({
  depthMeters: positiveFiniteNumber,
  widthMeters: positiveFiniteNumber
});
export type AssetVersionFootprint = z.infer<typeof AssetVersionFootprintSchema>;

export const AssetVersionCollisionBoxSchema = z.object({
  depthMeters: positiveFiniteNumber,
  heightMeters: positiveFiniteNumber,
  widthMeters: positiveFiniteNumber
});
export type AssetVersionCollisionBox = z.infer<typeof AssetVersionCollisionBoxSchema>;

export const AssetVersionSchema = z.object({
  collisionBox: AssetVersionCollisionBoxSchema,
  collisionClass: z.string().trim().min(1).max(120),
  createdAt: timestampSchema,
  diagnostics: z.array(z.string().trim().min(1).max(500)).max(100),
  footprint: AssetVersionFootprintSchema,
  groundingPolicy: z.string().trim().min(1).max(120),
  id: z.string().min(1),
  instancingEligible: z.boolean(),
  maxHeightDeltaMeters: nonNegativeFiniteNumber,
  originalFile: AssetFileMetadataSchema,
  runtimeFile: AssetFileMetadataSchema.nullable(),
  status: AssetVersionStatusSchema,
  updatedAt: timestampSchema
});
export type AssetVersion = z.infer<typeof AssetVersionSchema>;

export const ArchetypeSchema = z.object({
  assetVersionId: z.string().min(1),
  category: ArchetypeCategorySchema,
  createdAt: timestampSchema,
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  status: ArchetypeStatusSchema,
  tags: z.array(z.string().trim().min(1).max(120)).max(100),
  updatedAt: timestampSchema
});
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const StaticEntityRotationSchema = z.object({
  yaw: finiteNumber
});
export type StaticEntityRotation = z.infer<typeof StaticEntityRotationSchema>;

export const StaticEntitySchema = z.object({
  archetypeId: z.string().min(1),
  createdAt: timestampSchema,
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120).nullable(),
  mapId: z.string().min(1),
  position: WorldPointSchema,
  rotation: StaticEntityRotationSchema,
  scale: positiveFiniteNumber,
  state: StaticEntityStateSchema,
  updatedAt: timestampSchema,
  yOffset: finiteNumber
});
export type StaticEntity = z.infer<typeof StaticEntitySchema>;

export const StaticEntityArchetypeSummarySchema = z.object({
  assetVersionId: z.string().min(1),
  category: ArchetypeCategorySchema,
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  status: ArchetypeStatusSchema
});
export type StaticEntityArchetypeSummary = z.infer<
  typeof StaticEntityArchetypeSummarySchema
>;

export const StaticEntityListItemSchema = z.object({
  archetype: StaticEntityArchetypeSummarySchema,
  entity: StaticEntitySchema
});
export type StaticEntityListItem = z.infer<typeof StaticEntityListItemSchema>;

export const ListAssetVersionsInput = z.object({
  status: AssetVersionStatusSchema.optional()
});
export type ListAssetVersionsInput = z.infer<typeof ListAssetVersionsInput>;

export const ListAssetVersionsOutput = z.array(AssetVersionSchema);
export type ListAssetVersionsOutput = z.infer<typeof ListAssetVersionsOutput>;

export const GetAssetVersionInput = z.object({
  id: z.string().min(1)
});
export type GetAssetVersionInput = z.infer<typeof GetAssetVersionInput>;

export const GetAssetVersionOutput = AssetVersionSchema;
export type GetAssetVersionOutput = z.infer<typeof GetAssetVersionOutput>;

export const UpdateAssetVersionReviewInput = z.object({
  collisionBox: AssetVersionCollisionBoxSchema.optional(),
  collisionClass: z.string().trim().min(1).max(120).optional(),
  diagnostics: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  footprint: AssetVersionFootprintSchema.optional(),
  groundingPolicy: z.string().trim().min(1).max(120).optional(),
  id: z.string().min(1),
  instancingEligible: z.boolean().optional(),
  maxHeightDeltaMeters: nonNegativeFiniteNumber.optional()
});
export type UpdateAssetVersionReviewInput = z.infer<
  typeof UpdateAssetVersionReviewInput
>;

export const UpdateAssetVersionReviewOutput = AssetVersionSchema;
export type UpdateAssetVersionReviewOutput = z.infer<
  typeof UpdateAssetVersionReviewOutput
>;

export const ApproveAssetVersionInput = z.object({
  id: z.string().min(1)
});
export type ApproveAssetVersionInput = z.infer<typeof ApproveAssetVersionInput>;

export const ApproveAssetVersionOutput = AssetVersionSchema;
export type ApproveAssetVersionOutput = z.infer<typeof ApproveAssetVersionOutput>;

export const CreateArchetypeInput = ArchetypeSchema.omit({
  createdAt: true,
  updatedAt: true
});
export type CreateArchetypeInput = z.infer<typeof CreateArchetypeInput>;

export const CreateArchetypeOutput = ArchetypeSchema;
export type CreateArchetypeOutput = z.infer<typeof CreateArchetypeOutput>;

export const ListArchetypesInput = z.object({
  status: ArchetypeStatusSchema.optional()
});
export type ListArchetypesInput = z.infer<typeof ListArchetypesInput>;

export const ListArchetypesOutput = z.array(ArchetypeSchema);
export type ListArchetypesOutput = z.infer<typeof ListArchetypesOutput>;

export const GetArchetypeInput = z.object({
  id: z.string().min(1)
});
export type GetArchetypeInput = z.infer<typeof GetArchetypeInput>;

export const GetArchetypeOutput = ArchetypeSchema;
export type GetArchetypeOutput = z.infer<typeof GetArchetypeOutput>;

export const UpdateArchetypeInput = z
  .object({
    category: ArchetypeCategorySchema.optional(),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    status: ArchetypeStatusSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(120)).max(100).optional()
  });
export type UpdateArchetypeInput = z.infer<typeof UpdateArchetypeInput>;

export const UpdateArchetypeOutput = ArchetypeSchema;
export type UpdateArchetypeOutput = z.infer<typeof UpdateArchetypeOutput>;

export const ListReferencedArchetypesInput = z.object({
  mapId: z.string().min(1)
});
export type ListReferencedArchetypesInput = z.infer<
  typeof ListReferencedArchetypesInput
>;

export const ListReferencedArchetypesOutput = z.array(ArchetypeSchema);
export type ListReferencedArchetypesOutput = z.infer<
  typeof ListReferencedArchetypesOutput
>;

export const CreateStaticEntityInput = z.object({
  archetypeId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(120).nullable(),
  mapId: z.string().min(1),
  position: WorldPointSchema,
  rotation: StaticEntityRotationSchema,
  scale: positiveFiniteNumber,
  state: StaticEntityStateSchema,
  yOffset: finiteNumber
});
export type CreateStaticEntityInput = z.infer<typeof CreateStaticEntityInput>;

export const CreateStaticEntityOutput = z.object({
  entity: StaticEntitySchema,
  mapRevision: z.number().int().nonnegative()
});
export type CreateStaticEntityOutput = z.infer<typeof CreateStaticEntityOutput>;

export const ListStaticEntitiesInput = z.object({
  mapId: z.string().min(1)
});
export type ListStaticEntitiesInput = z.infer<typeof ListStaticEntitiesInput>;

export const ListStaticEntitiesOutput = z.array(StaticEntityListItemSchema);
export type ListStaticEntitiesOutput = z.infer<typeof ListStaticEntitiesOutput>;

export const UpdateStaticEntityInput = z.object({
  archetypeId: z.string().min(1).optional(),
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120).nullable().optional(),
  mapId: z.string().min(1),
  position: WorldPointSchema.optional(),
  rotation: StaticEntityRotationSchema.optional(),
  scale: positiveFiniteNumber.optional(),
  state: StaticEntityStateSchema.optional(),
  yOffset: finiteNumber.optional()
});
export type UpdateStaticEntityInput = z.infer<typeof UpdateStaticEntityInput>;

export const UpdateStaticEntityOutput = z.object({
  entity: StaticEntitySchema,
  mapRevision: z.number().int().nonnegative()
});
export type UpdateStaticEntityOutput = z.infer<typeof UpdateStaticEntityOutput>;

export const DeleteStaticEntityInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  id: z.string().min(1),
  mapId: z.string().min(1)
});
export type DeleteStaticEntityInput = z.infer<typeof DeleteStaticEntityInput>;

export const DeleteStaticEntityOutput = z.object({
  entity: StaticEntitySchema,
  mapRevision: z.number().int().nonnegative()
});
export type DeleteStaticEntityOutput = z.infer<typeof DeleteStaticEntityOutput>;

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

export const ListAssetVersionsRoute: Route = {
  description: 'List uploaded asset versions',
  method: 'GET',
  path: '/maps/assets',
  tags: ['maps']
} as const;

export const GetAssetVersionRoute: Route = {
  description: 'Retrieve asset version metadata',
  method: 'GET',
  path: '/maps/assets/{id}',
  tags: ['maps']
} as const;

export const UpdateAssetVersionReviewRoute: Route = {
  description: 'Update derived asset review metadata while the asset is in review',
  method: 'PATCH',
  path: '/maps/assets/{id}/review',
  tags: ['maps']
} as const;

export const ApproveAssetVersionRoute: Route = {
  description: 'Approve a reviewed asset version and mark it ready',
  method: 'POST',
  path: '/maps/assets/{id}/approve',
  tags: ['maps']
} as const;

export const CreateArchetypeRoute: Route = {
  description: 'Create an archetype from a ready asset version',
  method: 'POST',
  path: '/maps/archetypes',
  tags: ['maps']
} as const;

export const ListArchetypesRoute: Route = {
  description: 'List global archetypes in the content catalog',
  method: 'GET',
  path: '/maps/archetypes',
  tags: ['maps']
} as const;

export const GetArchetypeRoute: Route = {
  description: 'Retrieve a single archetype from the content catalog',
  method: 'GET',
  path: '/maps/archetypes/{id}',
  tags: ['maps']
} as const;

export const UpdateArchetypeRoute: Route = {
  description: 'Update mutable archetype metadata and lifecycle status',
  method: 'PATCH',
  path: '/maps/archetypes/{id}',
  tags: ['maps']
} as const;

export const ListReferencedArchetypesRoute: Route = {
  description: 'List distinct archetypes referenced by placements in a map',
  method: 'GET',
  path: '/maps/{mapId}/archetypes',
  tags: ['maps']
} as const;

export const CreateStaticEntityRoute: Route = {
  description: 'Create a static entity placement for a map',
  method: 'POST',
  path: '/maps/{mapId}/entities',
  tags: ['maps']
} as const;

export const ListStaticEntitiesRoute: Route = {
  description: 'List static entity placements for a map with resolved archetype summaries',
  method: 'GET',
  path: '/maps/{mapId}/entities',
  tags: ['maps']
} as const;

export const UpdateStaticEntityRoute: Route = {
  description: 'Update a static entity placement for a map',
  method: 'PATCH',
  path: '/maps/{mapId}/entities/{id}',
  tags: ['maps']
} as const;

export const DeleteStaticEntityRoute: Route = {
  description: 'Delete a static entity placement for a map',
  method: 'DELETE',
  path: '/maps/{mapId}/entities/{id}',
  tags: ['maps']
} as const;

export const authoredMapsContract = {
  approveAssetVersion: oc
    .route(ApproveAssetVersionRoute)
    .input(ApproveAssetVersionInput)
    .output(ApproveAssetVersionOutput),
  applyBoolean: oc
    .route(ApplyBooleanRoute)
    .input(ApplyBooleanInput)
    .output(ApplyBooleanOutput),
  createArchetype: oc
    .route(CreateArchetypeRoute)
    .input(CreateArchetypeInput)
    .output(CreateArchetypeOutput),
  createControlPoint: oc
    .route(CreateControlPointRoute)
    .input(CreateControlPointInput)
    .output(CreateControlPointOutput),
  createStaticEntity: oc
    .route(CreateStaticEntityRoute)
    .input(CreateStaticEntityInput)
    .output(CreateStaticEntityOutput),
  createSourcePolygon: oc
    .route(CreateSourcePolygonRoute)
    .input(CreateSourcePolygonInput)
    .output(CreateSourcePolygonOutput),
  deleteControlPoint: oc
    .route(DeleteControlPointRoute)
    .input(DeleteControlPointInput)
    .output(DeleteControlPointOutput),
  deleteStaticEntity: oc
    .route(DeleteStaticEntityRoute)
    .input(DeleteStaticEntityInput)
    .output(DeleteStaticEntityOutput),
  deleteSourcePolygon: oc
    .route(DeleteSourcePolygonRoute)
    .input(DeleteSourcePolygonInput)
    .output(DeleteSourcePolygonOutput),
  getOverview: oc.route(GetOverviewRoute).input(GetOverviewInput).output(GetOverviewOutput),
  getAssetVersion: oc
    .route(GetAssetVersionRoute)
    .input(GetAssetVersionInput)
    .output(GetAssetVersionOutput),
  getArchetype: oc
    .route(GetArchetypeRoute)
    .input(GetArchetypeInput)
    .output(GetArchetypeOutput),
  listAssetVersions: oc
    .route(ListAssetVersionsRoute)
    .input(ListAssetVersionsInput)
    .output(ListAssetVersionsOutput),
  listArchetypes: oc
    .route(ListArchetypesRoute)
    .input(ListArchetypesInput)
    .output(ListArchetypesOutput),
  listControlPoints: oc
    .route(ListControlPointsRoute)
    .input(ListControlPointsInput)
    .output(ListControlPointsOutput),
  listDerivedIslands: oc
    .route(ListDerivedIslandsRoute)
    .input(ListDerivedIslandsInput)
    .output(ListDerivedIslandsOutput),
  listReferencedArchetypes: oc
    .route(ListReferencedArchetypesRoute)
    .input(ListReferencedArchetypesInput)
    .output(ListReferencedArchetypesOutput),
  listStaticEntities: oc
    .route(ListStaticEntitiesRoute)
    .input(ListStaticEntitiesInput)
    .output(ListStaticEntitiesOutput),
  listSourcePolygons: oc
    .route(ListSourcePolygonsRoute)
    .input(ListSourcePolygonsInput)
    .output(ListSourcePolygonsOutput),
  updateArchetype: oc
    .route(UpdateArchetypeRoute)
    .input(UpdateArchetypeInput)
    .output(UpdateArchetypeOutput),
  updateControlPoint: oc
    .route(UpdateControlPointRoute)
    .input(UpdateControlPointInput)
    .output(UpdateControlPointOutput),
  updateAssetVersionReview: oc
    .route(UpdateAssetVersionReviewRoute)
    .input(UpdateAssetVersionReviewInput)
    .output(UpdateAssetVersionReviewOutput),
  updateDerivedIsland: oc
    .route(UpdateDerivedIslandRoute)
    .input(UpdateDerivedIslandInput)
    .output(UpdateDerivedIslandOutput),
  updateStaticEntity: oc
    .route(UpdateStaticEntityRoute)
    .input(UpdateStaticEntityInput)
    .output(UpdateStaticEntityOutput),
  updateSourcePolygon: oc
    .route(UpdateSourcePolygonRoute)
    .input(UpdateSourcePolygonInput)
    .output(UpdateSourcePolygonOutput)
};
