import type {
  ControlPoint
} from 'carrier-contracts/types';
import { isInfiniteMap } from 'carrier-contracts/types';
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { ArrowLeft } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent
} from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
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
  worldToTilePoint
} from '@/hooks/use-map-viewport';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

import { EditorCanvas } from './components/canvas';
import { EditorSidebar } from './components/sidebar';
import { EditorToolbar } from './components/toolbar';
import {
  canDeleteVertex,
  canSavePolygonDraft,
  mergeWorldBounds,
  nextOrderedSelection,
  pointInPolygon,
  polygonIntersectsBounds,
  type EditorTool
} from './helpers';
import {
  createControlPointDraft,
  createIslandDraft,
  createPolygonDraft,
  expandBounds,
  isDraftDirty,
  translateControlPointDraft,
  translatePolygonDraft
} from './helpers/drafts';
import type {
  CanvasDragState,
  DeleteTarget
} from './helpers/types';
import type { SourcePolygonLike } from './helpers/types';
import { useElementSize } from './hooks/use-element-size';
import { useMapEditorActions } from './hooks/use-map-editor-actions';
import {
  canRedoAtom,
  canUndoAtom,
  createEmptyEditorSnapshot,
  editorHistoryStateAtom,
  editorSnapshotAtom,
  recordEditorHistoryAtom,
  resetEditorHistoryAtom,
  snapshotsEqual,
  type EditorSnapshot
} from './state/history';

