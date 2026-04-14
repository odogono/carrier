import type {
  AssetVersion,
  BooleanOperation,
  ControlPoint,
  MapMetadata,
  StaticEntity,
  WorldPoint,
  ZarchTileEditConfig
} from 'carrier-contracts/types';
import type {
  ZarchTileDraftEdits,
  ZarchTileEditTool,
  ZarchTileState
} from 'carrier-terrain-edit';
import {
  CircleHelp,
  Combine,
  Crosshair,
  GitBranchPlus,
  Hand,
  Home,
  Layers3,
  MapPinPlus,
  Minus,
  Move,
  PackagePlus,
  Plus,
  Redo2,
  Save,
  ScanSearch,
  Undo2
} from 'lucide-react';
import {
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
  type WheelEvent
} from 'react';

import { MapStage } from '@/components/map-viewer/map-stage';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import type { Viewport } from '@/hooks/use-map-viewport';
import {
  TERRAIN_RENDER_LAYER_OPTIONS,
  getTerrainRenderLegend,
  type TerrainRenderLayer
} from '@/lib/terrain-render';
import { cn } from '@/lib/utils';

import {
  canSavePolygonDraft,
  getPolygonEdgeInsertPosition,
  getStaticEntityFacingIndicator,
  getStaticEntityOverlayGeometry,
  type EditorTool,
  type StaticEntityGroundingDiagnostics
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

const fallbackStaticEntityFootprint: Pick<AssetVersion, 'footprint'> = {
  footprint: {
    depthMeters: 10,
    widthMeters: 10
  }
};

const renderTerrainTileRect = (
  rect: { height: number; width: number; x: number; z: number },
  key: string,
  fill: string,
  stroke: string,
  strokeWidth: number,
  strokeDasharray?: string
) => (
  <rect
    fill={fill}
    height={rect.height}
    key={key}
    pointerEvents="none"
    stroke={stroke}
    strokeDasharray={strokeDasharray}
    strokeWidth={strokeWidth}
    width={rect.width}
    x={rect.x}
    y={rect.z}
  />
);

const toolOptions: Array<{
  icon: typeof ScanSearch;
  title: string;
  tool: EditorTool;
}> = [
  { icon: ScanSearch, title: 'Select', tool: 'select' },
  { icon: Hand, title: 'Pan', tool: 'pan' },
  { icon: Layers3, title: 'Terrain', tool: 'terrain' as EditorTool },
  { icon: PackagePlus, title: 'Place Entity', tool: 'place-entity' },
  { icon: GitBranchPlus, title: 'Draw Polygon', tool: 'draw-polygon' },
  { icon: Move, title: 'Edit Vertices', tool: 'edit-vertices' },
  { icon: MapPinPlus, title: 'Add Control Point', tool: 'place-control-point' }
];

type EditorCanvasProps = {
  availableTools: EditorTool[];
  booleanActionsVisible: boolean;
  canApplyUnionLike: boolean;
  canFocusSelection: boolean;
  canRedo: boolean;
  canUndo: boolean;
  chunks: ReturnType<typeof import('@/hooks/use-map-chunks').useMapChunks>;
  commitDrawPolygon: () => void;
  containerRef: Ref<HTMLDivElement>;
  controlPointDraft: ControlPointDraft | null;
  controlPoints: ControlPoint[];
  dragState: CanvasDragState;
  editConfig: ZarchTileEditConfig | null;
  entityItems: StaticEntityCanvasItem[];
  fitToView: () => void;
  highlightedIslandPolygonIds: Set<string>;
  interactionRef: RefObject<SVGSVGElement | null>;
  map: MapMetadata;
  nextActionHint: string;
  onApplyBoolean: (operation: BooleanOperation) => void;
  onApplyTerrainHeightSelection: (mode: 'flatten' | 'raise' | 'lower') => void;
  onApplyTerrainTypeSelection: (typeId: string) => void;
  onBeginControlPoint: () => void;
  onBeginDrawPolygon: () => void;
  onBeginPlaceEntity: () => void;
  onBeginVertexEdit: () => void;
  onCanvasClick: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
  onCanvasPointerCancel: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerLeave: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  onClearTerrainSelection: () => void;
  onControlPointClick: (
    event: MouseEvent<SVGCircleElement>,
    point: ControlPoint
  ) => void;
  onControlPointPointerDown: (
    event: PointerEvent<SVGCircleElement>,
    point: ControlPoint
  ) => void;
  onFocusSelection: () => void;
  onPolygonClick: (
    event: MouseEvent<SVGPolygonElement>,
    polygon: SourcePolygonLike
  ) => void;
  onPolygonPointerDown: (
    event: PointerEvent<SVGPolygonElement>,
    polygon: SourcePolygonLike
  ) => void;
  onRedo: () => void;
  onResetTerrainEdits: () => void;
  onSaveTerrainEdits: () => void;
  onSelectTool: (tool: EditorTool) => void;
  onSetTerrainColorIndex: (colorIndex: number | null) => void;
  onSetTerrainLayer: (layer: TerrainRenderLayer) => void;
  onSetTerrainTool: (tool: ZarchTileEditTool) => void;
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
  onUndo: () => void;
  onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  onWheelCapture: (event: WheelEvent<HTMLDivElement>) => void;
  overlayPolygons: SourcePolygonLike[];
  pendingAction: boolean;
  polygonDraft: PolygonDraft | null;
  selectedControlPointId: string | null;
  selectedEntityIds: string[];
  selectedPolygon: boolean;
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
  terrainDirtyCount: number;
  terrainDraftEdits?: ZarchTileDraftEdits;
  terrainHeightSelectionTiles: Array<{ tileX: number; tileZ: number }>;
  terrainHoveredTile: { tileX: number; tileZ: number } | null;
  terrainInspectedTile: ZarchTileState | null;
  terrainPreviewHaloTiles: Array<{ tileX: number; tileZ: number }>;
  terrainRenderLayer: TerrainRenderLayer;
  terrainSavePending: boolean;
  terrainSelectedColorIndex: number | null;
  terrainSelectedHeightTileCount: number;
  terrainSelectedTile: { tileX: number; tileZ: number } | null;
  terrainSelectedTypeId: string;
  terrainTool: ZarchTileEditTool;
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
  availableTools,
  booleanActionsVisible,
  canApplyUnionLike,
  canFocusSelection,
  canRedo,
  canUndo,
  chunks,
  commitDrawPolygon,
  containerRef,
  controlPointDraft,
  controlPoints,
  dragState,
  editConfig,
  entityItems,
  fitToView,
  highlightedIslandPolygonIds,
  interactionRef,
  map,
  nextActionHint,
  onApplyBoolean,
  onApplyTerrainHeightSelection,
  onApplyTerrainTypeSelection,
  onBeginControlPoint,
  onBeginDrawPolygon,
  onBeginPlaceEntity,
  onBeginVertexEdit,
  onCanvasClick,
  onCanvasKeyDown,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerLeave,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onClearTerrainSelection,
  onControlPointClick,
  onControlPointPointerDown,
  onFocusSelection,
  onPolygonClick,
  onPolygonPointerDown,
  onRedo,
  onResetTerrainEdits,
  onSaveTerrainEdits,
  onSelectTool,
  onSetTerrainColorIndex,
  onSetTerrainLayer,
  onSetTerrainTool,
  onStaticEntityClick,
  onStaticEntityPointerDown,
  onStaticEntityRotatePointerDown,
  onUndo,
  onWheel,
  onWheelCapture,
  overlayPolygons,
  pendingAction,
  polygonDraft,
  selectedControlPointId,
  selectedEntityIds,
  selectedPolygon,
  selectedPolygonIds,
  selectionSummary,
  setDragState,
  setPolygonDraft,
  size,
  terrainDirtyCount,
  terrainDraftEdits,
  terrainHeightSelectionTiles,
  terrainHoveredTile,
  terrainInspectedTile,
  terrainPreviewHaloTiles,
  terrainRenderLayer,
  terrainSavePending,
  terrainSelectedColorIndex,
  terrainSelectedHeightTileCount,
  terrainSelectedTile,
  terrainSelectedTypeId,
  terrainTool,
  tool,
  toolLabel,
  toScreenPoint,
  toWorldPoint,
  viewport,
  zoomIn,
  zoomOut
}: EditorCanvasProps) => {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const selectedPolygonSet = useMemo(
    () => new Set(selectedPolygonIds),
    [selectedPolygonIds]
  );
  const selectedEntitySet = useMemo(
    () => new Set(selectedEntityIds),
    [selectedEntityIds]
  );
  const terrainLegendItems = useMemo(
    () => getTerrainRenderLegend(terrainRenderLayer, editConfig),
    [editConfig, terrainRenderLayer]
  );
  const tileTypePalette = useMemo(
    () => editConfig?.tileTypes ?? [],
    [editConfig]
  );
  const colorPalette = useMemo(() => editConfig?.palette ?? [], [editConfig]);
  const isColorOverrideMode = terrainRenderLayer === 'color-overrides';
  const zoomPercent = Math.round(viewport.zoom * 100);
  const terrainHoverReadout = terrainInspectedTile
    ? `Tile ${terrainInspectedTile.tileX}, ${terrainInspectedTile.tileZ} · ${terrainInspectedTile.heightSteps} steps · ${terrainInspectedTile.typeId}`
    : 'Hover a tile to inspect terrain';
  const actionDockTitle =
    terrainTool === 'height'
      ? 'Height actions'
      : terrainRenderLayer === 'color-overrides'
        ? 'Color actions'
        : 'Type actions';
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
  const metersPerTile = map.resolution.metersPerTile;
  const tileToScreenRect = useMemo(
    () => (tileX: number, tileZ: number) => {
      const topLeft = toScreenPoint({
        x: tileX * metersPerTile,
        z: tileZ * metersPerTile
      });
      const bottomRight = toScreenPoint({
        x: (tileX + 1) * metersPerTile,
        z: (tileZ + 1) * metersPerTile
      });

      return {
        height: bottomRight.z - topLeft.z,
        width: bottomRight.x - topLeft.x,
        x: topLeft.x,
        z: topLeft.z
      };
    },
    [metersPerTile, toScreenPoint]
  );

  return (
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
                draftEdits={terrainDraftEdits}
                editConfig={editConfig}
                map={map}
                renderLayer={terrainRenderLayer}
                viewport={viewport}
              />
            </div>
            <div
              className="absolute inset-0 z-10"
              onWheelCapture={onWheelCapture}
            >
              <div
                className="absolute left-3 top-3 z-20 flex w-44 flex-col gap-1 rounded-lg border border-slate-800/80 bg-slate-950/85 p-1 shadow-lg backdrop-blur"
                data-testid="editor-tool-rail"
              >
                {toolOptions
                  .filter(option => availableTools.includes(option.tool))
                  .map(option => {
                    const isActive = tool === option.tool;
                    const Icon = option.icon;
                    const handleClick = () => {
                      if (option.tool === 'draw-polygon') {
                        onBeginDrawPolygon();
                      } else if (option.tool === 'place-entity') {
                        onBeginPlaceEntity();
                      } else if (option.tool === 'edit-vertices') {
                        onBeginVertexEdit();
                      } else if (option.tool === 'place-control-point') {
                        onBeginControlPoint();
                      } else {
                        onSelectTool(option.tool);
                      }
                    };
                    return (
                      <Button
                        className={cn(
                          'h-9 justify-start rounded-md px-2 text-xs',
                          isActive && 'ring-1 ring-sky-400/60'
                        )}
                        disabled={
                          option.tool === 'edit-vertices' && !selectedPolygon
                        }
                        key={option.tool}
                        onClick={handleClick}
                        title={option.title}
                        variant={isActive ? 'default' : 'secondary'}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate">{option.title}</span>
                      </Button>
                    );
                  })}
                <div className="mx-auto my-0.5 h-px w-5 bg-slate-700" />
                <Button
                  className="h-9 justify-start rounded-md px-2 text-xs"
                  disabled={!canUndo || pendingAction}
                  onClick={onUndo}
                  title="Undo (Ctrl/Cmd+Z)"
                  variant="secondary"
                >
                  <Undo2 className="h-4 w-4" />
                  <span className="truncate">Undo</span>
                </Button>
                <Button
                  className="h-9 justify-start rounded-md px-2 text-xs"
                  disabled={!canRedo || pendingAction}
                  onClick={onRedo}
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                  variant="secondary"
                >
                  <Redo2 className="h-4 w-4" />
                  <span className="truncate">Redo</span>
                </Button>
                {booleanActionsVisible ? (
                  <>
                    <div className="mx-auto my-0.5 h-px w-5 bg-slate-700" />
                    <Button
                      className="h-9 justify-start rounded-md px-2 text-xs"
                      disabled={!canApplyUnionLike}
                      onClick={() => onApplyBoolean('union')}
                      title="Union"
                      variant="secondary"
                    >
                      <Combine className="h-4 w-4" />
                      <span className="truncate">Union</span>
                    </Button>
                  </>
                ) : null}
              </div>

              <div
                className="absolute left-[12.5rem] right-3 top-3 z-20 rounded-lg border border-slate-800/80 bg-slate-950/85 p-3 text-slate-100 shadow-lg backdrop-blur"
                data-testid="editor-canvas-status"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-sky-500/18 px-2 py-1 text-xs font-semibold text-sky-100">
                        {toolLabel}
                      </span>
                      <span className="text-sm font-medium text-slate-100">
                        {selectionSummary}
                      </span>
                      {tool === 'terrain' ? (
                        <>
                          <span
                            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
                            data-testid="terrain-selection-count"
                          >
                            {terrainSelectedHeightTileCount} selected
                          </span>
                          <span
                            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
                            data-testid="terrain-dirty-count"
                          >
                            {terrainDirtyCount} pending
                          </span>
                        </>
                      ) : null}
                    </div>
                    <p className="text-sm leading-5 text-slate-300">
                      {nextActionHint}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>Zoom {zoomPercent}%</span>
                      {tool === 'terrain' ? (
                        <span>{terrainHoverReadout}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <Button
                      className="h-8 rounded-md px-2 text-xs"
                      disabled={!canFocusSelection}
                      onClick={onFocusSelection}
                      size="sm"
                      variant="secondary"
                    >
                      <Crosshair className="h-4 w-4" />
                      Focus selection
                    </Button>
                    <Button
                      className="h-8 rounded-md px-2 text-xs"
                      onClick={() => setShortcutsOpen(open => !open)}
                      size="sm"
                      variant="secondary"
                    >
                      <CircleHelp className="h-4 w-4" />
                      Shortcuts
                    </Button>
                  </div>
                </div>
                {shortcutsOpen ? (
                  <div className="mt-3 grid gap-2 rounded-md border border-slate-800 bg-slate-900/90 p-3 text-xs text-slate-300 sm:grid-cols-2">
                    <span>Ctrl/Cmd+Z undo</span>
                    <span>Ctrl/Cmd+Shift+Z redo</span>
                    <span>Esc clears drafts or selection</span>
                    <span>Enter saves a polygon draft</span>
                    <span>Ctrl/Cmd+D duplicates selected entities</span>
                    <span>Scroll to zoom, drag in Pan to move</span>
                  </div>
                ) : null}
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
                {tool === 'terrain'
                  ? terrainPreviewHaloTiles.map(tile => {
                      const rect = tileToScreenRect(tile.tileX, tile.tileZ);
                      return (
                        <rect
                          fill="rgba(245, 158, 11, 0.08)"
                          height={rect.height}
                          key={`terrain-halo-${tile.tileX}-${tile.tileZ}`}
                          pointerEvents="none"
                          stroke="rgba(245, 158, 11, 0.7)"
                          strokeDasharray="6 4"
                          strokeWidth={1.5}
                          width={rect.width}
                          x={rect.x}
                          y={rect.z}
                        />
                      );
                    })
                  : null}
                {tool === 'terrain'
                  ? terrainHeightSelectionTiles.map(tile => {
                      const rect = tileToScreenRect(tile.tileX, tile.tileZ);
                      return (
                        <rect
                          fill="rgba(56, 189, 248, 0.18)"
                          height={rect.height}
                          key={`terrain-selection-${tile.tileX}-${tile.tileZ}`}
                          pointerEvents="none"
                          stroke="rgba(125, 211, 252, 0.9)"
                          strokeWidth={2}
                          width={rect.width}
                          x={rect.x}
                          y={rect.z}
                        />
                      );
                    })
                  : null}
                {tool === 'terrain' && terrainSelectedTile
                  ? renderTerrainTileRect(
                      tileToScreenRect(
                        terrainSelectedTile.tileX,
                        terrainSelectedTile.tileZ
                      ),
                      'terrain-selected',
                      'transparent',
                      '#f8fafc',
                      2
                    )
                  : null}
                {tool === 'terrain' &&
                terrainHoveredTile &&
                (!terrainSelectedTile ||
                  terrainHoveredTile.tileX !== terrainSelectedTile.tileX ||
                  terrainHoveredTile.tileZ !== terrainSelectedTile.tileZ)
                  ? renderTerrainTileRect(
                      tileToScreenRect(
                        terrainHoveredTile.tileX,
                        terrainHoveredTile.tileZ
                      ),
                      'terrain-hovered',
                      'transparent',
                      'rgba(226, 232, 240, 0.7)',
                      1.5,
                      '4 3'
                    )
                  : null}
                {entityItems.map(item => {
                  const selected = selectedEntitySet.has(item.entity.id);
                  const assetVersion =
                    item.assetVersion ?? fallbackStaticEntityFootprint;
                  const overlay = getStaticEntityOverlayGeometry({
                    assetVersion,
                    entity: item.entity
                  });
                  const facingPoint = getStaticEntityFacingIndicator({
                    entity: item.entity,
                    lengthMeters:
                      assetVersion.footprint.depthMeters *
                        item.entity.scale *
                        0.5 +
                      4
                  });
                  const anchor = toScreenPoint(item.entity.position);
                  const facingScreen = toScreenPoint(facingPoint);
                  const handleScreen = toScreenPoint(overlay.handle);
                  const footprintPoints = overlay.corners
                    .map(point => {
                      const screen = toScreenPoint(point);
                      return `${screen.x},${screen.z}`;
                    })
                    .join(' ');
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
                  const strokeDasharray = disabled
                    ? '10 6'
                    : item.assetVersion
                      ? undefined
                      : '6 4';

                  return (
                    <g key={item.entity.id}>
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
                        strokeDasharray={strokeDasharray}
                        strokeLinejoin="round"
                        strokeWidth={selected ? 3.5 : 2.5}
                      />
                      <line
                        pointerEvents="none"
                        stroke={stroke}
                        strokeWidth={selected ? 2.5 : 2}
                        x1={anchor.x}
                        x2={facingScreen.x}
                        y1={anchor.z}
                        y2={facingScreen.z}
                      />
                      <circle
                        cx={anchor.x}
                        cy={anchor.z}
                        fill={selected ? '#ffffff' : 'transparent'}
                        pointerEvents="none"
                        r={selected ? 3 : 2}
                        stroke={stroke}
                        strokeWidth={selected ? 2 : 1.5}
                      />
                      {selected &&
                      selectedEntityIds.length === 1 &&
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
                                  const insertAt = getPolygonEdgeInsertPosition(
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
                                              ...draft.vertices.slice(index + 1)
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

            {/* Terrain action dock — bottom-left */}
            {tool === 'terrain' ? (
              <div
                className="absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-7rem)] flex-wrap items-end gap-2 rounded-lg border border-slate-800/80 bg-slate-950/85 p-2 text-slate-100 shadow-lg backdrop-blur"
                data-testid="editor-terrain-dock"
              >
                <div className="min-w-32">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Layer
                  </div>
                  <Select
                    aria-label="Canvas terrain render layer"
                    className="h-8 rounded-md border-slate-700 bg-slate-900/90 text-xs text-slate-100"
                    onChange={event =>
                      onSetTerrainLayer(
                        event.target.value as TerrainRenderLayer
                      )
                    }
                    value={terrainRenderLayer}
                  >
                    {TERRAIN_RENDER_LAYER_OPTIONS.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="min-w-28">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Tool
                  </div>
                  <Select
                    aria-label="Canvas terrain tool"
                    className="h-8 rounded-md border-slate-700 bg-slate-900/90 text-xs text-slate-100"
                    onChange={event =>
                      onSetTerrainTool(event.target.value as ZarchTileEditTool)
                    }
                    value={terrainTool}
                  >
                    <option value="height">Height</option>
                    <option value="set-type">Type</option>
                  </Select>
                </div>
                <div className="min-w-24">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Selection
                  </div>
                  <div className="h-8 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1.5 text-xs text-slate-200">
                    {terrainSelectedHeightTileCount} selected
                  </div>
                </div>
                <div className="flex max-w-full flex-wrap items-end gap-1.5">
                  <div className="w-full text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {actionDockTitle}
                  </div>
                  {isColorOverrideMode ? (
                    <>
                      <button
                        className={cn(
                          'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
                          terrainSelectedColorIndex === null
                            ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                            : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                        )}
                        disabled={terrainSelectedHeightTileCount === 0}
                        onClick={() => onSetTerrainColorIndex(null)}
                        type="button"
                      >
                        <span className="inline-block h-4 w-4 rounded-sm border border-slate-600 bg-[#17212e]" />
                        Auto
                      </button>
                      {colorPalette.map((entry, index) => (
                        <button
                          className={cn(
                            'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
                            terrainSelectedColorIndex === index
                              ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                              : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                          )}
                          disabled={terrainSelectedHeightTileCount === 0}
                          key={entry.id}
                          onClick={() => onSetTerrainColorIndex(index)}
                          type="button"
                        >
                          <span
                            className="inline-block h-4 w-4 rounded-sm border border-black/40"
                            style={{ backgroundColor: entry.hex }}
                          />
                          {entry.label}
                        </button>
                      ))}
                    </>
                  ) : terrainRenderLayer === 'tile-type' ||
                    terrainTool === 'set-type' ? (
                    <>
                      {tileTypePalette.map(tileType => (
                        <Button
                          className={cn(
                            'h-8 rounded-md px-2.5 text-xs',
                            terrainSelectedTypeId === tileType.id &&
                              'ring-1 ring-sky-400/60'
                          )}
                          disabled={terrainSelectedHeightTileCount === 0}
                          key={tileType.id}
                          onClick={() =>
                            onApplyTerrainTypeSelection(tileType.id)
                          }
                          size="sm"
                          variant={
                            terrainSelectedTypeId === tileType.id
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {tileType.label}
                        </Button>
                      ))}
                    </>
                  ) : (
                    <>
                      <Button
                        className="h-8 rounded-md px-2.5 text-xs"
                        disabled={terrainSelectedHeightTileCount === 0}
                        onClick={() => onApplyTerrainHeightSelection('flatten')}
                        size="sm"
                        variant="secondary"
                      >
                        Flatten
                      </Button>
                      <Button
                        className="h-8 rounded-md px-2.5 text-xs"
                        disabled={terrainSelectedHeightTileCount === 0}
                        onClick={() => onApplyTerrainHeightSelection('raise')}
                        size="sm"
                        variant="secondary"
                      >
                        Raise
                      </Button>
                      <Button
                        className="h-8 rounded-md px-2.5 text-xs"
                        disabled={terrainSelectedHeightTileCount === 0}
                        onClick={() => onApplyTerrainHeightSelection('lower')}
                        size="sm"
                        variant="secondary"
                      >
                        Lower
                      </Button>
                      <Button
                        className="h-8 rounded-md px-2.5 text-xs"
                        disabled={terrainSelectedHeightTileCount === 0}
                        onClick={onClearTerrainSelection}
                        size="sm"
                        variant="secondary"
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-1.5">
                  <div className="w-full text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Draft
                  </div>
                  <Button
                    className="h-8 rounded-md px-2.5 text-xs"
                    disabled={terrainDirtyCount === 0 || terrainSavePending}
                    onClick={onSaveTerrainEdits}
                    size="sm"
                    variant="default"
                  >
                    <Save className="h-4 w-4" />
                    {terrainSavePending ? 'Saving...' : 'Save terrain edits'}
                  </Button>
                  <Button
                    className="h-8 rounded-md px-2.5 text-xs"
                    disabled={terrainDirtyCount === 0}
                    onClick={onResetTerrainEdits}
                    size="sm"
                    variant="secondary"
                  >
                    Cancel terrain edits
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Zoom controls — bottom-right */}
            <div className="absolute right-3 bottom-3 z-20 flex gap-1 rounded-xl border border-slate-800/80 bg-slate-950/80 p-1 shadow-lg backdrop-blur">
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

      {/* Legend below map */}
      {terrainLegendItems.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-1 text-xs text-muted-foreground">
          {terrainLegendItems.map(item => (
            <div
              className="flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-1"
              key={`${terrainRenderLayer}-${item.label}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border border-black/40"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
