import type {
  ControlPoint,
  DerivedIsland,
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

export type DeleteTarget =
  | { id: string; kind: 'control-point' }
  | { id: string; kind: 'polygon' }
  | null;

export type CanvasDragState =
  | { kind: 'control-point'; pointId?: string; pointerId: number }
  | {
      bounds: WorldBounds;
      currentPoint: WorldPoint;
      kind: 'marquee';
      pointerId: number;
      startPoint: WorldPoint;
    }
  | {
      controlPoints: ControlPointDraft[];
      kind: 'polygon';
      originalVertices: WorldPoint[];
      pointerId: number;
      polygonId: string;
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
