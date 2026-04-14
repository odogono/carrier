import type {
  ControlPoint,
  DerivedIsland,
  StaticEntity,
  SourcePolygon,
  SourcePolygonParams,
  WorldBounds,
  WorldPoint
} from 'carrier-contracts/types';

export type PolygonDraft = {
  id?: string;
  kind: 'create' | 'edit';
  params: SourcePolygonParams;
  selectedVertexIndex: number | null;
  vertices: WorldPoint[];
};

export type ControlPointDraft = {
  elevationMeters: number;
  id?: string;
  influenceMeters: number;
  kind: 'create' | 'edit';
  strength: number;
  type: ControlPoint['type'];
  x: number;
  z: number;
};

export type IslandDraft = {
  defaultFaction: string;
  defaultOwner: string;
  id: string;
  name: string;
};

export type StaticEntityDraft = {
  archetypeId: string;
  id: string;
  kind: 'edit';
  label: string;
  scale: number;
  state: StaticEntity['state'];
  x: number;
  yOffset: number;
  yaw: number;
  z: number;
};

export type DeleteTarget =
  | { id: string; kind: 'control-point' }
  | { id: string; kind: 'polygon' }
  | { ids: string[]; kind: 'static-entity' }
  | null;

export type CanvasDragState =
  | { kind: 'control-point'; pointerId: number; pointId?: string; }
  | {
      currentDelta: WorldPoint;
      entities: StaticEntity[];
      kind: 'static-entity';
      pointerId: number;
      startPoint: WorldPoint;
    }
  | {
      currentScale: number;
      currentYaw: number;
      entity: StaticEntity;
      kind: 'static-entity-rotate';
      pointerId: number;
      startAngle: number;
      startRadius: number;
      startScale: number;
      startYaw: number;
    }
  | {
      bounds: WorldBounds;
      currentPoint: WorldPoint;
      kind: 'marquee';
      pointerId: number;
      startPoint: WorldPoint;
    }
  | {
      controlPoints: ControlPointDraft[];
      currentDelta: WorldPoint;
      kind: 'polygon';
      pointerId: number;
      polygons: Array<{
        id: string;
        params: SourcePolygonParams;
        vertices: WorldPoint[];
      }>;
      startPoint: WorldPoint;
    }
  | { kind: 'vertex'; pointerId: number; vertexIndex: number }
  | null;

export type SourcePolygonLike = Pick<
  SourcePolygon,
  'id' | 'params' | 'vertices'
>;
export type ControlPointLike = Pick<
  ControlPoint,
  'elevationMeters' | 'id' | 'influenceMeters' | 'strength' | 'type' | 'x' | 'z'
>;
export type DerivedIslandLike = Pick<
  DerivedIsland,
  'defaultFaction' | 'defaultOwner' | 'id' | 'name'
>;
export type StaticEntityLike = Pick<
  StaticEntity,
  'archetypeId' | 'id' | 'label' | 'position' | 'rotation' | 'scale' | 'state' | 'yOffset'
>;
