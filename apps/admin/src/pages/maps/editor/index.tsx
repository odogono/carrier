import {
  isInfiniteMap,
  type ControlPoint,
  type DerivedIsland,
  type StaticEntity,
  type StaticEntityListItem,
  type SourcePolygon
} from 'carrier-contracts/types';
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
  getExactSelectedIslands,
  getIslandsBySelectedPolygons,
  filterArchetypeCatalog,
  getStaticEntityGroundingDiagnostics,
  getStaticEntitySnapMode,
  getTerrainGrids,
  mergeWorldBounds,
  nextIslandPolygonSelection,
  nextOrderedSelection,
  pointInPolygon,
  polygonIntersectsBounds,
  snapWorldPoint,
  type EditorTool
} from './helpers';
import {
  createControlPointDraft,
  createIslandDraft,
  createPolygonDraft,
  createStaticEntityDraft,
  expandBounds,
  getBoundsCenter,
  isDraftDirty,
  isStaticEntityDraftDirty,
  translateControlPointDraft,
  translateWorldPoint
} from './helpers/drafts';
import type {
  CanvasDragState,
  DeleteTarget,
  SourcePolygonLike
} from './helpers/types';
import { useElementSize } from './hooks/use-element-size';
import { useMapEditorActions } from './hooks/use-map-editor-actions';
import { useStaticEntityEditorActions } from './hooks/use-static-entity-editor-actions';
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

const EMPTY_CLUSTERS: readonly never[] = [];

export const MapEditorPage = () => {
  const { id } = useParams({ from: '/maps/$id/editor' });
  return <MapEditorPageContent id={id} key={id} />;
};

