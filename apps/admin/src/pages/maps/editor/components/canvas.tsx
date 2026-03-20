import type {
  ControlPoint,
  MapMetadata,
  WorldPoint
} from 'carrier-contracts/types';
import { Home, Minus, Plus } from 'lucide-react';
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  Ref,
  RefObject,
  WheelEvent
} from 'react';

import { MapStage } from '@/components/map-viewer/map-stage';
import { Button } from '@/components/ui/button';
import type { Viewport } from '@/hooks/use-map-viewport';

import {
  canSavePolygonDraft,
  getPolygonEdgeInsertPosition,
  type EditorTool
} from '../helpers';
import { STOP_PROPAGATION, translateWorldPoint } from '../helpers/drafts';
import type {
  CanvasDragState,
  ControlPointDraft,
  PolygonDraft,
  SourcePolygonLike
} from '../helpers/types';

type EditorCanvasProps = {
  chunks: ReturnType<typeof import('@/hooks/use-map-chunks').useMapChunks>;
  commitDrawPolygon: () => void;
  containerRef: Ref<HTMLDivElement>;
  controlPointDraft: ControlPointDraft | null;
  controlPoints: ControlPoint[];
  dragState: CanvasDragState;
  fitToView: () => void;
  highlightedIslandPolygonIds: Set<string>;
  interactionRef: RefObject<SVGSVGElement | null>;
  map: MapMetadata;
  onCanvasClick: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
  onCanvasPointerCancel: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerLeave: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  onControlPointClick: (
    event: MouseEvent<SVGCircleElement>,
    point: ControlPoint
  ) => void;
  onControlPointPointerDown: (
    event: PointerEvent<SVGCircleElement>,
    point: ControlPoint
  ) => void;
  onPolygonClick: (
    event: MouseEvent<SVGPolygonElement>,
    polygon: SourcePolygonLike
  ) => void;
  onPolygonPointerDown: (
    event: PointerEvent<SVGPolygonElement>,
    polygon: SourcePolygonLike
  ) => void;
  onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  onWheelCapture: (event: WheelEvent<HTMLDivElement>) => void;
  overlayPolygons: SourcePolygonLike[];
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
  size: { height: number; width: number };
  tool: EditorTool;
  toScreenPoint: (point: Pick<WorldPoint, 'x' | 'z'>) => {
    x: number;
    z: number;
  };
  toWorldPoint: (event: { clientX: number; clientY: number }) => WorldPoint;
  viewport: Viewport;
  zoomIn: () => void;
  zoomOut: () => void;
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
  onControlPointClick,
  onControlPointPointerDown,
  onPolygonClick,
  onPolygonPointerDown,
  onWheel,
  onWheelCapture,
  overlayPolygons,
  polygonDraft,
  selectedControlPointId,
  selectedPolygonIds,
  setDragState,
  setPolygonDraft,
  size,
  tool,
  toScreenPoint,
  toWorldPoint,
  viewport,
  zoomIn,
  zoomOut
}: EditorCanvasProps) {
  const selectedPolygonSet = new Set(selectedPolygonIds);
  const zoomPercent = Math.round(viewport.zoom * 100);
  const showEditVertices =
    polygonDraft?.kind === 'edit' &&
    (tool === 'select' || tool === 'edit-vertices');
  const previewDraftVertices =
    dragState?.kind === 'polygon' &&
    polygonDraft &&
    dragState.polygons.length === 1 &&
    dragState.polygons[0]?.id === polygonDraft.id
      ? polygonDraft.vertices.map(vertex =>
          translateWorldPoint(vertex, dragState.currentDelta)
        )
      : (polygonDraft?.vertices ?? []);
  const marqueeBounds = dragState?.kind === 'marquee' ? dragState.bounds : null;

  return (
    <div className="space-y-4">
      <CardShell>
        <div className="flex flex-col gap-2">
          <div
            className="relative h-[640px] w-full min-w-0 overflow-hidden rounded-md border bg-[#0a1320]"
            data-testid="editor-stage"
            ref={containerRef}
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
                    ref={interactionRef}
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
                    tabIndex={0}
                    viewBox={`0 0 ${size.width} ${size.height}`}
                    width={size.width}
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
                          data-polygon-id={polygon.id}
                          fill={
                            selected
                              ? 'rgba(244, 114, 182, 0.24)'
                              : highlighted
                                ? 'rgba(14, 165, 233, 0.22)'
                                : 'rgba(255,255,255,0.08)'
                          }
                          key={polygon.id}
                          onClick={event => {
                            STOP_PROPAGATION(event);
                            onPolygonClick(event, polygon);
                          }}
                          onPointerDown={event =>
                            onPolygonPointerDown(event, polygon)
                          }
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

                    {polygonDraft &&
                      (() => {
                        const draftAsSource: SourcePolygonLike | null =
                          polygonDraft.kind === 'edit' && polygonDraft.id
                            ? {
                                id: polygonDraft.id,
                                params: polygonDraft.params,
                                vertices: previewDraftVertices
                              }
                            : null;
                        return (
                          <>
                            <polygon
                              fill={
                                polygonDraft.kind === 'create'
                                  ? 'rgba(34,197,94,0.18)'
                                  : 'rgba(250,204,21,0.18)'
                              }
                              onClick={event => {
                                if (!draftAsSource) {
                                  return;
                                }

                                STOP_PROPAGATION(event);
                                onPolygonClick(event, draftAsSource);
                              }}
                              onPointerDown={event => {
                                if (!draftAsSource) {
                                  return;
                                }

                                onPolygonPointerDown(event, draftAsSource);
                              }}
                              points={previewDraftVertices
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
                            {previewDraftVertices.map((vertex, index) => {
                              const screen = toScreenPoint(vertex);
                              const isFirst = index === 0;
                              const selected =
                                index === polygonDraft.selectedVertexIndex;

                              return (
                                <circle
                                  cx={screen.x}
                                  cy={screen.z}
                                  fill={
                                    selected
                                      ? '#ffffff'
                                      : isFirst && tool === 'draw-polygon'
                                        ? '#86efac'
                                        : '#0f172a'
                                  }
                                  key={`${vertex.x}:${vertex.z}:${index}`}
                                  onClick={event => {
                                    STOP_PROPAGATION(event);
                                    if (
                                      tool === 'draw-polygon' &&
                                      isFirst &&
                                      canSavePolygonDraft(
                                        previewDraftVertices,
                                        polygonDraft.params
                                      )
                                    ) {
                                      commitDrawPolygon();
                                      return;
                                    }

                                    setPolygonDraft(
                                      draft =>
                                        draft
                                          ? {
                                              ...draft,
                                              selectedVertexIndex: index
                                            }
                                          : draft,
                                      true
                                    );
                                  }}
                                  onPointerDown={event => {
                                    STOP_PROPAGATION(event);
                                    if (!showEditVertices) {
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
                                        ? {
                                            ...draft,
                                            selectedVertexIndex: index
                                          }
                                        : draft
                                    );
                                  }}
                                  r={isFirst && tool === 'draw-polygon' ? 8 : 6}
                                  stroke={selected ? '#22c55e' : '#ffffff'}
                                  strokeWidth={2}
                                />
                              );
                            })}
                            {showEditVertices &&
                              previewDraftVertices.map((vertex, index) => {
                                const next =
                                  previewDraftVertices[
                                    (index + 1) % previewDraftVertices.length
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
                                      if (!showEditVertices) {
                                        return;
                                      }
                                      const world = toWorldPoint(
                                        event as unknown as PointerEvent<SVGSVGElement>
                                      );
                                      const insertAt =
                                        getPolygonEdgeInsertPosition(
                                          vertex,
                                          next,
                                          world
                                        );
                                      setPolygonDraft(
                                        draft =>
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
                                                  ...draft.vertices.slice(
                                                    index + 1
                                                  )
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
                        );
                      })()}

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
                              onControlPointClick(event, point);
                            }}
                            onPointerDown={event =>
                              onControlPointPointerDown(event, point)
                            }
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

                    {controlPointDraft &&
                      (() => {
                        const screenDraft = toScreenPoint(controlPointDraft);
                        return (
                          <>
                            <circle
                              cx={screenDraft.x}
                              cy={screenDraft.z}
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
                              cx={screenDraft.x}
                              cy={screenDraft.z}
                              fill="#fb923c"
                              pointerEvents="none"
                              r={8}
                              stroke="#fff7ed"
                              strokeWidth={2}
                            />
                          </>
                        );
                      })()}

                    {marqueeBounds &&
                      (() => {
                        const screenMin = toScreenPoint({
                          x: marqueeBounds.minX,
                          z: marqueeBounds.minZ
                        });
                        const screenMax = toScreenPoint({
                          x: marqueeBounds.maxX,
                          z: marqueeBounds.maxZ
                        });
                        return (
                          <rect
                            fill="rgba(56, 189, 248, 0.16)"
                            height={Math.abs(screenMax.z - screenMin.z) || 1}
                            pointerEvents="none"
                            stroke="#38bdf8"
                            strokeDasharray="8 4"
                            strokeWidth={2}
                            width={Math.abs(screenMax.x - screenMin.x) || 1}
                            x={Math.min(screenMin.x, screenMax.x)}
                            y={Math.min(screenMin.z, screenMax.z)}
                          />
                        );
                      })()}
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
                : tool === 'pan'
                  ? 'Drag to pan · Scroll to zoom · Delete removes selected items'
                  : 'Click to select · Drag selected polygon to move · Drag empty space for marquee'}
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
          Use pan for viewport movement, select for editing, and shift-click for
          ordered boolean selection.
        </p>
      </div>
      <div className="p-6 pt-0">{children}</div>
    </div>
  );
}
