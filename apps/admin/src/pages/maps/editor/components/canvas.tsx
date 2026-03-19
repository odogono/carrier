import type {
  ControlPoint,
  MapMetadata,
  SourcePolygon,
  WorldPoint
} from 'carrier-contracts/types';
import { Home, Minus, Plus } from 'lucide-react';
import type { KeyboardEvent, PointerEvent, RefObject, WheelEvent } from 'react';

import { MapStage } from '@/components/map-viewer/map-stage';
import { Button } from '@/components/ui/button';
import type { Viewport } from '@/hooks/use-map-viewport';

import {
  canSavePolygonDraft,
  getPolygonEdgeInsertPosition,
  nextOrderedSelection,
  type EditorTool
} from '../helpers';
import { STOP_PROPAGATION } from '../helpers/drafts';
import type {
  CanvasDragState,
  ControlPointDraft,
  PolygonDraft
} from '../helpers/types';

type EditorCanvasProps = {
  chunks: ReturnType<typeof import('@/hooks/use-map-chunks').useMapChunks>;
  commitDrawPolygon: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  controlPointDraft: ControlPointDraft | null;
  controlPoints: ControlPoint[];
  dragState: CanvasDragState;
  highlightedIslandPolygonIds: Set<string>;
  interactionRef: RefObject<SVGSVGElement | null>;
  map: MapMetadata;
  overlayPolygons: SourcePolygon[];
  polygonDraft: PolygonDraft | null;
  selectedControlPointId: string | null;
  selectedPolygonIds: string[];
  setDragState: React.Dispatch<React.SetStateAction<CanvasDragState>>;
  setPolygonDraft: (
    value:
      | PolygonDraft
      | null
      | ((current: PolygonDraft | null) => PolygonDraft | null),
    record?: boolean
  ) => void;
  setSelectedControlPointId: (value: string | null, record?: boolean) => void;
  setSelectedIslandId: (value: string | null, record?: boolean) => void;
  setSelectedPolygonIds: (
    value: string[] | ((current: string[]) => string[]),
    record?: boolean
  ) => void;
  size: { height: number; width: number };
  toScreenPoint: (point: Pick<WorldPoint, 'x' | 'z'>) => {
    x: number;
    z: number;
  };
  toWorldPoint: (event: {
    clientX: number;
    clientY: number;
    currentTarget: { getBoundingClientRect(): DOMRect };
  }) => WorldPoint;
  tool: EditorTool;
  viewport: Viewport;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  onCanvasClick: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
  onCanvasPointerCancel: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerLeave: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  onWheelCapture: (event: WheelEvent<HTMLDivElement>) => void;
};