const MapEditorPageContent = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const interactionRef = useRef<SVGSVGElement>(null);
  const initialFitRef = useRef(false);
  const [containerRef, size] = useElementSize();

  const [editorRevision, setEditorRevision] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [dragState, setDragState] = useState<CanvasDragState>(null);
  const [activeCatalogCategory, setActiveCatalogCategory] = useState<
    StaticEntityListItem['archetype']['category'] | 'all'
  >('all');
  const [activeCatalogArchetypeId, setActiveCatalogArchetypeId] = useState<
    string | null
  >(null);
  const [activeCatalogSearch, setActiveCatalogSearch] = useState('');
  const [activeOutlinerArchetypeId, setActiveOutlinerArchetypeId] = useState<
    string | 'all'
  >('all');
  const [activeOutlinerCategory, setActiveOutlinerCategory] = useState<
    StaticEntityListItem['archetype']['category'] | 'all'
  >('all');
  const [activeOutlinerSearch, setActiveOutlinerSearch] = useState('');
  const [bulkScaleDraft, setBulkScaleDraft] = useState('1');
  const [bulkStateDraft, setBulkStateDraft] =
    useState<StaticEntity['state']>('active');
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
  const getCurrentSnapshot = useCallback(
    () => store.get(editorSnapshotAtom),
    [store]
  );
  const snapshotRef = useRef(snapshot);
  const dragSnapshotRef = useRef<EditorSnapshot | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const suppressEntityClickRef = useRef<string | null>(null);
  const suppressPolygonClickRef = useRef<string | null>(null);

  const {
    controlPointDraft,
    entityDraft,
    islandDraft,
    polygonControlPointDrafts,
    polygonDraft,
    selectedControlPointId,
    selectedEntityIds,
    selectedPolygonIds,
    tool
  } = snapshot;

  const {
    activeArchetypesQuery,
    assetVersionsById,
    controlPointsQuery,
    derivedIslandsQuery,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    map,
    mapQuery,
    overviewQuery,
    patchControlPoints,
    polygonsQuery,
    referencedArchetypesQuery,
    reloadAll,
    replaceSourcePolygons,
    staticEntitiesQuery
  } = useMapEditorData(id);

  const polygons = useMemo(
    () => polygonsQuery.data ?? [],
    [polygonsQuery.data]
  );
  const controlPoints = useMemo(
    () => controlPointsQuery.data ?? [],
    [controlPointsQuery.data]
  );
  const derivedIslands = useMemo(
    () => derivedIslandsQuery.data ?? [],
    [derivedIslandsQuery.data]
  );
  const activeArchetypes = useMemo(
    () => activeArchetypesQuery.data ?? [],
    [activeArchetypesQuery.data]
  );
  const staticEntityItems = useMemo(
    () => staticEntitiesQuery.data ?? [],
    [staticEntitiesQuery.data]
  );
  const islandsByPolygonId = useMemo(() => {
    const next = new Map<string, (typeof derivedIslands)[number]>();
    for (const island of derivedIslands) {
      for (const polygonId of island.sourcePolygonIds) {
        next.set(polygonId, island);
      }
    }
    return next;
  }, [derivedIslands]);

  const selectedPolygon =
    selectedPolygonIds.length === 1
      ? (polygons.find(polygon => polygon.id === selectedPolygonIds[0]) ?? null)
      : null;
  const selectedControlPoint = selectedControlPointId
    ? (controlPoints.find(point => point.id === selectedControlPointId) ?? null)
    : null;
  const selectedIslands = useMemo(
    () => getIslandsBySelectedPolygons(derivedIslands, selectedPolygonIds),
    [derivedIslands, selectedPolygonIds]
  );
  const exactSelectedIslands = useMemo(
    () => getExactSelectedIslands(derivedIslands, selectedPolygonIds),
    [derivedIslands, selectedPolygonIds]
  );
  const selectedIsland =
    exactSelectedIslands.length === 1 ? exactSelectedIslands[0]! : null;
  const selectedIslandIds = useMemo(
    () => selectedIslands.map(island => island.id),
    [selectedIslands]
  );

  const highlightedIslandPolygonIds = useMemo(
    () =>
      new Set(exactSelectedIslands.flatMap(island => island.sourcePolygonIds)),
    [exactSelectedIslands]
  );
  const referencedArchetypeIds = useMemo(
    () => new Set((referencedArchetypesQuery.data ?? []).map(archetype => archetype.id)),
    [referencedArchetypesQuery.data]
  );

  const filteredCatalogArchetypes = useMemo(() => {
    const byCategory =
      activeCatalogCategory === 'all'
        ? activeArchetypes
        : activeArchetypes.filter(
            archetype => archetype.category === activeCatalogCategory
          );
    return filterArchetypeCatalog(byCategory, activeCatalogSearch);
  }, [activeArchetypes, activeCatalogCategory, activeCatalogSearch]);
  const renderedControlPoints = useMemo(() => {
    if (polygonControlPointDrafts.length === 0) {
      return controlPoints;
    }

    const draftsById = new Map(
      polygonControlPointDrafts
        .filter(draft => draft.id)
        .map(draft => [draft.id as string, draft])
    );

    return controlPoints.map(point => {
      const draft = draftsById.get(point.id);
      return draft ? { ...point, ...draft } : point;
    });
  }, [controlPoints, polygonControlPointDrafts]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (dragState && dragSnapshotRef.current === null) {
      if (dragState.kind === 'polygon') {
        return;
      }
      dragSnapshotRef.current = snapshotRef.current;
      return;
    }

    if (!dragState) {
      dragSnapshotRef.current = null;
    }
  }, [dragState]);

  useEffect(() => {
    resetHistory(createEmptyEditorSnapshot());
  }, [resetHistory]);

  useEffect(() => {
    if (
      !activeCatalogArchetypeId &&
      filteredCatalogArchetypes.length > 0
    ) {
      setActiveCatalogArchetypeId(filteredCatalogArchetypes[0]!.id);
    }
  }, [activeCatalogArchetypeId, filteredCatalogArchetypes]);

  const updateSnapshot = useCallback(
    (
      updater: EditorSnapshot | ((current: EditorSnapshot) => EditorSnapshot),
      record = false
    ) => {
      const before = getCurrentSnapshot();
      const after = typeof updater === 'function' ? updater(before) : updater;

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
    [getCurrentSnapshot, recordHistory, setSnapshot]
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
          entityDraft: null,
          islandDraft: null,
          polygonControlPointDrafts: [],
          selectedControlPointId: null,
          selectedEntityIds: [],
          selectedIslandId: null,
          selectedPolygonIds: []
        }),
        record
      );
    },
    [updateSnapshot]
  );

  const snapshotFieldSetter =
    <K extends keyof EditorSnapshot>(field: K) =>
    (
      value:
        | EditorSnapshot[K]
        | ((current: EditorSnapshot[K]) => EditorSnapshot[K]),
      record = false
    ) => {
      updateSnapshot(
        current => ({
          ...current,
          [field]:
            typeof value === 'function'
              ? (value as (current: EditorSnapshot[K]) => EditorSnapshot[K])(
                  current[field]
                )
              : value
        }),
        record
      );
    };

  const setPolygonDraft = snapshotFieldSetter('polygonDraft');
  const setControlPointDraft = snapshotFieldSetter('controlPointDraft');
  const setEntityDraft = snapshotFieldSetter('entityDraft');
  const setIslandDraft = snapshotFieldSetter('islandDraft');
  const setPolygonControlPointDrafts = snapshotFieldSetter(
    'polygonControlPointDrafts'
  );

  const selectPolygonIds = useCallback(
    (polygonIds: string[], record = true) => {
      const nextPolygon =
        polygonIds.length === 1
          ? (polygons.find(polygon => polygon.id === polygonIds[0]) ?? null)
          : null;

      updateSnapshot(
        current => ({
          ...current,
          controlPointDraft: null,
          entityDraft: null,
          islandDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft: nextPolygon ? createPolygonDraft(nextPolygon) : null,
          selectedControlPointId: null,
          selectedEntityIds: [],
          selectedIslandId: null,
          selectedPolygonIds: polygonIds
        }),
        record
      );
    },
    [polygons, updateSnapshot]
  );

  const selectEntityIds = useCallback(
    (entityIds: string[], record = true) => {
      const nextEntity =
        entityIds.length === 1
          ? (staticEntityItems.find(item => item.entity.id === entityIds[0]) ??
              null)
          : null;

      updateSnapshot(
        current => ({
          ...current,
          controlPointDraft: null,
          entityDraft: nextEntity
            ? createStaticEntityDraft(nextEntity.entity)
            : null,
          islandDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft: null,
          selectedControlPointId: null,
          selectedEntityIds: entityIds,
          selectedIslandId: null,
          selectedPolygonIds: []
        }),
        record
      );
    },
    [staticEntityItems, updateSnapshot]
  );

  useEffect(() => {
    if (!map || isInfiniteMap(map)) {
      return;
    }

    toast.error('Only infinite-vector maps can open the editor');
    void navigate({ params: { id }, to: '/maps/$id' });
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

  const selectIsland = useCallback(
    (
      islandId: string,
      options?: {
        additive?: boolean;
        recenter?: boolean;
      }
    ) => {
      const island = derivedIslands.find(
        candidate => candidate.id === islandId
      );
      if (!island) {
        return;
      }

      const nextSelection = nextIslandPolygonSelection(
        snapshotRef.current.selectedPolygonIds,
        island.sourcePolygonIds,
        options?.additive ?? false
      );
      selectPolygonIds(nextSelection);
      setIslandDraft(
        nextSelection.length === island.sourcePolygonIds.length &&
          island.sourcePolygonIds.every(id => nextSelection.includes(id))
          ? createIslandDraft(island)
          : null
      );

      if (options?.recenter) {
        recenterOnWorldPoint(getBoundsCenter(island.bbox));
      }
    },
    [derivedIslands, recenterOnWorldPoint, selectPolygonIds, setIslandDraft]
  );

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

  const staticEntityViews = useMemo(
    () => {
      const terrains = map ? getTerrainGrids(chunks, map) : undefined;
      return staticEntityItems.map(item => {
        const assetVersion = assetVersionsById.get(item.archetype.assetVersionId);
        return {
          ...item,
          assetVersion: assetVersion ?? null,
          diagnostics: map
            ? getStaticEntityGroundingDiagnostics({
                assetVersion,
                chunks,
                entity: item.entity,
                map,
                terrains
              })
            : { status: 'pending' as const }
        };
      });
    },
    [assetVersionsById, chunks, map, staticEntityItems]
  );
  const selectedEntity = useMemo(
    () =>
      selectedEntityIds.length === 1
        ? (staticEntityViews.find(item => item.entity.id === selectedEntityIds[0]) ??
            null)
        : null,
    [selectedEntityIds, staticEntityViews]
  );
  const selectedStaticEntities = useMemo(
    () =>
      selectedEntityIds
        .map(id =>
          staticEntityViews.find(item => item.entity.id === id)?.entity ?? null
        )
        .filter((entity): entity is StaticEntity => entity !== null),
    [selectedEntityIds, staticEntityViews]
  );

  useEffect(() => {
    if (
      selectedEntityIds.length === 1 &&
      selectedEntity &&
      entityDraft === null
    ) {
      setEntityDraft(createStaticEntityDraft(selectedEntity.entity));
    }
  }, [entityDraft, selectedEntity, selectedEntityIds, setEntityDraft]);

  const filteredStaticEntityViews = useMemo(() => {
    const query = activeOutlinerSearch.trim().toLowerCase();
    return staticEntityViews.filter(item => {
      if (
        activeOutlinerCategory !== 'all' &&
        item.archetype.category !== activeOutlinerCategory
      ) {
        return false;
      }

      if (
        activeOutlinerArchetypeId !== 'all' &&
        item.archetype.id !== activeOutlinerArchetypeId
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [item.entity.id, item.entity.label ?? '', item.archetype.name]
        .map(value => value.toLowerCase())
        .some(value => value.includes(query));
    });
  }, [
    activeOutlinerArchetypeId,
    activeOutlinerCategory,
    activeOutlinerSearch,
    staticEntityViews
  ]);

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
      polygonControlPointDrafts: [],
      polygonDraft: null,
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

    updateSnapshot(
      current => ({
        ...current,
        controlPointDraft: null,
        entityDraft: null,
        islandDraft: null,
        polygonControlPointDrafts: [],
        polygonDraft: createPolygonDraft(selectedPolygon),
        tool: 'edit-vertices'
      }),
      true
    );
  }, [selectedPolygon, updateSnapshot]);

  const beginControlPoint = useCallback(() => {
    updateSnapshot(
      current => ({
        ...current,
        controlPointDraft: null,
        entityDraft: null,
        islandDraft: null,
        polygonControlPointDrafts: [],
        polygonDraft: null,
        selectedControlPointId: null,
        selectedEntityIds: [],
        selectedIslandId: null,
        selectedPolygonIds: [],
        tool: 'place-control-point'
      }),
      true
    );
  }, [updateSnapshot]);

  const beginPlaceEntity = useCallback(() => {
    updateSnapshot(
      current => ({
        ...current,
        controlPointDraft: null,
        entityDraft: null,
        islandDraft: null,
        polygonControlPointDrafts: [],
        polygonDraft: null,
        selectedControlPointId: null,
        selectedEntityIds: [],
        selectedIslandId: null,
        selectedPolygonIds: [],
        tool: 'place-entity'
      }),
      true
    );
  }, [updateSnapshot]);

  const beginDrawPolygon = useCallback(() => {
    updateSnapshot(
      current => ({
        ...current,
        controlPointDraft: null,
        entityDraft: null,
        islandDraft: null,
        polygonControlPointDrafts: [],
        polygonDraft: createPolygonDraft(),
        selectedControlPointId: null,
        selectedEntityIds: [],
        selectedIslandId: null,
        selectedPolygonIds: [],
        tool: 'draw-polygon'
      }),
      true
    );
  }, [updateSnapshot]);

  const activeEditorRevision = editorRevision ?? map?.revision ?? null;
  const activePlaceableArchetypeId =
    activeCatalogArchetypeId ??
    filteredCatalogArchetypes[0]?.id ??
    activeArchetypes[0]?.id ??
    null;

  const {
    applyBooleanOperation,
    confirmDelete,
    pendingAction,
    redo,
    saveControlPointDraft,
    saveDraggedSelection,
    saveIslandDraft,
    savePolygonDraft,
    undo
  } = useMapEditorActions({
    controlPointDraft,
    controlPoints,
    deleteTarget,
    editorRevision: activeEditorRevision,
    fitToWorldBounds,
    getHistoryState,
    historySnapshot: snapshot,
    id,
    invalidateIslandMetadataQueries,
    invalidateTerrainMutation,
    islandDraft,
    map,
    patchControlPoints,
    polygonControlPointDrafts,
    polygonDraft,
    polygons,
    recordHistory,
    reloadAll,
    replaceSourcePolygons,
    selectedControlPoint,
    selectedPolygon,
    selectedPolygonIds,
    setDeleteTarget,
    setEditorRevision,
    setHistoryState,
    setIslandDraft,
    setSnapshot
  });
  const {
    applyBulkEntityEdit,
    applyEntityDraft,
    deleteStaticEntities,
    duplicateSelectedEntities,
    pendingAction: pendingEntityAction,
    placeEntity,
    saveDraggedEntities,
    saveRotatedEntity
  } = useStaticEntityEditorActions({
    activeArchetypeId: activePlaceableArchetypeId,
    editorRevision: activeEditorRevision,
    entityDraft,
    map,
    mapId: id,
    onSelectEntities: selectEntityIds,
    onSetEntityDraft: setEntityDraft,
    reloadAll,
    selectedEntityIds,
    setEditorRevision,
    staticEntityItems
  });
  const pendingEditorAction = pendingAction ?? pendingEntityAction;
  const overlayPolygons = useMemo(
    () =>
      polygons.filter(
        polygon =>
          polygonDraft?.kind !== 'edit' || polygon.id !== polygonDraft.id
      ),
    [polygons, polygonDraft]
  );

  const renderedPolygons = useMemo(() => {
    if (dragState?.kind !== 'polygon') {
      return overlayPolygons;
    }

    const previewById = new Map(
      dragState.polygons.map(polygon => [
        polygon.id,
        {
          id: polygon.id,
          params: polygon.params,
          vertices: polygon.vertices.map(vertex =>
            translateWorldPoint(vertex, dragState.currentDelta)
          )
        }
      ])
    );

    return overlayPolygons.map(
      polygon => previewById.get(polygon.id) ?? polygon
    );
  }, [dragState, overlayPolygons]);
  const renderedStaticEntityViews = useMemo(() => {
    if (dragState?.kind === 'static-entity') {
      const previewById = new Map(
        dragState.entities.map(entity => [
          entity.id,
          {
            ...entity,
            position: translateWorldPoint(entity.position, dragState.currentDelta)
          }
        ])
      );

      return staticEntityViews.map(item => ({
        ...item,
        entity: previewById.get(item.entity.id) ?? item.entity
      }));
    }

    if (dragState?.kind === 'static-entity-rotate') {
      return staticEntityViews.map(item =>
        item.entity.id === dragState.entity.id
          ? {
              ...item,
              entity: {
                ...item.entity,
                rotation: {
                  yaw: dragState.currentYaw
                }
              }
            }
          : item
      );
    }

    return staticEntityViews;
  }, [dragState, staticEntityViews]);

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
        suppressPolygonClickRef.current = dragState.polygons[0]?.id ?? null;
        setDragState(current =>
          current?.kind === 'polygon'
            ? {
                ...current,
                currentDelta: delta
              }
            : current
        );
        setPolygonControlPointDrafts(
          dragState.controlPoints.map(controlPoint =>
            translateControlPointDraft(controlPoint, delta)
          )
        );
        return;
      }

      if (dragState?.kind === 'static-entity' && map) {
        const world = snapWorldPoint(
          toWorldPoint(event),
          map.resolution.metersPerTile,
          getStaticEntitySnapMode(event)
        );
        const delta = {
          x: world.x - dragState.startPoint.x,
          z: world.z - dragState.startPoint.z
        };

        suppressCanvasClickRef.current = true;
        suppressEntityClickRef.current = dragState.entities[0]?.id ?? null;
        setDragState(current =>
          current?.kind === 'static-entity'
            ? {
                ...current,
                currentDelta: delta
              }
            : current
        );
        return;
      }

      if (dragState?.kind === 'static-entity-rotate') {
        const world = toWorldPoint(event);
        const currentYaw =
          (Math.atan2(
            world.x - dragState.entity.position.x,
            -(world.z - dragState.entity.position.z)
          ) *
            180) /
          Math.PI;

        suppressCanvasClickRef.current = true;
        suppressEntityClickRef.current = dragState.entity.id;
        setDragState(current =>
          current?.kind === 'static-entity-rotate'
            ? {
                ...current,
                currentYaw
              }
            : current
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
      map,
      setControlPointDraft,
      setDragState,
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
                entityDraft: null,
                islandDraft: null,
                polygonControlPointDrafts: [],
                polygonDraft: polygon ? createPolygonDraft(polygon) : null,
                selectedControlPointId: null,
                selectedEntityIds: [],
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
                entityDraft: null,
                islandDraft: null,
                polygonControlPointDrafts: [],
                polygonDraft: null,
                selectedControlPointId: null,
                selectedEntityIds: [],
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

      if (dragState?.kind === 'polygon') {
        const moved =
          Math.abs(dragState.currentDelta.x) >= 0.001 ||
          Math.abs(dragState.currentDelta.z) >= 0.001;

        if (moved) {
          const dragSelection = {
            afterControlPoints: dragState.controlPoints.map(controlPoint =>
              translateControlPointDraft(controlPoint, dragState.currentDelta)
            ),
            afterPolygons: dragState.polygons.map(polygon => ({
              ...polygon,
              vertices: polygon.vertices.map(vertex =>
                translateWorldPoint(vertex, dragState.currentDelta)
              )
            })),
            beforeControlPoints: dragState.controlPoints
              .map(
                controlPoint =>
                  controlPoints.find(point => point.id === controlPoint.id) ??
                  null
              )
              .filter((point): point is ControlPoint => point !== null),
            beforePolygons: dragState.polygons
              .map(
                polygon =>
                  polygons.find(candidate => candidate.id === polygon.id) ??
                  null
              )
              .filter(
                (polygon): polygon is (typeof polygons)[number] =>
                  polygon !== null
              )
          };

          void saveDraggedSelection(dragSelection).finally(() => {
            setPolygonControlPointDrafts([]);
            setDragState(null);
          });
        } else {
          setPolygonControlPointDrafts([]);
          setDragState(null);
        }
        onViewportPointerUp(event);
        return;
      }

      if (dragState?.kind === 'static-entity') {
        const moved =
          Math.abs(dragState.currentDelta.x) >= 0.001 ||
          Math.abs(dragState.currentDelta.z) >= 0.001;

        if (moved) {
          void saveDraggedEntities(
            dragState.entities.map(entity => ({
              ...entity,
              position: translateWorldPoint(entity.position, dragState.currentDelta)
            }))
          ).finally(() => {
            setDragState(null);
          });
        } else {
          setDragState(null);
        }
        onViewportPointerUp(event);
        return;
      }

      if (dragState?.kind === 'static-entity-rotate') {
        const changed =
          Math.abs(dragState.currentYaw - dragState.startYaw) >= 0.001;

        if (changed) {
          void saveRotatedEntity(
            dragState.entity.id,
            dragState.currentYaw
          ).finally(() => {
            setDragState(null);
          });
        } else {
          setDragState(null);
        }
        onViewportPointerUp(event);
        return;
      }

      if (dragState?.kind === 'control-point') {
        // Pointer capture is on the SVG, so the following click retargets to the
        // SVG and would look like a backdrop tap (see handleCanvasClick).
        suppressCanvasClickRef.current = true;
      }

      releaseCanvasDrag();
      onViewportPointerUp(event);
    },
    [
      clearSelections,
      controlPoints,
      dragState,
      onViewportPointerUp,
      polygons,
      releaseCanvasDrag,
      saveDraggedEntities,
      saveRotatedEntity,
      saveDraggedSelection,
      setDragState,
      setPolygonControlPointDrafts,
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
            entityDraft: null,
            islandDraft: null,
            polygonControlPointDrafts: [],
            selectedControlPointId: null,
            selectedEntityIds: [],
            selectedIslandId: null,
            selectedPolygonIds: []
          }),
          true
        );
        return;
      }

      if (tool === 'place-entity') {
        const world = toWorldPoint(event);
        void placeEntity(world);
        return;
      }

      if (tool === 'select') {
        if (suppressCanvasClickRef.current) {
          suppressCanvasClickRef.current = false;
          return;
        }

        // Only clear when the click hits the SVG backdrop. Child geometry stops
        // propagation, but some environments still deliver a bubbled click here.
        if (event.target !== event.currentTarget) {
          return;
        }

        clearSelections();
        setPolygonDraft(null);
      }
    },
    [
      clearSelections,
      map,
      placeEntity,
      setPolygonDraft,
      toWorldPoint,
      tool,
      updateSnapshot
    ]
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

      const island = islandsByPolygonId.get(polygon.id);
      if (island) {
        selectIsland(island.id, {
          additive: event.shiftKey
        });
        return;
      }

      updateSnapshot(current => {
        const nextSelection = nextOrderedSelection(
          current.selectedPolygonIds,
          polygon.id,
          event.shiftKey
        );

        return {
          ...current,
          controlPointDraft: null,
          entityDraft: null,
          islandDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft:
            event.shiftKey || nextSelection.length !== 1
              ? null
              : createPolygonDraft(polygon),
          selectedControlPointId: null,
          selectedEntityIds: [],
          selectedIslandId: null,
          selectedPolygonIds: nextSelection
        };
      }, true);
    },
    [islandsByPolygonId, selectIsland, tool, updateSnapshot]
  );

  const handleStaticEntityClick = useCallback(
    (event: MouseEvent<SVGElement>, entity: StaticEntity) => {
      if (suppressEntityClickRef.current === entity.id) {
        suppressEntityClickRef.current = null;
        return;
      }

      if (tool !== 'select') {
        return;
      }

      const nextSelection = nextOrderedSelection(
        selectedEntityIds,
        entity.id,
        event.shiftKey
      );
      selectEntityIds(nextSelection);
    },
    [selectEntityIds, selectedEntityIds, tool]
  );

  const handleStaticEntityPointerDown = useCallback(
    (event: PointerEvent<SVGElement>, entity: StaticEntity) => {
      if (tool === 'pan') {
        return;
      }

      event.stopPropagation();

      if (
        tool !== 'select' ||
        event.shiftKey ||
        !selectedEntityIds.includes(entity.id)
      ) {
        return;
      }

      interactionRef.current?.setPointerCapture(event.pointerId);
      setDragState({
        currentDelta: { x: 0, z: 0 },
        entities:
          selectedStaticEntities.length > 0 ? selectedStaticEntities : [entity],
        kind: 'static-entity',
        pointerId: event.pointerId,
        startPoint: toWorldPoint(event)
      });
      suppressCanvasClickRef.current = false;
      suppressEntityClickRef.current = null;
    },
    [
      interactionRef,
      selectedEntityIds,
      selectedStaticEntities,
      setDragState,
      toWorldPoint,
      tool
    ]
  );

  const handleStaticEntityRotatePointerDown = useCallback(
    (event: PointerEvent<SVGCircleElement>, entity: StaticEntity) => {
      if (tool !== 'select') {
        return;
      }

      event.stopPropagation();
      interactionRef.current?.setPointerCapture(event.pointerId);
      setDragState({
        currentYaw: entity.rotation.yaw,
        entity,
        kind: 'static-entity-rotate',
        pointerId: event.pointerId,
        startAngle: entity.rotation.yaw,
        startYaw: entity.rotation.yaw
      });
      suppressCanvasClickRef.current = false;
      suppressEntityClickRef.current = null;
    },
    [interactionRef, setDragState, tool]
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
        !selectedPolygonIds.includes(polygon.id)
      ) {
        return;
      }

      const selectedPolygons = selectedPolygonIds
        .map(id => polygons.find(candidate => candidate.id === id))
        .filter(
          (candidate): candidate is (typeof polygons)[number] =>
            candidate !== undefined
        );
      const selectedPolygonControlPoints = controlPoints.filter(point =>
        selectedPolygons.some(selectedCandidate =>
          pointInPolygon(point, selectedCandidate.vertices)
        )
      );

      interactionRef.current?.setPointerCapture(event.pointerId);
      setDragState({
        controlPoints: selectedPolygonControlPoints.map(point =>
          createControlPointDraft(point)
        ),
        currentDelta: { x: 0, z: 0 },
        kind: 'polygon',
        pointerId: event.pointerId,
        polygons: selectedPolygons.map(selectedCandidate => ({
          id: selectedCandidate.id,
          params: selectedCandidate.params,
          vertices: selectedCandidate.vertices.map(vertex => ({ ...vertex }))
        })),
        startPoint: toWorldPoint(event)
      });
      suppressCanvasClickRef.current = false;
      suppressPolygonClickRef.current = null;
    },
    [
      controlPoints,
      interactionRef,
      polygons,
      selectedPolygonIds,
      setDragState,
      toWorldPoint,
      tool
    ]
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
          entityDraft: null,
          islandDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft: null,
          selectedControlPointId: point.id,
          selectedEntityIds: [],
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
          entityDraft: null,
          islandDraft: null,
          polygonControlPointDrafts: [],
          polygonDraft: null,
          selectedControlPointId: point.id,
          selectedEntityIds: [],
          selectedIslandId: null,
          selectedPolygonIds: []
        }),
        true
      );
      setDragState({
        kind: 'control-point',
        pointerId: event.pointerId,
        pointId: point.id
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
      if (modifierPressed && !pendingEditorAction) {
        const isUndo = event.key.toLowerCase() === 'z' && !event.shiftKey;
        const isRedo =
          (event.key.toLowerCase() === 'z' && event.shiftKey) ||
          event.key.toLowerCase() === 'y';
        const isDuplicate = event.key.toLowerCase() === 'd';

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

        if (isDuplicate && selectedEntityIds.length > 0) {
          event.preventDefault();
          void duplicateSelectedEntities();
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
        !pendingEditorAction
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

        if (selectedEntityIds.length > 0) {
          event.preventDefault();
          setDeleteTarget({
            ids: selectedEntityIds,
            kind: 'static-entity'
          });
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
      duplicateSelectedEntities,
      onViewportKeyDown,
      pendingEditorAction,
      polygonDraft,
      redo,
      resetControlPointDraft,
      resetPolygonDraft,
      selectedControlPoint,
      selectedEntityIds,
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
  const currentEntityForInspector =
    entityDraft ??
    (selectedEntity ? createStaticEntityDraft(selectedEntity.entity) : null);
  const islandInspectorDraft =
    islandDraft ?? (selectedIsland ? createIslandDraft(selectedIsland) : null);
  const polygonDirty =
    (polygonDraft !== null &&
      isDraftDirty(
        polygonDraft,
        selectedPolygon && polygonDraft.kind === 'edit' ? selectedPolygon : null
      )) ||
    polygonControlPointDrafts.length > 0;
  const entityDirty =
    currentEntityForInspector !== null &&
    isStaticEntityDraftDirty(
      currentEntityForInspector,
      selectedEntity?.entity ?? null
    );

  useEffect(() => {
    if (selectedEntityIds.length === 0) {
      return;
    }

    const firstEntity = selectedStaticEntities[0];
    if (!firstEntity) {
      return;
    }

    const nextScale = String(firstEntity.scale);
    setBulkScaleDraft(current => (current === nextScale ? current : nextScale));
    setBulkStateDraft(current =>
      current === firstEntity.state ? current : firstEntity.state
    );
  }, [selectedEntityIds, selectedStaticEntities]);

  const canApplyUnionLike = selectedPolygonIds.length >= 2 && !polygonDraft;
  const canApplyDifference = selectedPolygonIds.length === 2 && !polygonDraft;
  const hasUnsavedChanges =
    polygonDirty ||
    controlPointDraft !== null ||
    entityDirty ||
    islandDraft !== null;
  const toolLabel = getToolLabel(tool);
  const selectionSummary = getSelectionSummary({
    selectedEntity,
    selectedEntityCount: selectedEntityIds.length,
    polygonDraft,
    selectedControlPoint,
    selectedIsland,
    selectedIslandCount: exactSelectedIslands.length,
    selectedPolygon,
    selectedPolygonCount: selectedPolygonIds.length,
    tool
  });
  const nextActionHint = getNextActionHint({
    selectedEntity: Boolean(selectedEntity),
    selectedEntityCount: selectedEntityIds.length,
    polygonDraft,
    selectedControlPoint: Boolean(selectedControlPoint),
    selectedIslandCount: exactSelectedIslands.length,
    selectedPolygon: Boolean(selectedPolygon),
    selectedPolygonCount: selectedPolygonIds.length,
    tool
  });

  if (mapQuery.isLoading) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  if (!map || !isInfiniteMap(map)) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link params={{ id }} to="/maps/$id">
          <Button size="icon" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-3xl font-bold tracking-tight">
            {map.name ?? 'Unnamed Map'} Editor
          </h2>
          <p className="font-mono text-sm text-muted-foreground">{map.id}</p>
        </div>
        <Badge variant="secondary">Revision {activeEditorRevision}</Badge>
        <Badge
          className={
            pendingEditorAction
              ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
              : hasUnsavedChanges
                ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                : undefined
          }
          variant={pendingEditorAction || hasUnsavedChanges ? 'outline' : 'secondary'}
        >
          {pendingEditorAction
            ? 'Saving changes…'
            : hasUnsavedChanges
              ? 'Unsaved changes'
              : 'All changes saved'}
        </Badge>
      </div>

      <EditorToolbar
        booleanActionsVisible={canApplyUnionLike}
        canApplyDifference={canApplyDifference}
        canApplyUnionLike={canApplyUnionLike}
        canRedo={canRedo}
        canUndo={canUndo}
        onApplyBoolean={operation => void applyBooleanOperation(operation)}
        onBeginControlPoint={beginControlPoint}
        onBeginDrawPolygon={beginDrawPolygon}
        onBeginPlaceEntity={beginPlaceEntity}
        onBeginVertexEdit={beginVertexEdit}
        onRedo={() => void redo()}
        onSelectTool={nextTool => setTool(nextTool, true)}
        onUndo={() => void undo()}
        pendingAction={pendingEditorAction !== null}
        selectedPolygon={Boolean(selectedPolygon)}
        tool={tool}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EditorCanvas
          chunks={chunks}
          commitDrawPolygon={commitDrawPolygon}
          containerRef={containerRef}
          controlPointDraft={controlPointDraft}
          controlPoints={renderedControlPoints}
          dragState={dragState}
          entityItems={renderedStaticEntityViews}
          fitToView={fitToView}
          highlightedIslandPolygonIds={highlightedIslandPolygonIds}
          interactionRef={interactionRef}
          map={map}
          nextActionHint={nextActionHint}
          onCanvasClick={handleCanvasClick}
          onCanvasKeyDown={handleKeyDown}
          onCanvasPointerCancel={handleCanvasPointerCancel}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasPointerLeave={handleCanvasPointerLeave}
          onCanvasPointerMove={handleCanvasPointerMove}
          onCanvasPointerUp={handleCanvasPointerUp}
          onControlPointClick={handleControlPointClick}
          onControlPointPointerDown={handleControlPointPointerDown}
          onStaticEntityClick={handleStaticEntityClick}
          onStaticEntityPointerDown={handleStaticEntityPointerDown}
          onStaticEntityRotatePointerDown={handleStaticEntityRotatePointerDown}
          onPolygonClick={handlePolygonClick}
          onPolygonPointerDown={handlePolygonPointerDown}
          onWheel={onWheel}
          onWheelCapture={handleWheelCapture}
          overlayPolygons={renderedPolygons}
          polygonDraft={polygonDraft}
          selectedControlPointId={selectedControlPointId}
          selectedEntityIds={selectedEntityIds}
          selectedPolygonIds={selectedPolygonIds}
          selectionSummary={selectionSummary}
          setDragState={setDragState}
          setPolygonDraft={setPolygonDraft}
          size={size}
          tool={tool}
          toolLabel={toolLabel}
          toScreenPoint={toScreenPoint}
          toWorldPoint={toWorldPoint}
          viewport={viewport}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
        />

        <EditorSidebar
          activeCatalogArchetypeId={activePlaceableArchetypeId}
          activeCatalogCategory={activeCatalogCategory}
          activeCatalogSearch={activeCatalogSearch}
          activeOutlinerArchetypeId={activeOutlinerArchetypeId}
          activeOutlinerCategory={activeOutlinerCategory}
          activeOutlinerSearch={activeOutlinerSearch}
          activeTool={tool}
          activeToolLabel={toolLabel}
          bulkScaleDraft={bulkScaleDraft}
          bulkStateDraft={bulkStateDraft}
          catalogArchetypes={activeArchetypes}
          controlPointDraft={controlPointDraft}
          counts={{
            controlPoints: overviewQuery.data?.counts.controlPoints ?? 0,
            derivedIslands: overviewQuery.data?.counts.derivedIslands ?? 0,
            sourcePolygons: overviewQuery.data?.counts.sourcePolygons ?? 0,
            staticEntities: staticEntityItems.length
          }}
          currentControlPointForInspector={currentControlPointForInspector}
          currentEntityForInspector={currentEntityForInspector}
          currentPolygonForInspector={currentPolygonForInspector}
          derivedIslands={derivedIslands}
          islandDraft={islandDraft}
          islandInspectorDraft={islandInspectorDraft}
          nextActionHint={nextActionHint}
          onApplyBulkEntityEdit={draft =>
            void applyBulkEntityEdit(draft)
          }
          onBeginControlPoint={beginControlPoint}
          onBeginDrawPolygon={beginDrawPolygon}
          onBeginPlaceEntity={beginPlaceEntity}
          onDuplicateStaticEntities={() => void duplicateSelectedEntities()}
          onJumpToEntity={entity =>
            recenterOnWorldPoint(entity.entity.position)
          }
          onPickCatalogArchetype={archetypeId => setActiveCatalogArchetypeId(archetypeId)}
          onRecenter={recenterOnWorldPoint}
          onResetControlPointDraft={resetControlPointDraft}
          onResetEntityDraft={() =>
            setEntityDraft(
              selectedEntity ? createStaticEntityDraft(selectedEntity.entity) : null
            )
          }
          onResetPolygonDraft={resetPolygonDraft}
          onSaveControlPointDraft={() => void saveControlPointDraft()}
          onSaveEntityDraft={() => void applyEntityDraft()}
          onSaveIslandDraft={() => void saveIslandDraft()}
          onSavePolygonDraft={() => void savePolygonDraft()}
          onSelectIsland={selectIsland}
          onSelectStaticEntities={selectEntityIds}
          onSelectTool={nextTool => setTool(nextTool, true)}
          onSetBulkScaleDraft={setBulkScaleDraft}
          onSetBulkStateDraft={setBulkStateDraft}
          onSetCatalogCategory={setActiveCatalogCategory}
          onSetCatalogSearch={setActiveCatalogSearch}
          onSetOutlinerArchetypeId={setActiveOutlinerArchetypeId}
          onSetOutlinerCategory={setActiveOutlinerCategory}
          onSetOutlinerSearch={setActiveOutlinerSearch}
          overviewBounds={overviewBounds}
          overviewClusters={overviewQuery.data?.clusters ?? EMPTY_CLUSTERS}
          pendingAction={pendingEditorAction !== null}
          referencedArchetypeIds={referencedArchetypeIds}
          selectedEntity={selectedEntity}
          selectedEntityCount={selectedEntityIds.length}
          selectedEntityIds={selectedEntityIds}
          polygonDirty={polygonDirty}
          entityDirty={entityDirty}
          polygonDraft={polygonDraft}
          selectedControlPoint={selectedControlPoint}
          selectedIsland={selectedIsland}
          selectedIslandCount={exactSelectedIslands.length}
          selectedIslandIds={selectedIslandIds}
          selectedPolygon={selectedPolygon}
          selectedPolygonCount={selectedPolygonIds.length}
          selectionSummary={selectionSummary}
          setControlPointDraft={setControlPointDraft}
          setDeleteTarget={setDeleteTarget}
          setEntityDraft={setEntityDraft}
          setIslandDraft={setIslandDraft}
          setPolygonDraft={setPolygonDraft}
          staticEntityItems={filteredStaticEntityViews}
          viewportBounds={viewportWorldBounds}
        />
      </div>

      <Dialog
        onOpenChange={() => setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete{' '}
              {deleteTarget?.kind === 'polygon'
                ? 'Polygon'
                : deleteTarget?.kind === 'control-point'
                  ? 'Control Point'
                  : deleteTarget?.kind === 'static-entity' &&
                      deleteTarget.ids.length === 1
                    ? 'Entity'
                    : 'Entities'}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === 'static-entity'
                ? 'This will remove the selected static entity placements and refresh visible chunks after the mutation succeeds.'
                : 'This will remove the selected authored object and refresh affected terrain chunks after the mutation succeeds.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteTarget(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={pendingEditorAction !== null}
              onClick={() =>
                deleteTarget?.kind === 'static-entity'
                  ? void deleteStaticEntities(deleteTarget.ids).finally(() =>
                      setDeleteTarget(null)
                    )
                  : void confirmDelete()
              }
              variant="destructive"
            >
              {pendingEditorAction ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const getToolLabel = (tool: EditorTool) => {
  switch (tool) {
    case 'pan':
      return 'Pan View';
    case 'place-entity':
      return 'Place Entity';
    case 'draw-polygon':
      return 'Draw Polygon';
    case 'edit-vertices':
      return 'Edit Vertices';
    case 'place-control-point':
      return 'Add Control Point';
    case 'select':
    default:
      return 'Select';
  }
};

const getSelectionSummary = ({
  polygonDraft,
  selectedControlPoint,
  selectedEntity,
  selectedEntityCount,
  selectedIsland,
  selectedIslandCount,
  selectedPolygon,
  selectedPolygonCount,
  tool
}: {
  polygonDraft: EditorSnapshot['polygonDraft'];
  selectedControlPoint: ControlPoint | null;
  selectedEntity: { entity: StaticEntity } | null;
  selectedEntityCount: number;
  selectedIsland: DerivedIsland | null;
  selectedIslandCount: number;
  selectedPolygon: SourcePolygon | null;
  selectedPolygonCount: number;
  tool: EditorTool;
}) => {
  if (selectedEntityCount > 1) {
    return `${selectedEntityCount} entities selected`;
  }

  if (selectedEntity) {
    return selectedEntity.entity.label?.trim()
      ? `Entity: ${selectedEntity.entity.label}`
      : `Entity: ${selectedEntity.entity.id}`;
  }

  if (selectedControlPoint) {
    return '1 control point selected';
  }

  if (selectedPolygonCount > 1) {
    return `${selectedPolygonCount} polygons selected`;
  }

  if (selectedPolygon) {
    return '1 polygon selected';
  }

  if (selectedIslandCount > 1) {
    return `${selectedIslandCount} islands selected`;
  }

  if (selectedIsland) {
    return selectedIsland.name?.trim()
      ? `Island: ${selectedIsland.name}`
      : '1 island selected';
  }

  if (tool === 'draw-polygon' && polygonDraft) {
    return polygonDraft.vertices.length > 0
      ? `${polygonDraft.vertices.length} vertices in draft`
      : 'Polygon draft started';
  }

  if (tool === 'place-control-point') {
    return 'Ready to place a control point';
  }

  if (tool === 'place-entity') {
    return 'Ready to place a static entity';
  }

  return 'Nothing selected';
};

const getNextActionHint = ({
  polygonDraft,
  selectedControlPoint,
  selectedEntity,
  selectedEntityCount,
  selectedIslandCount,
  selectedPolygon,
  selectedPolygonCount,
  tool
}: {
  polygonDraft: EditorSnapshot['polygonDraft'];
  selectedControlPoint: boolean;
  selectedEntity: boolean;
  selectedEntityCount: number;
  selectedIslandCount: number;
  selectedPolygon: boolean;
  selectedPolygonCount: number;
  tool: EditorTool;
}) => {
  if (tool === 'place-entity') {
    return 'Choose an archetype in the Entities tab, then click on the canvas to place it.';
  }

  if (tool === 'draw-polygon') {
    return polygonDraft && polygonDraft.vertices.length > 0
      ? 'Click to place more vertices, then press Enter or click the first vertex to save.'
      : 'Click on the canvas to place the first polygon vertex.';
  }

  if (tool === 'edit-vertices') {
    return 'Drag a vertex to reshape the polygon or click an edge to insert a new one.';
  }

  if (tool === 'place-control-point') {
    return 'Click on the canvas to place a new terrain control point.';
  }

  if (tool === 'pan') {
    return 'Drag the canvas to move around the map and scroll to zoom.';
  }

  if (selectedControlPoint) {
    return 'Adjust values in the inspector or drag the control point on the canvas.';
  }

  if (selectedEntity) {
    return 'Adjust values in the inspector, drag the footprint to move it, or use the rotate handle on the canvas.';
  }

  if (selectedPolygon) {
    return 'Edit terrain parameters in the inspector or drag the selected polygon to move it.';
  }

  if (selectedEntityCount > 1) {
    return 'Use bulk controls in the sidebar, or duplicate or delete the current entity selection.';
  }

  if (selectedIslandCount > 1 || selectedPolygonCount > 1) {
    return 'Use boolean actions from the toolbar or drag the selected geometry together on the canvas.';
  }

  return 'Select geometry or entities to inspect them, or start a new placement, polygon, or control point.';
};
