import type {
  AssetVersion,
  ControlPoint,
  MapMetadata,
  StaticEntity,
  WorldPoint
} from 'carrier-contracts/types';
import { Home, Minus, Plus } from 'lucide-react';
import {
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
  type WheelEvent
} from 'react';

import { MapStage } from '@/components/map-viewer/map-stage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Viewport } from '@/hooks/use-map-viewport';
import { cn } from '@/lib/utils';

import {
  canSavePolygonDraft,
  type StaticEntityGroundingDiagnostics,
  getStaticEntityFacingIndicator,
  getStaticEntityOverlayGeometry,
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

type StaticEntityCanvasItem = {
  assetVersion: Pick<AssetVersion, 'footprint'> | null;
  diagnostics: StaticEntityGroundingDiagnostics;
  entity: StaticEntity;
};

type EditorCanvasProps = {
  chunks: ReturnType<typeof import('@/hooks/use-map-chunks').useMapChunks>;
  commitDrawPolygon: () => void;
  containerRef: Ref<HTMLDivElement>;
  controlPointDraft: ControlPointDraft | null;
  controlPoints: ControlPoint[];
  dragState: CanvasDragState;
  entityItems: StaticEntityCanvasItem[];
  fitToView: () => void;
  highlightedIslandPolygonIds: Set<string>;
  interactionRef: RefObject<SVGSVGElement | null>;
  map: MapMetadata;
  nextActionHint: string;
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
  onStaticEntityClick: (
    event: MouseEvent<SVGElement>,
    entity: StaticEntity
  ) => void;
  onStaticEntityPointerDown: (
    event: PointerEvent<SVGElement>,
    entity: StaticEntity
  ) => void;
  onStaticEntityRotatePointerDown: (
    event: PointerEvent<SVGCircleElement>,
    entity: StaticEntity
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
  selectedEntityIds: string[];
  selectedPolygonIds: string[];
  selectionSummary: string;
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
  toolLabel: string;
  toScreenPoint: (point: Pick<WorldPoint, 'x' | 'z'>) => {
    x: number;
    z: number;
  };
  toWorldPoint: (event: { clientX: number; clientY: number }) => WorldPoint;
  viewport: Viewport;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const EditorCanvas = ({
  chunks,
  commitDrawPolygon,
  containerRef,
  controlPointDraft,
  controlPoints,
  dragState,
  entityItems,
  fitToView,
  highlightedIslandPolygonIds,
  interactionRef,
  map,
  nextActionHint,
  onCanvasClick,
  onCanvasKeyDown,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerLeave,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onControlPointClick,
  onControlPointPointerDown,
  onStaticEntityClick,
  onStaticEntityPointerDown,
  onStaticEntityRotatePointerDown,
  onPolygonClick,
  onPolygonPointerDown,
  onWheel,
  onWheelCapture,
  overlayPolygons,
  polygonDraft,
  selectedControlPointId,
  selectedEntityIds,
  selectedPolygonIds,
  selectionSummary,
  setDragState,
  setPolygonDraft,
  size,
  tool,
  toolLabel,
  toScreenPoint,
  toWorldPoint,
  viewport,
  zoomIn,
  zoomOut
}: EditorCanvasProps) => {
  const selectedPolygonSet = useMemo(() => new Set(selectedPolygonIds), [selectedPolygonIds]);
  const selectedEntitySet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds]);
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
  const multiSelectActive = selectedPolygonIds.length > 1;
  const entityMultiSelectActive = selectedEntityIds.length > 1;
  const draftVertexCount = polygonDraft?.vertices.length ?? 0;

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Active Workspace
            </div>
            <div className="text-2xl font-semibold tracking-tight">
              {toolLabel}
            </div>
            <p className="text-sm text-muted-foreground">{nextActionHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="rounded-md px-3 py-1 text-[11px]"
              variant="outline"
            >
              {selectionSummary}
            </Badge>
            <Badge
              className={cn(
                'rounded-md px-3 py-1 text-[11px]',
                tool === 'draw-polygon' && draftVertexCount > 0
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : undefined
              )}
              variant="secondary"
            >
              {tool === 'draw-polygon'
                ? `${draftVertexCount} draft vertices`
                : `Zoom ${zoomPercent}%`}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div
            className="relative h-[680px] w-full min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-[#071220]"
            data-testid="editor-stage"
            ref={containerRef}
          >
            {size.width > 0 && size.height > 0 && (
              <>
                <div className="pointer-events-none absolute inset-0 z-0 [&_canvas]:pointer-events-none">
                  <MapStage
                    canvasHeight={size.height}
                    canvasWidth={size.width}
                    chunks={chunks}
                    map={map}
                    viewport={viewport}
                  />
                </div>
                <div
                  className="absolute inset-0 z-10"
                  onWheelCapture={onWheelCapture}
                >
                  <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(60%,420px)] flex-col gap-2">
                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/88 px-3 py-2 text-left shadow-lg backdrop-blur">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className="rounded-md bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-100 hover:bg-sky-500/15"
                          variant="secondary"
                        >
                          {toolLabel}
                        </Badge>
                        <span className="text-sm font-medium text-slate-50">
                          {selectionSummary}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-300">
                        {nextActionHint}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>Scroll to zoom</span>
                        <span>Drag to pan in pan mode</span>
                        <span>Esc clears drafts or selection</span>
                      </div>
                    </div>
                  </div>
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
                    {entityItems.map(item => {
                      const selected = selectedEntitySet.has(item.entity.id);
                      const overlay = item.assetVersion
                        ? getStaticEntityOverlayGeometry({
                            assetVersion: item.assetVersion,
                            entity: item.entity
                          })
                        : null;
                      const facingPoint = getStaticEntityFacingIndicator({
                        entity: item.entity,
                        lengthMeters:
                          (item.assetVersion?.footprint.depthMeters ?? 10) * 0.5 + 4
                      });
                      const anchor = toScreenPoint(item.entity.position);
                      const facingScreen = toScreenPoint(facingPoint);
                      const handleScreen = overlay
                        ? toScreenPoint(overlay.handle)
                        : null;
                      const footprintPoints = overlay
                        ? overlay.corners
                            .map(point => {
                              const screen = toScreenPoint(point);
                              return `${screen.x},${screen.z}`;
                            })
                            .join(' ')
                        : '';
                      const disabled = item.entity.state === 'disabled';
                      const warning = item.diagnostics.status === 'warning';
                      const stroke = disabled
                        ? '#94a3b8'
                        : selected
                          ? entityMultiSelectActive
                            ? '#60a5fa'
                            : warning
                              ? '#f59e0b'
                              : '#34d399'
                          : warning
                            ? '#f59e0b'
                            : '#cbd5f5';
                      const fill = disabled
                        ? 'rgba(148,163,184,0.12)'
                        : selected
                          ? entityMultiSelectActive
                            ? 'rgba(96,165,250,0.18)'
                            : 'rgba(52,211,153,0.18)'
                          : warning
                            ? 'rgba(245,158,11,0.14)'
                            : 'rgba(148,163,184,0.08)';

                      return (
                        <g key={item.entity.id}>
                          {overlay ? (
                            <polygon
                              data-testid="editor-static-entity"
                              fill={fill}
                              onClick={event => {
                                STOP_PROPAGATION(event);
                                onStaticEntityClick(
                                  event as unknown as MouseEvent<SVGElement>,
                                  item.entity
                                );
                              }}
                              onPointerDown={event =>
                                onStaticEntityPointerDown(
                                  event as unknown as PointerEvent<SVGElement>,
                                  item.entity
                                )
                              }
                              points={footprintPoints}
                              stroke={stroke}
                              strokeDasharray={disabled ? '10 6' : undefined}
                              strokeWidth={selected ? 3 : 2}
                            />
                          ) : null}
                          <line
                            pointerEvents="none"
                            stroke={stroke}
                            strokeWidth={2}
                            x1={anchor.x}
                            x2={facingScreen.x}
                            y1={anchor.z}
                            y2={facingScreen.z}
                          />
                          <circle
                            cx={anchor.x}
                            cy={anchor.z}
                            fill={selected ? '#ffffff' : stroke}
                            onClick={event => {
                              STOP_PROPAGATION(event);
                              onStaticEntityClick(
                                event as unknown as MouseEvent<SVGElement>,
                                item.entity
                              );
                            }}
                            onPointerDown={event =>
                              onStaticEntityPointerDown(
                                event as unknown as PointerEvent<SVGElement>,
                                item.entity
                              )
                            }
                            r={selected ? 7 : 5}
                            stroke={stroke}
                            strokeWidth={2}
                          />
                          {selected &&
                          selectedEntityIds.length === 1 &&
                          handleScreen &&
                          tool === 'select' ? (
                            <>
                              <line
                                pointerEvents="none"
                                stroke={stroke}
                                strokeDasharray="6 4"
                                strokeWidth={2}
                                x1={facingScreen.x}
                                x2={handleScreen.x}
                                y1={facingScreen.z}
                                y2={handleScreen.z}
                              />
                              <circle
                                cx={handleScreen.x}
                                cy={handleScreen.z}
                                data-testid="editor-static-entity-rotate-handle"
                                fill="#0f172a"
                                onPointerDown={event =>
                                  onStaticEntityRotatePointerDown(
                                    event,
                                    item.entity
                                  )
                                }
                                r={6}
                                stroke={stroke}
                                strokeWidth={2}
                              />
                            </>
                          ) : null}
                        </g>
                      );
                    })}

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
                              ? multiSelectActive
                                ? 'rgba(168, 85, 247, 0.24)'
                                : 'rgba(244, 114, 182, 0.26)'
                              : highlighted
                                ? 'rgba(34, 211, 238, 0.18)'
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
                              ? multiSelectActive
                                ? '#a855f7'
                                : '#f472b6'
                              : highlighted
                                ? '#22d3ee'
                                : 'rgba(255,255,255,0.4)'
                          }
                          strokeDasharray={
                            selected && multiSelectActive ? '10 6' : undefined
                          }
                          strokeWidth={selected ? 3.5 : highlighted ? 2.5 : 2}
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
                                  ? 'rgba(34,197,94,0.22)'
                                  : 'rgba(250,204,21,0.22)'
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
                              strokeWidth={3}
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
                                        : '#082f49'
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
                                  r={
                                    selected
                                      ? 7
                                      : isFirst && tool === 'draw-polygon'
                                        ? 8
                                        : 6
                                  }
                                  stroke={selected ? '#22c55e' : '#ffffff'}
                                  strokeWidth={selected ? 3 : 2}
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
                                    stroke="rgba(250, 204, 21, 0.01)"
                                    strokeWidth={18}
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
                      const visualRadius = selected ? 8 : 7;
                      return (
                        <g key={point.id}>
                          <circle
                            cx={screen.x}
                            cy={screen.z}
                            data-testid="editor-control-point-handle"
                            fill="rgba(0,0,0,0.001)"
                            onClick={event => {
                              STOP_PROPAGATION(event);
                              onControlPointClick(event, point);
                            }}
                            onPointerDown={event =>
                              onControlPointPointerDown(event, point)
                            }
                            pointerEvents="all"
                            r={Math.max(18, visualRadius + 10)}
                          />
                          <circle
                            cx={screen.x}
                            cy={screen.z}
                            fill={selected ? '#fb923c' : '#e2e8f0'}
                            pointerEvents="none"
                            r={visualRadius}
                            stroke={selected ? '#fff7ed' : '#0f172a'}
                            strokeWidth={selected ? 3 : 2}
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
                              stroke="rgba(251,146,60,0.6)"
                              strokeDasharray="10 6"
                              strokeWidth={2.5}
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
                              strokeDasharray="10 6"
                              strokeWidth={2.5}
                            />
                            <circle
                              cx={screenDraft.x}
                              cy={screenDraft.z}
                              fill="#fb923c"
                              pointerEvents="none"
                              r={9}
                              stroke="#fff7ed"
                              strokeWidth={3}
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
                <div className="absolute right-3 bottom-3 z-10 flex gap-1 rounded-xl border border-slate-800/80 bg-slate-950/80 p-1 shadow-lg backdrop-blur">
                  <Button
                    className="h-9 w-9 rounded-lg"
                    onClick={zoomIn}
                    size="icon"
                    title="Zoom in"
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-9 w-9 rounded-lg"
                    onClick={zoomOut}
                    size="icon"
                    title="Zoom out"
                    variant="secondary"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-9 w-9 rounded-lg"
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
          <div className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Infinite map</span>
              <span>Zoom {zoomPercent}%</span>
              {tool === 'draw-polygon' ? (
                <span>{draftVertexCount} vertices in current draft</span>
              ) : null}
            </div>
            <span>{nextActionHint}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