export function MapEditorPage() {
  const { id } = useParams({ from: '/maps/$id/editor' });
  const navigate = useNavigate();
  const interactionRef = useRef<SVGSVGElement>(null);
  const initialFitRef = useRef(false);
  const [containerRef, size] = useElementSize();

  const [editorRevision, setEditorRevision] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [dragState, setDragState] = useState<CanvasDragState>(null);
  const [snapshot, setSnapshot] = useAtom(editorSnapshotAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const resetHistory = useSetAtom(resetEditorHistoryAtom);
  const recordHistory = useSetAtom(recordEditorHistoryAtom);
  const setHistoryState = useSetAtom(editorHistoryStateAtom);
  const store = useStore();
  const getHistoryState = useCallback(
    () => store.get(editorHistoryStateAtom),
    [store]
  );
  const snapshotRef = useRef(snapshot);
  const dragSnapshotRef = useRef<EditorSnapshot | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const suppressPolygonClickRef = useRef<string | null>(null);

  const {
    controlPointDraft,
    islandDraft,
    polygonDraft,
    polygonControlPointDrafts,
    selectedControlPointId,
    selectedIslandId,
    selectedPolygonIds,
    tool
  } = snapshot;

  const {
    controlPointsQuery,
    derivedIslandsQuery,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    map,
    mapQuery,
    overviewQuery,
    polygonsQuery,
    reloadAll
  } = useMapEditorData(id);

  const polygons = useMemo(() => polygonsQuery.data ?? [], [polygonsQuery.data]);
  const controlPoints = useMemo(
    () => controlPointsQuery.data ?? [],
    [controlPointsQuery.data]
  );
  const derivedIslands = useMemo(
    () => derivedIslandsQuery.data ?? [],
    [derivedIslandsQuery.data]
  );

  const selectedPolygon =
    selectedPolygonIds.length === 1
      ? (polygons.find(polygon => polygon.id === selectedPolygonIds[0]) ?? null)
      : null;
  const selectedControlPoint = selectedControlPointId
    ? (controlPoints.find(point => point.id === selectedControlPointId) ?? null)
    : null;
  const selectedIsland = selectedIslandId
    ? (derivedIslands.find(island => island.id === selectedIslandId) ?? null)
    : null;

  const highlightedIslandPolygonIds = useMemo(
    () => new Set(selectedIsland?.sourcePolygonIds ?? []),
    [selectedIsland]
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (dragState && dragSnapshotRef.current === null) {
      dragSnapshotRef.current = snapshotRef.current;
      return;
    }

    if (!dragState) {
      dragSnapshotRef.current = null;
    }
  }, [dragState]);

  useEffect(() => {
    resetHistory(createEmptyEditorSnapshot());
    setDeleteTarget(null);
    setDragState(null);
  }, [id, resetHistory]);

  const updateSnapshot = useCallback(
    (
      updater:
        | EditorSnapshot
        | ((current: EditorSnapshot) => EditorSnapshot),
      record = false
    ) => {
      const before = snapshotRef.current;
      const after =
        typeof updater === 'function'
          ? updater(before)
          : updater;

      if (snapshotsEqual(before, after)) {
        return before;
      }

      snapshotRef.current = after;

      if (record) {
        recordHistory({
          after,
          before,
          remoteTransitions: []
        });
      } else {
        setSnapshot(after);
      }

      return after;
    },
    [recordHistory, setSnapshot]
  );

  const setTool = useCallback(
    (nextTool: EditorTool, record = false) => {
      updateSnapshot(current => ({ ...current, tool: nextTool }), record);
    },
    [updateSnapshot]
  );

  const clearSelections = useCallback(
    (record = false) => {
      updateSnapshot(
        current => ({
          ...current,
          selectedControlPointId: null,
          selectedIslandId: null,
          selectedPolygonIds: [],
          polygonControlPointDrafts: []
        }),
        record
      );
    },
    [updateSnapshot]
  );

  const snapshotFieldSetter = <K extends keyof EditorSnapshot>(field: K) =>
    (value: EditorSnapshot[K] | ((current: EditorSnapshot[K]) => EditorSnapshot[K]), record = false) => {
      updateSnapshot(
        current => ({
          ...current,
          [field]: typeof value === 'function'
            ? (value as (current: EditorSnapshot[K]) => EditorSnapshot[K])(current[field])
            : value
        }),
        record
      );
    };

  const setPolygonDraft = snapshotFieldSetter('polygonDraft');
  const setControlPointDraft = snapshotFieldSetter('controlPointDraft');
  const setIslandDraft = snapshotFieldSetter('islandDraft');
  const setSelectedPolygonIds = snapshotFieldSetter('selectedPolygonIds');
  const setSelectedControlPointId = snapshotFieldSetter('selectedControlPointId');
  const setSelectedIslandId = snapshotFieldSetter('selectedIslandId');
  const setPolygonControlPointDrafts = snapshotFieldSetter(
    'polygonControlPointDrafts'
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
    zoomOut
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
      updatedAt: ''
    },
    size.width,
    size.height
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
    size.width
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
      minChunkZ: 0
    },
    Boolean(map)
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
      viewportWorldBounds
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
        tilePoint.z
      );
    },
    [map, size.height, size.width, viewport]
  );

  const toWorldPoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      if (!map) {
        return { x: 0, z: 0 };
      }

      const svg = interactionRef.current;
      if (!svg) {
        return { x: 0, z: 0 };
      }

      const rect = svg.getBoundingClientRect();
      const tilePoint = screenToTilePoint(
        viewport,
        size.width,
        size.height,
        event.clientX - rect.left,
        event.clientY - rect.top
      );

      return tileToWorldPoint(map, tilePoint);
    },
    [map, size.height, size.width, viewport]
  );

  const resetPolygonDraft = useCallback(() => {
    updateSnapshot(current => ({
      ...current,
      polygonDraft: null,
      polygonControlPointDrafts: [],
      tool: 'select'
    }));
  }, [updateSnapshot]);

  const resetControlPointDraft = useCallback(() => {
    updateSnapshot(current => ({
      ...current,
      controlPointDraft: null,
      polygonControlPointDrafts: [],
      tool: 'select'
    }));
  }, [updateSnapshot]);

  const beginVertexEdit = useCallback(() => {
    if (!selectedPolygon) {
      return;
    }

    updateSnapshot(current => ({
      ...current,
      controlPointDraft: null,
      polygonDraft: createPolygonDraft(selectedPolygon),
      polygonControlPointDrafts: [],
      tool: 'edit-vertices'
    }), true);
  }, [selectedPolygon, updateSnapshot]);

  const {
    applyBooleanOperation,
    confirmDelete,
    pendingAction,
    redo,
    saveControlPointDraft,
    saveIslandDraft,
    savePolygonDraft,
    undo
  } = useMapEditorActions({
    controlPointDraft,
    controlPoints,
    deleteTarget,
    editorRevision,
    fitToWorldBounds,
    getHistoryState,
    historySnapshot: snapshot,
    id,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    islandDraft,
    map,
    polygons,
    polygonDraft,
    polygonControlPointDrafts,
    recordHistory,
    reloadAll,
    selectedControlPoint,
    selectedPolygon,
    selectedPolygonIds,
    setDeleteTarget,
    setEditorRevision,
    setHistoryState,
    setIslandDraft,
    setSnapshot
  });

  const handleWheelCapture = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      interactionRef.current?.focus();

      if (dragState) {
        return;
      }

      if (tool === 'pan') {
        onViewportPointerDown(event);
        return;
      }

      if (tool === 'select') {
        const world = toWorldPoint(event);
        interactionRef.current?.setPointerCapture(event.pointerId);
        setDragState({
          bounds: {
            maxX: world.x,
            maxZ: world.z,
            minX: world.x,
            minZ: world.z
          },
          currentPoint: world,
          kind: 'marquee',
          pointerId: event.pointerId,
          startPoint: world
        });
        suppressCanvasClickRef.current = false;
        suppressPolygonClickRef.current = null;
        return;
      }

      if (tool === 'edit-vertices') {
        onViewportPointerDown(event);
      }
    },
    [dragState, onViewportPointerDown, setDragState, toWorldPoint, tool]
  );

  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (dragState?.kind === 'vertex' && polygonDraft) {
        const world = toWorldPoint(event);
        setPolygonDraft(draft => {
          if (!draft) {
            return draft;
          }

          return {
            ...draft,
            selectedVertexIndex: dragState.vertexIndex,
            vertices: draft.vertices.map((vertex, index) =>
              index === dragState.vertexIndex ? world : vertex
            )
          };
        });
        return;
      }

      if (dragState?.kind === 'marquee') {
        const currentPoint = toWorldPoint(event);
        setDragState({
          ...dragState,
          bounds: {
            maxX: Math.max(dragState.startPoint.x, currentPoint.x),
            maxZ: Math.max(dragState.startPoint.z, currentPoint.z),
            minX: Math.min(dragState.startPoint.x, currentPoint.x),
            minZ: Math.min(dragState.startPoint.z, currentPoint.z)
          },
          currentPoint
        });
        return;
      }

      if (dragState?.kind === 'polygon') {
        const world = toWorldPoint(event);
        const delta = {
          x: world.x - dragState.startPoint.x,
          z: world.z - dragState.startPoint.z
        };

        suppressCanvasClickRef.current = true;
        suppressPolygonClickRef.current = dragState.polygonId;
        setPolygonDraft(draft =>
          draft
            ? {
                ...translatePolygonDraft(
                  {
                    ...draft,
                    vertices: dragState.originalVertices
                  },
                  delta
                ),
                selectedVertexIndex: draft.selectedVertexIndex
              }
            : draft
        );
        setPolygonControlPointDrafts(
          dragState.controlPoints.map(controlPoint =>
            translateControlPointDraft(controlPoint, delta)
          )
        );
        return;
      }

      if (dragState?.kind === 'control-point') {
        const world = toWorldPoint(event);
        setControlPointDraft(draft => {
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
            z: world.z
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
      setControlPointDraft,
      setPolygonControlPointDrafts,
      setPolygonDraft,
      selectedControlPoint,
      toWorldPoint
    ]
  );

  const releaseCanvasDrag = useCallback(() => {
    const before = dragSnapshotRef.current;
    const after = snapshotRef.current;

      if (before && !snapshotsEqual(before, after)) {
        recordHistory({
          after,
          before,
          remoteTransitions: []
        });
      }

    dragSnapshotRef.current = null;
    setDragState(null);
  }, [recordHistory]);

  const handleCanvasPointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (dragState?.kind === 'marquee') {
        const width = Math.abs(
          dragState.currentPoint.x - dragState.startPoint.x
        );
        const height = Math.abs(
          dragState.currentPoint.z - dragState.startPoint.z
        );

        if (width < 1 && height < 1) {
          clearSelections();
          setPolygonDraft(null);
        } else {
          const selectedIds = polygons
            .filter(polygon =>
              polygonIntersectsBounds(polygon.vertices, dragState.bounds)
            )
            .map(polygon => polygon.id);

          if (selectedIds.length === 1) {
            const polygon = polygons.find(
              candidate => candidate.id === selectedIds[0]
            );
            updateSnapshot(
              current => ({
                ...current,
                controlPointDraft: null,
                polygonControlPointDrafts: [],
                polygonDraft: polygon ? createPolygonDraft(polygon) : null,
                selectedControlPointId: null,
                selectedIslandId: null,
                selectedPolygonIds: selectedIds,
                tool: current.tool
              }),
              true
            );
          } else {
            updateSnapshot(
              current => ({
                ...current,
                controlPointDraft: null,
                polygonControlPointDrafts: [],
                polygonDraft: null,
                selectedControlPointId: null,
                selectedIslandId: null,
                selectedPolygonIds: selectedIds,
                tool: current.tool
              }),
              true
            );
          }
          suppressCanvasClickRef.current = true;
        }
      }

      releaseCanvasDrag();
      onViewportPointerUp(event);
    },
    [
      clearSelections,
      dragState,
      onViewportPointerUp,
      polygons,
      releaseCanvasDrag,
      setPolygonDraft,
      updateSnapshot
    ]
  );

  const handleCanvasPointerCancel = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerCancel(event);
    },
    [onViewportPointerCancel, releaseCanvasDrag]
  );

  const handleCanvasPointerLeave = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      releaseCanvasDrag();
      onViewportPointerLeave(event);
    },
    [onViewportPointerLeave, releaseCanvasDrag]
  );

  const handleCanvasClick = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!map) {
        return;
      }

      if (tool === 'draw-polygon') {
        const world = toWorldPoint(event);
        setPolygonDraft(draft => {
          const nextDraft = draft ?? createPolygonDraft();
          return { ...nextDraft, vertices: [...nextDraft.vertices, world] };
        }, true);
        return;
      }

      if (tool === 'place-control-point') {
        const world = toWorldPoint(event);
        updateSnapshot(
          current => ({
            ...current,
            controlPointDraft: {
              ...createControlPointDraft(),
              x: world.x,
              z: world.z
            },
            polygonControlPointDrafts: [],
            selectedControlPointId: null,
            selectedIslandId: null,
            selectedPolygonIds: []
          }),
          true
        );
        return;
      }

      if (tool === 'select') {
        if (suppressCanvasClickRef.current) {
          suppressCanvasClickRef.current = false;
          return;
        }

        clearSelections();
        setPolygonDraft(null);
      }
    },
    [clearSelections, map, setPolygonDraft, toWorldPoint, tool, updateSnapshot]
  );

  const handlePolygonClick = useCallback(
    (event: MouseEvent<SVGPolygonElement>, polygon: SourcePolygonLike) => {
      if (suppressPolygonClickRef.current === polygon.id) {
        suppressPolygonClickRef.current = null;
        return;
      }

      if (tool !== 'select' && tool !== 'edit-vertices') {
        return;
      }

      updateSnapshot(
        current => {
          const nextSelection = nextOrderedSelection(
            current.selectedPolygonIds,
            polygon.id,
            event.shiftKey
          );

          return {
            ...current,
            controlPointDraft: null,
            polygonControlPointDrafts: [],
            polygonDraft:
              event.shiftKey || nextSelection.length !== 1
                ? null
                : createPolygonDraft(polygon),
            selectedControlPointId: null,
            selectedIslandId: null,
            selectedPolygonIds: nextSelection
          };
        },
        true
      );
    },
    [tool, updateSnapshot]
  );

  const handlePolygonPointerDown = useCallback(
    (event: PointerEvent<SVGPolygonElement>, polygon: SourcePolygonLike) => {
      if (tool === 'pan') {
        return;
      }

      event.stopPropagation();

      if (
        tool !== 'select' ||
        event.shiftKey ||
        selectedPolygon?.id !== polygon.id
      ) {
        return;
      }

      const editablePolygon =
        polygonDraft?.kind === 'edit' && polygonDraft.id === polygon.id
          ? polygonDraft
          : createPolygonDraft(polygon);

      interactionRef.current?.setPointerCapture(event.pointerId);
      setDragState({
        controlPoints: controlPoints
          .filter(point => pointInPolygon(point, editablePolygon.vertices))
          .map(point => createControlPointDraft(point)),
        kind: 'polygon',
        originalVertices: editablePolygon.vertices.map(vertex => ({ ...vertex })),
        pointerId: event.pointerId,
        polygonId: polygon.id,
        startPoint: toWorldPoint(event)
      });
      suppressCanvasClickRef.current = false;
      suppressPolygonClickRef.current = null;
    },
    [controlPoints, interactionRef, polygonDraft, selectedPolygon, setDragState, toWorldPoint, tool]
  );

  const handleControlPointClick = useCallback(
    (_event: MouseEvent<SVGCircleElement>, point: ControlPoint) => {
      if (tool !== 'select') {
        return;
      }

      updateSnapshot(
        current => ({
          ...current,
          controlPointDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft: null,
          selectedControlPointId: point.id,
          selectedIslandId: null,
          selectedPolygonIds: []
        }),
        true
      );
    },
    [tool, updateSnapshot]
  );

  const handleControlPointPointerDown = useCallback(
    (event: PointerEvent<SVGCircleElement>, point: ControlPoint) => {
      if (tool === 'pan') {
        return;
      }

      event.stopPropagation();

      if (tool !== 'select') {
        return;
      }

      interactionRef.current?.setPointerCapture(event.pointerId);
      updateSnapshot(
        current => ({
          ...current,
          controlPointDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft: null,
          selectedControlPointId: point.id,
          selectedIslandId: null,
          selectedPolygonIds: []
        }),
        true
      );
      setDragState({
        kind: 'control-point',
        pointId: point.id,
        pointerId: event.pointerId
      });
    },
    [interactionRef, setDragState, tool, updateSnapshot]
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
      const modifierPressed = event.metaKey || event.ctrlKey;
      if (modifierPressed && !pendingAction) {
        const isUndo = event.key.toLowerCase() === 'z' && !event.shiftKey;
        const isRedo =
          (event.key.toLowerCase() === 'z' && event.shiftKey) ||
          event.key.toLowerCase() === 'y';

        if (isUndo && canUndo) {
          event.preventDefault();
          void undo();
          return;
        }

        if (isRedo && canRedo) {
          event.preventDefault();
          void redo();
          return;
        }
      }

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
            polygonDraft.selectedVertexIndex
          )
        ) {
          event.preventDefault();
          setPolygonDraft(draft => {
            if (!draft || draft.selectedVertexIndex === null) {
              return draft;
            }

            return {
              ...draft,
              selectedVertexIndex: null,
              vertices: draft.vertices.filter(
                (_vertex, index) => index !== draft.selectedVertexIndex
              )
            };
          }, true);
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
            kind: 'control-point'
          });
          return;
        }
      }

      onViewportKeyDown(event);
    },
    [
      clearSelections,
      canRedo,
      canUndo,
      commitDrawPolygon,
      controlPointDraft,
      onViewportKeyDown,
      pendingAction,
      polygonDraft,
      redo,
      resetControlPointDraft,
      resetPolygonDraft,
      selectedControlPoint,
      selectedPolygon,
      setPolygonDraft,
      tool,
      undo
    ]
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
    (polygonDraft !== null &&
      isDraftDirty(
        polygonDraft,
        selectedPolygon && polygonDraft.kind === 'edit' ? selectedPolygon : null
      )) ||
    polygonControlPointDrafts.length > 0;

  const canApplyUnionLike = selectedPolygonIds.length >= 2 && !polygonDraft;
  const canApplyDifference = selectedPolygonIds.length === 2 && !polygonDraft;
  const overlayPolygons = polygons.filter(
    polygon => polygonDraft?.kind !== 'edit' || polygon.id !== polygonDraft.id
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
        canRedo={canRedo}
        canUndo={canUndo}
        onApplyBoolean={operation => void applyBooleanOperation(operation)}
        onBeginControlPoint={() => {
          updateSnapshot(
            current => ({
              ...current,
              controlPointDraft: null,
              polygonDraft: null,
              polygonControlPointDrafts: [],
              selectedControlPointId: null,
              selectedIslandId: null,
              selectedPolygonIds: [],
              tool: 'place-control-point'
            }),
            true
          );
        }}
        onBeginDrawPolygon={() => {
          updateSnapshot(
            current => ({
              ...current,
              controlPointDraft: null,
              polygonDraft: createPolygonDraft(),
              polygonControlPointDrafts: [],
              selectedControlPointId: null,
              selectedIslandId: null,
              selectedPolygonIds: [],
              tool: 'draw-polygon'
            }),
            true
          );
        }}
        onBeginVertexEdit={beginVertexEdit}
        onRedo={() => void redo()}
        onSelectTool={nextTool => setTool(nextTool, true)}
        onUndo={() => void undo()}
        pendingAction={pendingAction !== null}
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
          onControlPointClick={handleControlPointClick}
          onControlPointPointerDown={handleControlPointPointerDown}
          onCanvasClick={handleCanvasClick}
          onCanvasKeyDown={handleKeyDown}
          onCanvasPointerCancel={handleCanvasPointerCancel}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasPointerLeave={handleCanvasPointerLeave}
          onCanvasPointerMove={handleCanvasPointerMove}
          onCanvasPointerUp={handleCanvasPointerUp}
          onPolygonClick={handlePolygonClick}
          onPolygonPointerDown={handlePolygonPointerDown}
          onWheel={onWheel}
          onWheelCapture={handleWheelCapture}
          overlayPolygons={overlayPolygons}
          polygonDraft={polygonDraft}
          selectedControlPointId={selectedControlPointId}
          selectedPolygonIds={selectedPolygonIds}
          setDragState={setDragState}
          setPolygonDraft={setPolygonDraft}
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
            sourcePolygons: overviewQuery.data?.counts.sourcePolygons ?? 0
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
        onOpenChange={() => setDeleteTarget(null)}
      >
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
              variant="destructive"
            >
              {pendingAction ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
