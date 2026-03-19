import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';

import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { isInfiniteMap } from 'carrier-contracts/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMapChunks } from '@/hooks/use-map-chunks';
import { useMapEditorData } from '@/hooks/use-map-editor-data';
import {
  getViewportWorldBounds,
  getVisibleChunkRange,
  screenToTilePoint,
  tileToScreenPoint,
  tileToWorldPoint,
  useMapViewport,
  worldToTilePoint,
} from '@/hooks/use-map-viewport';
import {
  canDeleteVertex,
  canSavePolygonDraft,
  mergeWorldBounds,
  type EditorTool,
} from './helpers';
import { EditorCanvas } from './components/canvas';
import { EditorSidebar } from './components/sidebar';
import { EditorToolbar } from './components/toolbar';
import {
  createControlPointDraft,
  createIslandDraft,
  createPolygonDraft,
  expandBounds,
  isDraftDirty,
} from './helpers/drafts';
import { useElementSize } from './hooks/use-element-size';
import { useMapEditorActions } from './hooks/use-map-editor-actions';
import type {
  CanvasDragState,
  ControlPointDraft,
  DeleteTarget,
  IslandDraft,
  PolygonDraft,
} from './helpers/types';

export function MapEditorPage() {
  const { id } = useParams({ from: '/maps/$id/editor' });
  const navigate = useNavigate();
  const interactionRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialFitRef = useRef(false);
  const size = useElementSize(containerRef);

  const [tool, setTool] = useState<EditorTool>('select');
  const [editorRevision, setEditorRevision] = useState<number | null>(null);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState<string[]>([]);
  const [selectedControlPointId, setSelectedControlPointId] = useState<
    string | null
  >(null);
  const [selectedIslandId, setSelectedIslandId] = useState<string | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraft | null>(null);
  const [controlPointDraft, setControlPointDraft] =
    useState<ControlPointDraft | null>(null);
  const [islandDraft, setIslandDraft] = useState<IslandDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [dragState, setDragState] = useState<CanvasDragState>(null);

  const {
    controlPointsQuery,
    derivedIslandsQuery,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    map,
    mapQuery,
    overviewQuery,
    polygonsQuery,
    reloadAll,
  } = useMapEditorData(id);

  const polygons = polygonsQuery.data ?? [];
  const controlPoints = controlPointsQuery.data ?? [];
  const derivedIslands = derivedIslandsQuery.data ?? [];

  const selectedPolygon =
    selectedPolygonIds.length === 1
      ? (polygons.find((polygon) => polygon.id === selectedPolygonIds[0]) ??
        null)
      : null;
  const selectedControlPoint = selectedControlPointId
    ? (controlPoints.find((point) => point.id === selectedControlPointId) ??
      null)
    : null;
  const selectedIsland = selectedIslandId
    ? (derivedIslands.find((island) => island.id === selectedIslandId) ?? null)
    : null;

  const highlightedIslandPolygonIds = useMemo(
    () => new Set(selectedIsland?.sourcePolygonIds ?? []),
    [selectedIsland],
  );

  useEffect(() => {
    if (map && editorRevision === null) {
      setEditorRevision(map.revision);
    }
  }, [editorRevision, map]);

  useEffect(() => {
    if (!map || isInfiniteMap(map)) {
      return;
    }

    toast.error('Only infinite-vector maps can open the editor');
    void navigate({ to: '/maps/$id', params: { id } });
  }, [id, map, navigate]);

  const {
    fitToView,
    fitToWorldBounds,
    onKeyDown: onViewportKeyDown,
    onPointerCancel: onViewportPointerCancel,
    onPointerDown: onViewportPointerDown,
    onPointerLeave: onViewportPointerLeave,
    onPointerMove: onViewportPointerMove,
    onPointerUp: onViewportPointerUp,
    onWheel,
    recenterOnWorldPoint,
    viewport,
    zoomIn,
    zoomOut,
  } = useMapViewport(
    map ?? {
      createdAt: '',
      extent: { kind: 'infinite' },
      id,
      kind: 'infinite-vector',
      name: null,
      resolution: { chunkSizeTiles: 32, metersPerTile: 10 },
      revision: 0,
      seed: '',
      updatedAt: '',
    },
    size.width,
    size.height,
  );

  useEffect(() => {
    if (
      !map ||
      !isInfiniteMap(map) ||
      size.width <= 0 ||
      size.height <= 0 ||
      initialFitRef.current
    ) {
      return;
    }

    initialFitRef.current = true;

    if (overviewQuery.data?.bounds) {
      fitToWorldBounds(overviewQuery.data.bounds);
      return;
    }

    fitToView();
  }, [
    fitToView,
    fitToWorldBounds,
    map,
    overviewQuery.data?.bounds,
    size.height,
    size.width,
  ]);

  const chunkRange = map
    ? getVisibleChunkRange(viewport, size.width, size.height, map)
    : null;
  const chunks = useMapChunks(
    id,
    chunkRange ?? {
      maxChunkX: 0,
      maxChunkZ: 0,
      minChunkX: 0,
      minChunkZ: 0,
    },
    Boolean(map),
  );

  const viewportWorldBounds = map
    ? getViewportWorldBounds(map, viewport, size.width, size.height)
    : null;

  const overviewBounds = useMemo(() => {
    if (!viewportWorldBounds) {
      return null;
    }

    const combined = mergeWorldBounds(
      overviewQuery.data?.bounds ?? null,
      viewportWorldBounds,
    );
    if (!combined || !map) {
      return combined;
    }

    const chunkWorldSize =
      map.resolution.chunkSizeTiles * map.resolution.metersPerTile;
    return expandBounds(combined, chunkWorldSize * 0.5);
  }, [map, overviewQuery.data?.bounds, viewportWorldBounds]);

  const toScreenPoint = useCallback(
    (point: { x: number; z: number }) => {
      if (!map) {
        return { x: 0, z: 0 };
      }

      const tilePoint = worldToTilePoint(map, point);
      return tileToScreenPoint(
        viewport,
        size.width,
        size.height,
        tilePoint.x,
        tilePoint.z,
      );
    },
    [map, size.height, size.width, viewport],
  );

  const toWorldPoint = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      currentTarget: { getBoundingClientRect(): DOMRect };
    }) => {
      if (!map) {
        return { x: 0, z: 0 };
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const tilePoint = screenToTilePoint(
        viewport,
        size.width,
        size.height,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );

      return tileToWorldPoint(map, tilePoint);
    },
    [map, size.height, size.width, viewport],
  );

  const clearSelections = useCallback(() => {
    setSelectedPolygonIds([]);
    setSelectedControlPointId(null);
    setSelectedIslandId(null);
  }, []);

  const resetPolygonDraft = useCallback(() => {
    setPolygonDraft(null);
    setTool('select');
  }, []);

  const resetControlPointDraft = useCallback(() => {
    setControlPointDraft(null);
    setTool('select');
  }, []);

  const beginVertexEdit = useCallback(() => {
    if (!selectedPolygon) {
      return;
    }

    setPolygonDraft(createPolygonDraft(selectedPolygon));
    setControlPointDraft(null);
    setTool('edit-vertices');
  }, [selectedPolygon]);

  const {
    applyBooleanOperation,
    confirmDelete,
    pendingAction,
    saveControlPointDraft,
    saveIslandDraft,
    savePolygonDraft,
  } = useMapEditorActions({
    controlPointDraft,
    deleteTarget,
    editorRevision,
    fitToWorldBounds,
    id,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    islandDraft,
    map,
    polygonDraft,
    reloadAll,
    selectedPolygonIds,
    setControlPointDraft,
    setDeleteTarget,
    setEditorRevision,
    setIslandDraft,
    setPolygonDraft,
    setSelectedControlPointId,
    setSelectedIslandId,
    setSelectedPolygonIds,
    setTool,
  });

  const handleWheelCapture = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      interactionRef.current?.focus();

      if (dragState) {
        return;
      }

      if (tool === 'pan' || tool === 'select' || tool === 'edit-vertices') {
        onViewportPointerDown(event);
      }
    },
    [dragState, onViewportPointerDown, tool],
  );

  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (dragState?.kind === 'vertex' && polygonDraft) {
        const world = toWorldPoint(event);
        setPolygonDraft((draft) => {
          if (!draft) {
            return draft;
          }

          return {
            ...draft,
            selectedVertexIndex: dragState.vertexIndex,
            vertices: draft.vertices.map((vertex, index) =>
              index === dragState.vertexIndex ? world : vertex,
            ),
          };
        });
        return;
      }

      if (dragState?.kind === 'control-point') {
        const world = toWorldPoint(event);
        setControlPointDraft((draft) => {
          if (draft) {
            return { ...draft, x: world.x, z: world.z };
          }

          if (
            !selectedControlPoint ||
            dragState.pointId !== selectedControlPoint.id
          ) {
            return draft;
          }

          return {
            ...createControlPointDraft(selectedControlPoint),
            x: world.x,
            z: world.z,
          };
        });
        return;
      }

      onViewportPointerMove(event);
    },
    [
      dragState,
      onViewportPointerMove,
      polygonDraft,
      selectedControlPoint,
      toWorldPoint,
    ],
  );

  const releaseCanvasDrag = useCallback(() => {
    setDragState(null);
  }, []);

  const handleCanvasPointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerUp(event);
    },
    [onViewportPointerUp, releaseCanvasDrag],
  );

  const handleCanvasPointerCancel = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerCancel(event);
    },
    [onViewportPointerCancel, releaseCanvasDrag],
  );

  const handleCanvasPointerLeave = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerLeave(event);
    },
    [onViewportPointerLeave, releaseCanvasDrag],
  );

  const handleCanvasClick = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!map) {
        return;
      }

      if (tool === 'draw-polygon') {
        const world = toWorldPoint(event);
        setPolygonDraft((draft) => {
          const nextDraft = draft ?? createPolygonDraft();
          return { ...nextDraft, vertices: [...nextDraft.vertices, world] };
        });
        return;
      }

      if (tool === 'place-control-point') {
        const world = toWorldPoint(event);
        setControlPointDraft({
          ...createControlPointDraft(),
          x: world.x,
          z: world.z,
        });
        setSelectedPolygonIds([]);
        setSelectedControlPointId(null);
        setSelectedIslandId(null);
        return;
      }

      if (tool === 'select') {
        clearSelections();
        setPolygonDraft(null);
      }
    },
    [clearSelections, map, toWorldPoint, tool],
  );

  const commitDrawPolygon = useCallback(() => {
    if (
      polygonDraft &&
      canSavePolygonDraft(polygonDraft.vertices, polygonDraft.params)
    ) {
      void savePolygonDraft();
    }
  }, [polygonDraft, savePolygonDraft]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (polygonDraft) {
          resetPolygonDraft();
          return;
        }

        if (controlPointDraft) {
          resetControlPointDraft();
          return;
        }

        clearSelections();
        return;
      }

      if (event.key === 'Enter' && tool === 'draw-polygon') {
        event.preventDefault();
        commitDrawPolygon();
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !pendingAction
      ) {
        if (
          polygonDraft &&
          canDeleteVertex(
            polygonDraft.vertices,
            polygonDraft.selectedVertexIndex,
          )
        ) {
          event.preventDefault();
          setPolygonDraft((draft) => {
            if (!draft || draft.selectedVertexIndex === null) {
              return draft;
            }

            return {
              ...draft,
              selectedVertexIndex: null,
              vertices: draft.vertices.filter(
                (_vertex, index) => index !== draft.selectedVertexIndex,
              ),
            };
          });
          return;
        }

        if (selectedPolygon) {
          event.preventDefault();
          setDeleteTarget({ id: selectedPolygon.id, kind: 'polygon' });
          return;
        }

        if (selectedControlPoint) {
          event.preventDefault();
          setDeleteTarget({
            id: selectedControlPoint.id,
            kind: 'control-point',
          });
          return;
        }
      }

      onViewportKeyDown(event);
    },
    [
      clearSelections,
      commitDrawPolygon,
      controlPointDraft,
      onViewportKeyDown,
      pendingAction,
      polygonDraft,
      resetControlPointDraft,
      resetPolygonDraft,
      selectedControlPoint,
      selectedPolygon,
      tool,
    ],
  );

  const currentPolygonForInspector =
    polygonDraft ??
    (selectedPolygon ? createPolygonDraft(selectedPolygon) : null);
  const currentControlPointForInspector =
    controlPointDraft ??
    (selectedControlPoint
      ? createControlPointDraft(selectedControlPoint)
      : null);
  const islandInspectorDraft =
    islandDraft ?? (selectedIsland ? createIslandDraft(selectedIsland) : null);
  const polygonDirty =
    polygonDraft !== null &&
    isDraftDirty(
      polygonDraft,
      selectedPolygon && polygonDraft.kind === 'edit' ? selectedPolygon : null,
    );

  const canApplyUnionLike = selectedPolygonIds.length >= 2 && !polygonDraft;
  const canApplyDifference = selectedPolygonIds.length === 2 && !polygonDraft;
  const overlayPolygons = polygons.filter(
    (polygon) =>
      polygonDraft?.kind !== 'edit' || polygon.id !== polygonDraft.id,
  );

  if (mapQuery.isLoading) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  if (!map || !isInfiniteMap(map)) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/maps/$id" params={{ id }}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-3xl font-bold tracking-tight">
            {map.name ?? 'Unnamed Map'} Editor
          </h2>
          <p className="font-mono text-sm text-muted-foreground">{map.id}</p>
        </div>
        <Badge variant="secondary">
          Revision {editorRevision ?? map.revision}
        </Badge>
      </div>

      <EditorToolbar
        canApplyDifference={canApplyDifference}
        canApplyUnionLike={canApplyUnionLike}
        onApplyBoolean={(operation) => void applyBooleanOperation(operation)}
        onBeginControlPoint={() => {
          setTool('place-control-point');
          setControlPointDraft(null);
          setPolygonDraft(null);
          clearSelections();
        }}
        onBeginDrawPolygon={() => {
          setTool('draw-polygon');
          setPolygonDraft(createPolygonDraft());
          setControlPointDraft(null);
          clearSelections();
        }}
        onBeginVertexEdit={beginVertexEdit}
        onSelectTool={setTool}
        selectedPolygon={Boolean(selectedPolygon)}
        tool={tool}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EditorCanvas
          chunks={chunks}
          commitDrawPolygon={commitDrawPolygon}
          containerRef={containerRef}
          controlPointDraft={controlPointDraft}
          controlPoints={controlPoints}
          dragState={dragState}
          fitToView={fitToView}
          highlightedIslandPolygonIds={highlightedIslandPolygonIds}
          interactionRef={interactionRef}
          map={map}
          onCanvasClick={handleCanvasClick}
          onCanvasKeyDown={handleKeyDown}
          onCanvasPointerCancel={handleCanvasPointerCancel}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasPointerLeave={handleCanvasPointerLeave}
          onCanvasPointerMove={handleCanvasPointerMove}
          onCanvasPointerUp={handleCanvasPointerUp}
          onWheel={onWheel}
          onWheelCapture={handleWheelCapture}
          overlayPolygons={overlayPolygons}
          polygonDraft={polygonDraft}
          selectedControlPointId={selectedControlPointId}
          selectedPolygonIds={selectedPolygonIds}
          setDragState={setDragState}
          setPolygonDraft={setPolygonDraft}
          setSelectedControlPointId={setSelectedControlPointId}
          setSelectedIslandId={setSelectedIslandId}
          setSelectedPolygonIds={setSelectedPolygonIds}
          size={size}
          toScreenPoint={toScreenPoint}
          toWorldPoint={toWorldPoint}
          tool={tool}
          viewport={viewport}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
        />

        <EditorSidebar
          controlPointDraft={controlPointDraft}
          counts={{
            controlPoints: overviewQuery.data?.counts.controlPoints ?? 0,
            derivedIslands: overviewQuery.data?.counts.derivedIslands ?? 0,
            sourcePolygons: overviewQuery.data?.counts.sourcePolygons ?? 0,
          }}
          currentControlPointForInspector={currentControlPointForInspector}
          currentPolygonForInspector={currentPolygonForInspector}
          derivedIslands={derivedIslands}
          islandDraft={islandDraft}
          islandInspectorDraft={islandInspectorDraft}
          overviewBounds={overviewBounds}
          overviewClusters={overviewQuery.data?.clusters ?? []}
          polygonDirty={polygonDirty}
          polygonDraft={polygonDraft}
          selectedControlPoint={selectedControlPoint}
          selectedIsland={selectedIsland}
          selectedIslandId={selectedIslandId}
          selectedPolygon={selectedPolygon}
          setControlPointDraft={setControlPointDraft}
          setDeleteTarget={setDeleteTarget}
          setIslandDraft={setIslandDraft}
          setPolygonDraft={setPolygonDraft}
          setSelectedControlPointId={setSelectedControlPointId}
          setSelectedIslandId={setSelectedIslandId}
          setSelectedPolygonIds={setSelectedPolygonIds}
          onRecenter={recenterOnWorldPoint}
          onResetControlPointDraft={resetControlPointDraft}
          onResetPolygonDraft={resetPolygonDraft}
          onSaveControlPointDraft={() => void saveControlPointDraft()}
          onSaveIslandDraft={() => void saveIslandDraft()}
          onSavePolygonDraft={() => void savePolygonDraft()}
          viewportBounds={viewportWorldBounds}
        />
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete{' '}
              {deleteTarget?.kind === 'polygon' ? 'Polygon' : 'Control Point'}
            </DialogTitle>
            <DialogDescription>
              This will remove the selected authored object and refresh affected
              terrain chunks after the mutation succeeds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteTarget(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={pendingAction !== null}
              onClick={() => void confirmDelete()}
              variant="destructive">
              {pendingAction ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