export function EditorCanvas({
  chunks,
  commitDrawPolygon,
  containerRef,
  controlPointDraft,
  controlPoints,
  dragState,
  fitToView,
  highlightedIslandPolygonIds,
  interactionRef,
  map,
  onCanvasClick,
  onCanvasKeyDown,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerLeave,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onWheel,
  onWheelCapture,
  overlayPolygons,
  polygonDraft,
  selectedControlPointId,
  selectedPolygonIds,
  setDragState,
  setPolygonDraft,
  setSelectedControlPointId,
  setSelectedIslandId,
  setSelectedPolygonIds,
  size,
  toScreenPoint,
  toWorldPoint,
  tool,
  viewport,
  zoomIn,
  zoomOut
}: EditorCanvasProps) {
  const selectedPolygonSet = new Set(selectedPolygonIds);
  const zoomPercent = Math.round(viewport.zoom * 100);

  return (
    <div className="space-y-4">
      <CardShell>
        <div className="flex flex-col gap-2">
          <div
            ref={containerRef}
            className="relative h-[640px] overflow-hidden rounded-md border bg-[#0a1320]"
          >
            {size.width > 0 && size.height > 0 && (
              <>
                <MapStage
                  canvasHeight={size.height}
                  canvasWidth={size.width}
                  chunks={chunks}
                  map={map}
                  viewport={viewport}
                />
                <div
                  className="absolute inset-0"
                  onWheelCapture={onWheelCapture}
                >
                  <svg
                    ref={interactionRef}
                    className="absolute inset-0 outline-none"
                    height={size.height}
                    onClick={onCanvasClick}
                    onKeyDown={onCanvasKeyDown}
                    onPointerCancel={onCanvasPointerCancel}
                    onPointerDown={onCanvasPointerDown}
                    onPointerLeave={onCanvasPointerLeave}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={onCanvasPointerUp}
                    onWheel={onWheel}
                    tabIndex={0}
                    viewBox={`0 0 ${size.width} ${size.height}`}
                    width={size.width}
                    style={{
                      cursor: dragState
                        ? 'grabbing'
                        : tool === 'draw-polygon'
                          ? 'crosshair'
                          : tool === 'place-control-point'
                            ? 'copy'
                            : tool === 'pan'
                              ? 'grab'
                              : 'default'
                    }}
                  >
                    {overlayPolygons.map(polygon => {
                      const points = polygon.vertices
                        .map(vertex => {
                          const screen = toScreenPoint(vertex);
                          return `${screen.x},${screen.z}`;
                        })
                        .join(' ');
                      const selected = selectedPolygonSet.has(polygon.id);
                      const highlighted = highlightedIslandPolygonIds.has(
                        polygon.id
                      );

                      return (
                        <polygon
                          key={polygon.id}
                          fill={
                            selected
                              ? 'rgba(244, 114, 182, 0.24)'
                              : highlighted
                                ? 'rgba(14, 165, 233, 0.22)'
                                : 'rgba(255,255,255,0.08)'
                          }
                          onClick={event => {
                            STOP_PROPAGATION(event);
                            setSelectedPolygonIds(selection =>
                              nextOrderedSelection(
                                selection,
                                polygon.id,
                                event.shiftKey
                              ),
                              true
                            );
                            setSelectedControlPointId(null);
                            setSelectedIslandId(null);
                            if (tool !== 'edit-vertices') {
                              setPolygonDraft(null);
                            }
                          }}
                          onPointerDown={STOP_PROPAGATION}
                          points={points}
                          stroke={
                            selected
                              ? '#f472b6'
                              : highlighted
                                ? '#38bdf8'
                                : 'rgba(255,255,255,0.4)'
                          }
                          strokeWidth={selected ? 3 : 2}
                        />
                      );
                    })}

                    {polygonDraft && (
                      <>
                        <polygon
                          fill={
                            polygonDraft.kind === 'create'
                              ? 'rgba(34,197,94,0.18)'
                              : 'rgba(250,204,21,0.18)'
                          }
                          points={polygonDraft.vertices
                            .map(vertex => {
                              const screen = toScreenPoint(vertex);
                              return `${screen.x},${screen.z}`;
                            })
                            .join(' ')}
                          stroke={
                            polygonDraft.kind === 'create'
                              ? '#22c55e'
                              : '#facc15'
                          }
                          strokeWidth={2}
                        />
                        {polygonDraft.vertices.map((vertex, index) => {
                          const screen = toScreenPoint(vertex);
                          const isFirst = index === 0;
                          const selected =
                            index === polygonDraft.selectedVertexIndex;

                          return (
                            <circle
                              key={`${vertex.x}:${vertex.z}:${index}`}
                              cx={screen.x}
                              cy={screen.z}
                              fill={
                                selected
                                  ? '#ffffff'
                                  : isFirst && tool === 'draw-polygon'
                                    ? '#86efac'
                                    : '#0f172a'
                              }
                              onClick={event => {
                                STOP_PROPAGATION(event);
                                if (
                                  tool === 'draw-polygon' &&
                                  isFirst &&
                                  canSavePolygonDraft(
                                    polygonDraft.vertices,
                                    polygonDraft.params
                                  )
                                ) {
                                  commitDrawPolygon();
                                  return;
                                }

                                setPolygonDraft(draft =>
                                  draft
                                    ? { ...draft, selectedVertexIndex: index }
                                    : draft,
                                  true
                                );
                              }}
                              onPointerDown={event => {
                                STOP_PROPAGATION(event);
                                if (tool !== 'edit-vertices') {
                                  return;
                                }

                                interactionRef.current?.setPointerCapture(
                                  event.pointerId
                                );
                                setDragState({
                                  kind: 'vertex',
                                  pointerId: event.pointerId,
                                  vertexIndex: index
                                });
                                setPolygonDraft(draft =>
                                  draft
                                    ? { ...draft, selectedVertexIndex: index }
                                    : draft
                                );
                              }}
                              r={isFirst && tool === 'draw-polygon' ? 8 : 6}
                              stroke={selected ? '#22c55e' : '#ffffff'}
                              strokeWidth={2}
                            />
                          );
                        })}
                        {tool === 'edit-vertices' &&
                          polygonDraft.vertices.map((vertex, index) => {
                            const next =
                              polygonDraft.vertices[
                                (index + 1) % polygonDraft.vertices.length
                              ];
                            if (!next) {
                              return null;
                            }

                            const from = toScreenPoint(vertex);
                            const to = toScreenPoint(next);

                            return (
                              <line
                                key={`edge-${index}`}
                                onClick={event => {
                                  STOP_PROPAGATION(event);
                                  const world = toWorldPoint(
                                    event as unknown as PointerEvent<SVGSVGElement>
                                  );
                                  const insertAt = getPolygonEdgeInsertPosition(
                                    vertex,
                                    next,
                                    world
                                  );
                                  setPolygonDraft(draft =>
                                    draft
                                      ? {
                                          ...draft,
                                          selectedVertexIndex: index + 1,
                                          vertices: [
                                            ...draft.vertices.slice(
                                              0,
                                              index + 1
                                            ),
                                            insertAt,
                                            ...draft.vertices.slice(index + 1)
                                          ]
                                        }
                                      : draft,
                                    true
                                  );
                                }}
                                onPointerDown={STOP_PROPAGATION}
                                stroke="transparent"
                                strokeWidth={14}
                                x1={from.x}
                                x2={to.x}
                                y1={from.z}
                                y2={to.z}
                              />
                            );
                          })}
                      </>
                    )}

                    {controlPoints.map(point => {
                      const screen = toScreenPoint(point);
                      const selected = point.id === selectedControlPointId;
                      return (
                        <g key={point.id}>
                          <circle
                            cx={screen.x}
                            cy={screen.z}
                            fill={selected ? '#f97316' : '#e2e8f0'}
                            onClick={event => {
                              STOP_PROPAGATION(event);
                              setSelectedControlPointId(point.id);
                              setSelectedPolygonIds([]);
                              setSelectedIslandId(null);
                              setPolygonDraft(null);
                            }}
                            onPointerDown={event => {
                              STOP_PROPAGATION(event);
                              interactionRef.current?.setPointerCapture(
                                event.pointerId
                              );
                              setSelectedControlPointId(point.id);
                              setSelectedPolygonIds([]);
                              setSelectedIslandId(null);
                              setDragState({
                                kind: 'control-point',
                                pointId: point.id,
                                pointerId: event.pointerId
                              });
                            }}
                            r={7}
                            stroke="#0f172a"
                            strokeWidth={2}
                          />
                          {(selected || controlPointDraft?.id === point.id) && (
                            <circle
                              cx={screen.x}
                              cy={screen.z}
                              fill="transparent"
                              pointerEvents="none"
                              r={
                                ((controlPointDraft?.id === point.id
                                  ? controlPointDraft.influenceMeters
                                  : point.influenceMeters) /
                                  map.resolution.metersPerTile) *
                                viewport.zoom
                              }
                              stroke="rgba(249,115,22,0.45)"
                              strokeDasharray="8 6"
                              strokeWidth={2}
                            />
                          )}
                        </g>
                      );
                    })}

                    {controlPointDraft && (
                      <>
                        <circle
                          cx={toScreenPoint(controlPointDraft).x}
                          cy={toScreenPoint(controlPointDraft).z}
                          fill="transparent"
                          pointerEvents="none"
                          r={
                            (controlPointDraft.influenceMeters /
                              map.resolution.metersPerTile) *
                            viewport.zoom
                          }
                          stroke="rgba(251,146,60,0.4)"
                          strokeDasharray="8 6"
                          strokeWidth={2}
                        />
                        <circle
                          cx={toScreenPoint(controlPointDraft).x}
                          cy={toScreenPoint(controlPointDraft).z}
                          fill="#fb923c"
                          pointerEvents="none"
                          r={8}
                          stroke="#fff7ed"
                          strokeWidth={2}
                        />
                      </>
                    )}
                  </svg>
                </div>
                <div className="absolute right-3 bottom-3 flex gap-1">
                  <Button
                    className="h-8 w-8"
                    onClick={zoomIn}
                    size="icon"
                    title="Zoom in"
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-8 w-8"
                    onClick={zoomOut}
                    size="icon"
                    title="Zoom out"
                    variant="secondary"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-8 w-8"
                    onClick={fitToView}
                    size="icon"
                    title="Reset view"
                    variant="secondary"
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Infinite · Zoom {zoomPercent}%</span>
            <span>
              {tool === 'draw-polygon'
                ? 'Click to place vertices · Enter or first vertex to save · Esc to cancel'
                : 'Drag to pan · Scroll to zoom · Delete removes selected items'}
            </span>
          </div>
        </div>
      </CardShell>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-2xl font-semibold leading-none tracking-tight">
          Terrain Editor
        </h3>
        <p className="text-sm text-muted-foreground">
          Drag to pan, scroll to zoom, click to author objects, and use
          shift-click for ordered boolean selection.
        </p>
      </div>
      <div className="p-6 pt-0">{children}</div>
    </div>
  );
}
