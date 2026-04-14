import {
  type ControlPoint,
  type DerivedIsland,
  type SourcePolygon,
  type StaticEntity,
  type StaticEntityListItem,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';
import {
  computeAreaHeightEdits,
  createZarchTileEditState,
  getAreaHeightPreview,
  getDraftEdits,
  getHeightSelectionTiles,
  getMergedTileState,
  getPreviewHaloTiles,
  reduceZarchTileEditState,
  type TilePoint,
  type ZarchTileEditState,
  type ZarchTileEditTool
} from 'carrier-terrain-edit';
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
import { client } from '@/lib/api-client';
import { createChunkMapTerrain } from '@/lib/map-chunk-terrain';
import { type TerrainRenderLayer } from '@/lib/terrain-render';
import { Link, useParams } from '@tanstack/react-router';

import { EditorCanvas } from './components/canvas';
import { EditorSidebar } from './components/sidebar';
import {
  canDeleteVertex,
  canSavePolygonDraft,
  filterArchetypeCatalog,
  getExactSelectedIslands,
  getIslandsBySelectedPolygons,
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
  getAvailableEditorTools,
  getAvailableSidebarTabs,
  sanitizeEditorSnapshotForCapabilities
} from './helpers/capabilities';
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
const FALLBACK_TILE_EDIT_CONFIG: ZarchTileEditConfig = {
  heightStepMeters: 4,
  maxAbsHeightSteps: 16,
  palette: [],
  tileTypes: [{ id: 'normal', label: 'Normal' }]
};

export const MapEditorPage = () => {
  const { id } = useParams({ from: '/maps/$id/editor' });
  return <MapEditorPageContent id={id} key={id} />;
};

const MapEditorPageContent = ({ id }: { id: string }) => {
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
  const [terrainRenderLayer, setTerrainRenderLayer] =
    useState<TerrainRenderLayer>('resolved-color');
  const [terrainState, setTerrainState] = useState<ZarchTileEditState>(() =>
    createZarchTileEditState(FALLBACK_TILE_EDIT_CONFIG)
  );
  const [terrainSavePending, setTerrainSavePending] = useState(false);
  const [terrainPointerMode, setTerrainPointerMode] = useState<
    'height-select' | 'type-paint' | null
  >(null);
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
    capabilities,
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
    staticEntitiesQuery,
    tileEditConfigQuery
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
  const tileEditConfig = tileEditConfigQuery.data ?? null;
  const dispatchTerrain = useCallback(
    (action: Parameters<typeof reduceZarchTileEditState>[1]) => {
      setTerrainState(current => reduceZarchTileEditState(current, action));
    },
    []
  );

  useEffect(() => {
    if (!tileEditConfig) {
      return;
    }

    setTerrainState(current =>
      current.maxAbsHeightSteps === tileEditConfig.maxAbsHeightSteps &&
      current.selectedTypeId
        ? current
        : createZarchTileEditState(tileEditConfig)
    );
  }, [tileEditConfig]);

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
    () =>
      new Set(
        (referencedArchetypesQuery.data ?? []).map(archetype => archetype.id)
      ),
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
    setTerrainPointerMode(null);
    setTerrainSavePending(false);
    setTerrainRenderLayer('resolved-color');
    setTerrainState(
      createZarchTileEditState(tileEditConfig ?? FALLBACK_TILE_EDIT_CONFIG)
    );
  }, [id, tileEditConfig]);

  useEffect(() => {
    if (!activeCatalogArchetypeId && filteredCatalogArchetypes.length > 0) {
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
    updateSnapshot(current =>
      sanitizeEditorSnapshotForCapabilities(current, capabilities)
    );
  }, [capabilities, updateSnapshot]);

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
    if (!map || size.width <= 0 || size.height <= 0 || initialFitRef.current) {
      return;
    }

    initialFitRef.current = true;

    if (capabilities.hasOverviewAuthoring && overviewQuery.data?.bounds) {
      fitToWorldBounds(overviewQuery.data.bounds);
      return;
    }

    fitToView();
  }, [
    fitToView,
    fitToWorldBounds,
    capabilities.hasOverviewAuthoring,
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
  const baseTerrain = useMemo(
    () =>
      map && tileEditConfig
        ? createChunkMapTerrain({
            chunks,
            editConfig: tileEditConfig,
            map
          })
        : null,
    [chunks, map, tileEditConfig]
  );
  const terrainDraftEdits = terrainState.edits;
  const terrainSelectedHeightTiles = useMemo(
    () => getHeightSelectionTiles(terrainState),
    [terrainState]
  );
  const terrainPreviewHaloTiles = useMemo(
    () => getPreviewHaloTiles(terrainState),
    [terrainState]
  );
  const terrainDirtyEdits = useMemo(
    () => getDraftEdits(terrainState),
    [terrainState]
  );
  const terrainInspectedTile = useMemo(() => {
    if (!baseTerrain) {
      return null;
    }

    const tile = terrainState.hoveredTile ?? terrainState.selectedTile;
    return tile
      ? getMergedTileState(
          baseTerrain,
          terrainDraftEdits,
          tile.tileX,
          tile.tileZ
        )
      : null;
  }, [
    baseTerrain,
    terrainDraftEdits,
    terrainState.hoveredTile,
    terrainState.selectedTile
  ]);

  const staticEntityViews = useMemo(() => {
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
  }, [assetVersionsById, chunks, map, staticEntityItems]);
  const selectedEntity = useMemo(
    () =>
      selectedEntityIds.length === 1
        ? (staticEntityViews.find(
            item => item.entity.id === selectedEntityIds[0]
          ) ?? null)
        : null,
    [selectedEntityIds, staticEntityViews]
  );
  const selectedStaticEntities = useMemo(
    () =>
      selectedEntityIds
        .map(
          id =>
            staticEntityViews.find(item => item.entity.id === id)?.entity ??
            null
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

  const applyTerrainHeightSelection = useCallback(
    (mode: 'flatten' | 'raise' | 'lower') => {
      if (
        !baseTerrain ||
        !tileEditConfig ||
        terrainSelectedHeightTiles.length === 0
      ) {
        return;
      }

      const result = computeAreaHeightEdits({
        currentPlaneHeight: terrainState.lastSolvedPlaneHeight,
        editConfig: tileEditConfig,
        edits: terrainDraftEdits,
        mode,
        selection: terrainSelectedHeightTiles,
        terrain: baseTerrain
      });

      if (result.heightEdits.length === 0) {
        return;
      }

      const anchorTile =
        terrainState.selectedTile ?? terrainSelectedHeightTiles[0]!;

      dispatchTerrain({
        current: getMergedTileState(
          baseTerrain,
          terrainDraftEdits,
          anchorTile.tileX,
          anchorTile.tileZ
        ),
        heightEdits: result.heightEdits,
        lastSolvedPlaneHeight: result.targetHeight,
        previewHaloTiles: result.haloTiles,
        tileX: anchorTile.tileX,
        tileZ: anchorTile.tileZ,
        type: 'apply-tool'
      });
    },
    [
      baseTerrain,
      dispatchTerrain,
      terrainDraftEdits,
      terrainSelectedHeightTiles,
      terrainState.lastSolvedPlaneHeight,
      terrainState.selectedTile,
      tileEditConfig
    ]
  );

  const saveTerrainEdits = useCallback(async () => {
    if (!map || terrainDirtyEdits.length === 0) {
      return;
    }

    setTerrainSavePending(true);
    dispatchTerrain({ saveError: null, type: 'set-save-error' });

    try {
      const response = await client.maps.updateTiles({
        edits: terrainDirtyEdits,
        expectedRevision: map.revision,
        mapId: map.id
      });

      setEditorRevision(response.mapRevision);
      await invalidateTerrainMutation(response.dirtyBounds);
      setTerrainState(current => ({
        ...createZarchTileEditState(
          tileEditConfig ?? FALLBACK_TILE_EDIT_CONFIG
        ),
        enabled: current.enabled,
        hoveredTile: current.hoveredTile,
        selectedTile: current.selectedTile
      }));
      toast.success('Terrain edits saved');
    } catch (error) {
      dispatchTerrain({
        saveError:
          error instanceof Error
            ? error.message
            : 'Failed to save terrain edits',
        type: 'set-save-error'
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to save terrain edits'
      );
    } finally {
      setTerrainSavePending(false);
    }
  }, [
    dispatchTerrain,
    invalidateTerrainMutation,
    map,
    terrainDirtyEdits,
    tileEditConfig
  ]);

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

  useEffect(() => {
    if (
      !baseTerrain ||
      !tileEditConfig ||
      tool !== 'terrain' ||
      terrainState.tool !== 'height'
    ) {
      dispatchTerrain({
        lastSolvedPlaneHeight: null,
        previewHaloTiles: [],
        type: 'set-height-preview'
      });
      return;
    }

    const preview = getAreaHeightPreview({
      editConfig: tileEditConfig,
      edits: terrainDraftEdits,
      selection: terrainSelectedHeightTiles,
      terrain: baseTerrain
    });

    dispatchTerrain({
      lastSolvedPlaneHeight: preview.targetHeight,
      previewHaloTiles: preview.haloTiles,
      type: 'set-height-preview'
    });
  }, [
    baseTerrain,
    dispatchTerrain,
    terrainDraftEdits,
    terrainSelectedHeightTiles,
    terrainState.tool,
    tileEditConfig,
    tool
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
  const toTilePoint = useCallback(
    (event: { clientX: number; clientY: number }): TilePoint | null => {
      if (!map) {
        return null;
      }

      const world = toWorldPoint(event);
      const tile = worldToTilePoint(map, world);
      const tileX = Math.floor(tile.x);
      const tileZ = Math.floor(tile.z);

      if (baseTerrain && !baseTerrain.containsTile(tileX, tileZ)) {
        return null;
      }

      return { tileX, tileZ };
    },
    [baseTerrain, map, toWorldPoint]
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
    if (!capabilities.canEditAuthoredGeometry || !selectedPolygon) {
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
  }, [capabilities.canEditAuthoredGeometry, selectedPolygon, updateSnapshot]);

  const beginControlPoint = useCallback(() => {
    if (!capabilities.canEditAuthoredGeometry) {
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
        selectedControlPointId: null,
        selectedEntityIds: [],
        selectedIslandId: null,
        selectedPolygonIds: [],
        tool: 'place-control-point'
      }),
      true
    );
  }, [capabilities.canEditAuthoredGeometry, updateSnapshot]);

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
    if (!capabilities.canEditAuthoredGeometry) {
      return;
    }

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
  }, [capabilities.canEditAuthoredGeometry, updateSnapshot]);

  const beginTerrain = useCallback(() => {
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
        tool: 'terrain'
      }),
      true
    );
  }, [updateSnapshot]);

  const activeEditorRevision = editorRevision ?? map?.revision ?? null;
  const availableTools = getAvailableEditorTools(capabilities);
  const availableTabs = getAvailableSidebarTabs(capabilities);
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
  const pendingAnyAction = pendingEditorAction !== null || terrainSavePending;
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
            position: translateWorldPoint(
              entity.position,
              dragState.currentDelta
            )
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

      if (tool === 'terrain') {
        const tile = toTilePoint(event);
        dispatchTerrain({
          hoveredTile: tile,
          type: 'set-hovered-tile'
        });

        if (!tile) {
          return;
        }

        interactionRef.current?.setPointerCapture(event.pointerId);
        dispatchTerrain({
          selectedTile: tile,
          type: 'set-selected-tile'
        });

        setTerrainPointerMode('height-select');
        dispatchTerrain({
          tileX: tile.tileX,
          tileZ: tile.tileZ,
          type: 'begin-height-selection-box'
        });
        return;
      }

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
    [
      dispatchTerrain,
      dragState,
      onViewportPointerDown,
      setDragState,
      toTilePoint,
      toWorldPoint,
      tool
    ]
  );

  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (tool === 'terrain') {
        const tile = toTilePoint(event);
        dispatchTerrain({
          hoveredTile: tile,
          type: 'set-hovered-tile'
        });

        if (!tile) {
          return;
        }

        if (terrainPointerMode === 'height-select') {
          dispatchTerrain({
            tileX: tile.tileX,
            tileZ: tile.tileZ,
            type: 'update-height-selection-box'
          });
          return;
        }

        return;
      }

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
      dispatchTerrain,
      dragState,
      onViewportPointerMove,
      map,
      polygonDraft,
      setControlPointDraft,
      setDragState,
      setPolygonControlPointDrafts,
      setPolygonDraft,
      selectedControlPoint,
      terrainPointerMode,
      toTilePoint,
      toWorldPoint,
      tool
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
      if (tool === 'terrain') {
        const tile = toTilePoint(event);
        dispatchTerrain({
          hoveredTile: tile,
          type: 'set-hovered-tile'
        });
        setTerrainPointerMode(null);
        return;
      }

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
              position: translateWorldPoint(
                entity.position,
                dragState.currentDelta
              )
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
      dispatchTerrain,
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
      toTilePoint,
      tool,
      updateSnapshot
    ]
  );

  const handleCanvasPointerCancel = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (tool === 'terrain') {
        setTerrainPointerMode(null);
        dispatchTerrain({ hoveredTile: null, type: 'set-hovered-tile' });
        return;
      }

      releaseCanvasDrag();
      onViewportPointerCancel(event);
    },
    [dispatchTerrain, onViewportPointerCancel, releaseCanvasDrag, tool]
  );

  const handleCanvasPointerLeave = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (tool === 'terrain') {
        setTerrainPointerMode(null);
        dispatchTerrain({ hoveredTile: null, type: 'set-hovered-tile' });
        return;
      }

      releaseCanvasDrag();
      onViewportPointerLeave(event);
    },
    [dispatchTerrain, onViewportPointerLeave, releaseCanvasDrag, tool]
  );

  const handleCanvasClick = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!map) {
        return;
      }

      if (tool === 'terrain') {
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
      if (modifierPressed && !pendingAnyAction) {
        const isUndo = event.key.toLowerCase() === 'z' && !event.shiftKey;
        const isRedo =
          (event.key.toLowerCase() === 'z' && event.shiftKey) ||
          event.key.toLowerCase() === 'y';
        const isDuplicate = event.key.toLowerCase() === 'd';

        if (isUndo && canUndo) {
          if (tool === 'terrain') {
            event.preventDefault();
            dispatchTerrain({ type: 'undo' });
            return;
          }
          event.preventDefault();
          void undo();
          return;
        }

        if (isRedo && canRedo) {
          if (tool === 'terrain') {
            event.preventDefault();
            dispatchTerrain({ type: 'redo' });
            return;
          }
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
        if (tool === 'terrain') {
          if (terrainState.tool === 'height') {
            dispatchTerrain({ type: 'clear-height-selection' });
            return;
          }

          dispatchTerrain({ type: 'reset-draft' });
          return;
        }

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
        !pendingAnyAction
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
      dispatchTerrain,
      duplicateSelectedEntities,
      onViewportKeyDown,
      pendingAnyAction,
      polygonDraft,
      redo,
      resetControlPointDraft,
      resetPolygonDraft,
      selectedControlPoint,
      selectedEntityIds,
      selectedPolygon,
      setPolygonDraft,
      terrainState.tool,
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

  const canApplyUnionLike =
    capabilities.canEditAuthoredGeometry &&
    selectedPolygonIds.length >= 2 &&
    !polygonDraft;
  const activeCanUndo = tool === 'terrain' ? terrainState.canUndo : canUndo;
  const activeCanRedo = tool === 'terrain' ? terrainState.canRedo : canRedo;
  const hasUnsavedChanges =
    polygonDirty ||
    controlPointDraft !== null ||
    entityDirty ||
    islandDraft !== null ||
    terrainDirtyEdits.length > 0;
  const toolLabel = getToolLabel(tool, terrainState.tool);
  const selectionSummary =
    tool === 'terrain'
      ? getTerrainSelectionSummary(
          terrainState.tool,
          terrainDirtyEdits.length,
          terrainSelectedHeightTiles.length,
          terrainInspectedTile
        )
      : getSelectionSummary({
          canEditAuthoredGeometry: capabilities.canEditAuthoredGeometry,
          polygonDraft,
          selectedControlPoint,
          selectedEntity,
          selectedEntityCount: selectedEntityIds.length,
          selectedIsland,
          selectedIslandCount: exactSelectedIslands.length,
          selectedPolygon,
          selectedPolygonCount: selectedPolygonIds.length,
          tool
        });
  const nextActionHint =
    tool === 'terrain'
      ? getTerrainNextActionHint(terrainState.tool)
      : getNextActionHint({
          canEditAuthoredGeometry: capabilities.canEditAuthoredGeometry,
          polygonDraft,
          selectedControlPoint: Boolean(selectedControlPoint),
          selectedEntity: Boolean(selectedEntity),
          selectedEntityCount: selectedEntityIds.length,
          selectedIslandCount: exactSelectedIslands.length,
          selectedPolygon: Boolean(selectedPolygon),
          selectedPolygonCount: selectedPolygonIds.length,
          tool
        });
  const focusSelectionBounds = useMemo(() => {
    if (tool === 'terrain' && map) {
      const terrainFocusTiles =
        terrainSelectedHeightTiles.length > 0
          ? terrainSelectedHeightTiles
          : terrainState.selectedTile
            ? [terrainState.selectedTile]
            : [];

      if (terrainFocusTiles.length > 0) {
        const metersPerTile = map.resolution.metersPerTile;
        return terrainFocusTiles.reduce<ReturnType<typeof mergeWorldBounds>>(
          (bounds, tile) =>
            mergeWorldBounds(bounds, {
              maxX: (tile.tileX + 1) * metersPerTile,
              maxZ: (tile.tileZ + 1) * metersPerTile,
              minX: tile.tileX * metersPerTile,
              minZ: tile.tileZ * metersPerTile
            }),
          null
        );
      }
    }

    const polygonBounds = selectedPolygonIds.reduce<
      ReturnType<typeof mergeWorldBounds>
    >((bounds, polygonId) => {
      const polygon = polygons.find(candidate => candidate.id === polygonId);
      return mergeWorldBounds(bounds, polygon?.bbox ?? null);
    }, null);

    if (polygonBounds) {
      return polygonBounds;
    }

    return exactSelectedIslands.reduce<ReturnType<typeof mergeWorldBounds>>(
      (bounds, island) => mergeWorldBounds(bounds, island.bbox),
      null
    );
  }, [
    exactSelectedIslands,
    map,
    polygons,
    selectedPolygonIds,
    terrainSelectedHeightTiles,
    terrainState.selectedTile,
    tool
  ]);
  const canFocusSelection = Boolean(
    focusSelectionBounds || selectedControlPoint || selectedEntity
  );
  const focusSelection = useCallback(() => {
    if (!map) {
      return;
    }

    if (focusSelectionBounds) {
      fitToWorldBounds(
        expandBounds(focusSelectionBounds, map.resolution.metersPerTile * 2)
      );
      return;
    }

    if (selectedEntity) {
      recenterOnWorldPoint(selectedEntity.entity.position);
      return;
    }

    if (selectedControlPoint) {
      recenterOnWorldPoint(selectedControlPoint);
    }
  }, [
    fitToWorldBounds,
    focusSelectionBounds,
    map,
    recenterOnWorldPoint,
    selectedControlPoint,
    selectedEntity
  ]);

  if (mapQuery.isLoading) {
    return <div className="text-muted-foreground">Loading editor...</div>;
  }

  if (!map) {
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
            pendingAnyAction
              ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
              : hasUnsavedChanges
                ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                : undefined
          }
          variant={
            pendingAnyAction || hasUnsavedChanges ? 'outline' : 'secondary'
          }
        >
          {pendingAnyAction
            ? 'Saving changes…'
            : hasUnsavedChanges
              ? 'Unsaved changes'
              : 'All changes saved'}
        </Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EditorCanvas
          availableTools={availableTools}
          booleanActionsVisible={canApplyUnionLike}
          canApplyUnionLike={canApplyUnionLike}
          canFocusSelection={canFocusSelection}
          canRedo={activeCanRedo}
          canUndo={activeCanUndo}
          chunks={chunks}
          commitDrawPolygon={commitDrawPolygon}
          containerRef={containerRef}
          controlPointDraft={controlPointDraft}
          controlPoints={renderedControlPoints}
          dragState={dragState}
          editConfig={tileEditConfig}
          entityItems={renderedStaticEntityViews}
          fitToView={fitToView}
          highlightedIslandPolygonIds={highlightedIslandPolygonIds}
          interactionRef={interactionRef}
          map={map}
          nextActionHint={nextActionHint}
          onApplyBoolean={operation => void applyBooleanOperation(operation)}
          onApplyTerrainHeightSelection={applyTerrainHeightSelection}
          onApplyTerrainTypeSelection={typeId => {
            if (!baseTerrain || terrainSelectedHeightTiles.length === 0) {
              return;
            }
            dispatchTerrain({
              selectedTypeId: typeId,
              type: 'set-selected-type-id'
            });
            const anchorTile =
              terrainState.selectedTile ?? terrainSelectedHeightTiles[0]!;
            dispatchTerrain({
              current: getMergedTileState(
                baseTerrain,
                terrainDraftEdits,
                anchorTile.tileX,
                anchorTile.tileZ
              ),
              selectedTypeIdOverride: typeId,
              tileEdits: terrainSelectedHeightTiles.map(tile => ({
                current: getMergedTileState(
                  baseTerrain,
                  terrainDraftEdits,
                  tile.tileX,
                  tile.tileZ
                )
              })),
              tileX: anchorTile.tileX,
              tileZ: anchorTile.tileZ,
              toolOverride: 'set-type',
              type: 'apply-tool'
            });
          }}
          onBeginControlPoint={beginControlPoint}
          onBeginDrawPolygon={beginDrawPolygon}
          onBeginPlaceEntity={beginPlaceEntity}
          onBeginVertexEdit={beginVertexEdit}
          onCanvasClick={handleCanvasClick}
          onCanvasKeyDown={handleKeyDown}
          onCanvasPointerCancel={handleCanvasPointerCancel}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasPointerLeave={handleCanvasPointerLeave}
          onCanvasPointerMove={handleCanvasPointerMove}
          onCanvasPointerUp={handleCanvasPointerUp}
          onClearTerrainSelection={() =>
            dispatchTerrain({ type: 'clear-height-selection' })
          }
          onControlPointClick={handleControlPointClick}
          onControlPointPointerDown={handleControlPointPointerDown}
          onFocusSelection={focusSelection}
          onPolygonClick={handlePolygonClick}
          onPolygonPointerDown={handlePolygonPointerDown}
          onRedo={() =>
            tool === 'terrain' ? dispatchTerrain({ type: 'redo' }) : void redo()
          }
          onResetTerrainEdits={() => dispatchTerrain({ type: 'reset-draft' })}
          onSaveTerrainEdits={() => void saveTerrainEdits()}
          onSelectTool={nextTool =>
            nextTool === 'terrain' ? beginTerrain() : setTool(nextTool, true)
          }
          onSetTerrainColorIndex={colorIndex => {
            dispatchTerrain({
              selectedColorIndex: colorIndex,
              type: 'set-selected-color-index'
            });
            if (baseTerrain && terrainSelectedHeightTiles.length > 0) {
              const anchorTile =
                terrainState.selectedTile ?? terrainSelectedHeightTiles[0]!;
              dispatchTerrain({
                current: getMergedTileState(
                  baseTerrain,
                  terrainDraftEdits,
                  anchorTile.tileX,
                  anchorTile.tileZ
                ),
                selectedColorIndexOverride: colorIndex,
                tileEdits: terrainSelectedHeightTiles.map(tile => ({
                  current: getMergedTileState(
                    baseTerrain,
                    terrainDraftEdits,
                    tile.tileX,
                    tile.tileZ
                  )
                })),
                tileX: anchorTile.tileX,
                tileZ: anchorTile.tileZ,
                toolOverride: 'set-color',
                type: 'apply-tool'
              });
            }
          }}
          onSetTerrainLayer={setTerrainRenderLayer}
          onSetTerrainTool={nextTool =>
            dispatchTerrain({ tool: nextTool, type: 'set-tool' })
          }
          onStaticEntityClick={handleStaticEntityClick}
          onStaticEntityPointerDown={handleStaticEntityPointerDown}
          onStaticEntityRotatePointerDown={handleStaticEntityRotatePointerDown}
          onUndo={() =>
            tool === 'terrain' ? dispatchTerrain({ type: 'undo' }) : void undo()
          }
          onWheel={onWheel}
          onWheelCapture={handleWheelCapture}
          overlayPolygons={renderedPolygons}
          pendingAction={pendingAnyAction}
          polygonDraft={polygonDraft}
          selectedControlPointId={selectedControlPointId}
          selectedEntityIds={selectedEntityIds}
          selectedPolygon={Boolean(selectedPolygon)}
          selectedPolygonIds={selectedPolygonIds}
          selectionSummary={selectionSummary}
          setDragState={setDragState}
          setPolygonDraft={setPolygonDraft}
          size={size}
          terrainDirtyCount={terrainDirtyEdits.length}
          terrainDraftEdits={terrainDraftEdits}
          terrainHeightSelectionTiles={terrainSelectedHeightTiles}
          terrainHoveredTile={terrainState.hoveredTile}
          terrainInspectedTile={terrainInspectedTile}
          terrainPreviewHaloTiles={terrainPreviewHaloTiles}
          terrainRenderLayer={terrainRenderLayer}
          terrainSavePending={terrainSavePending}
          terrainSelectedColorIndex={terrainState.selectedColorIndex}
          terrainSelectedHeightTileCount={terrainSelectedHeightTiles.length}
          terrainSelectedTile={terrainState.selectedTile}
          terrainSelectedTypeId={terrainState.selectedTypeId ?? ''}
          terrainTool={terrainState.tool}
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
          availableTabs={availableTabs}
          bulkScaleDraft={bulkScaleDraft}
          bulkStateDraft={bulkStateDraft}
          capabilities={capabilities}
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
          entityDirty={entityDirty}
          islandDraft={islandDraft}
          islandInspectorDraft={islandInspectorDraft}
          nextActionHint={nextActionHint}
          onApplyBulkEntityEdit={draft => void applyBulkEntityEdit(draft)}
          onBeginControlPoint={beginControlPoint}
          onBeginDrawPolygon={beginDrawPolygon}
          onBeginPlaceEntity={beginPlaceEntity}
          onBeginTerrain={beginTerrain}
          onDuplicateStaticEntities={() => void duplicateSelectedEntities()}
          onJumpToEntity={entity =>
            recenterOnWorldPoint(entity.entity.position)
          }
          onPickCatalogArchetype={archetypeId =>
            setActiveCatalogArchetypeId(archetypeId)
          }
          onRecenter={recenterOnWorldPoint}
          onResetControlPointDraft={resetControlPointDraft}
          onResetEntityDraft={() =>
            setEntityDraft(
              selectedEntity
                ? createStaticEntityDraft(selectedEntity.entity)
                : null
            )
          }
          onResetPolygonDraft={resetPolygonDraft}
          onSaveControlPointDraft={() => void saveControlPointDraft()}
          onSaveEntityDraft={() => void applyEntityDraft()}
          onSaveIslandDraft={() => void saveIslandDraft()}
          onSavePolygonDraft={() => void savePolygonDraft()}
          onSelectIsland={selectIsland}
          onSelectStaticEntities={selectEntityIds}
          onSelectTool={nextTool =>
            nextTool === 'terrain' ? beginTerrain() : setTool(nextTool, true)
          }
          onSetBulkScaleDraft={setBulkScaleDraft}
          onSetBulkStateDraft={setBulkStateDraft}
          onSetCatalogCategory={setActiveCatalogCategory}
          onSetCatalogSearch={setActiveCatalogSearch}
          onSetOutlinerArchetypeId={setActiveOutlinerArchetypeId}
          onSetOutlinerCategory={setActiveOutlinerCategory}
          onSetOutlinerSearch={setActiveOutlinerSearch}
          overviewBounds={overviewBounds}
          overviewClusters={overviewQuery.data?.clusters ?? EMPTY_CLUSTERS}
          pendingAction={pendingAnyAction}
          polygonDirty={polygonDirty}
          polygonDraft={polygonDraft}
          referencedArchetypeIds={referencedArchetypeIds}
          selectedControlPoint={selectedControlPoint}
          selectedEntity={selectedEntity}
          selectedEntityCount={selectedEntityIds.length}
          selectedEntityIds={selectedEntityIds}
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
          terrainDirtyCount={terrainDirtyEdits.length}
          terrainInspectedTile={terrainInspectedTile}
          terrainLayer={terrainRenderLayer}
          terrainPreviewHaloCount={terrainPreviewHaloTiles.length}
          terrainSelectedHeightTileCount={terrainSelectedHeightTiles.length}
          terrainState={terrainState}
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
              disabled={pendingAnyAction}
              onClick={() =>
                deleteTarget?.kind === 'static-entity'
                  ? void deleteStaticEntities(deleteTarget.ids).finally(() =>
                      setDeleteTarget(null)
                    )
                  : void confirmDelete()
              }
              variant="destructive"
            >
              {pendingAnyAction ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const getToolLabel = (
  tool: EditorTool,
  terrainTool: ZarchTileEditTool = 'height'
) => {
  switch (tool) {
    case 'pan':
      return 'Pan View';
    case 'terrain':
      return terrainTool === 'set-type' ? 'Terrain Type' : 'Terrain Height';
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

const getTerrainSelectionSummary = (
  terrainTool: ZarchTileEditTool,
  dirtyCount: number,
  selectionCount: number,
  inspectedTile: ReturnType<typeof getMergedTileState> | null
) => {
  if (inspectedTile) {
    return `Tile ${inspectedTile.tileX}, ${inspectedTile.tileZ} · ${terrainTool === 'height' ? `${inspectedTile.heightSteps} steps` : inspectedTile.typeId}`;
  }

  if (terrainTool === 'height' && selectionCount > 0) {
    return `${selectionCount} terrain tiles selected`;
  }

  if (dirtyCount > 0) {
    return `${dirtyCount} terrain edits pending`;
  }

  return terrainTool === 'height'
    ? 'Ready to edit terrain height'
    : 'Ready to paint terrain type';
};

const getTerrainNextActionHint = (terrainTool: ZarchTileEditTool) =>
  terrainTool === 'height'
    ? 'Drag across the map to select terrain tiles, then choose a height action.'
    : 'Drag across the map to select terrain tiles, then choose a tile type in the canvas dock.';

const getSelectionSummary = ({
  canEditAuthoredGeometry,
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
  canEditAuthoredGeometry: boolean;
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

  return canEditAuthoredGeometry
    ? 'Nothing selected'
    : 'Ready to inspect terrain or entities';
};

const getNextActionHint = ({
  canEditAuthoredGeometry,
  polygonDraft,
  selectedControlPoint,
  selectedEntity,
  selectedEntityCount,
  selectedIslandCount,
  selectedPolygon,
  selectedPolygonCount,
  tool
}: {
  canEditAuthoredGeometry: boolean;
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

  return canEditAuthoredGeometry
    ? 'Select geometry or entities to inspect them, or start a new placement, polygon, or control point.'
    : 'Select terrain or entities to inspect them, or start a new placement.';
};
