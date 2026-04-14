import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';

import { BasicShadowMap } from 'three';
import { Canvas } from '@react-three/fiber';

import {
  isFiniteMap,
  type MapMetadata,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';
import { Provider as JotaiProvider } from 'jotai';
import { Leva, LevaPanel, button, useControls, useCreateStore } from 'leva';
import { createLog } from 'odgn-ts-helpers/log';

import type {
  AssetVersion,
  StaticEntity
} from 'carrier-contracts/types';

import { palette } from '@/components/leva-palette-plugin';
// import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { client, connectApi } from '@/helpers/api-link';
import { ensurePlaneToArrayCompat } from '@/helpers/three-plane-compat';
import { sceneConfigStore } from '@/helpers/zarch-scene-config';
import {
  collectChunkStaticEntities
} from '@/helpers/zarch-static-entities';
import { SEA_Y, TILE } from '@/helpers/zarch-terrain';
import {
  DevSceneControls,
  LEVA_CONTROL_FOLDERS,
  useSceneConfigValue,
  type DevSceneControlFolderState,
  type LevaControlFolder
} from '@/hooks/use-scene-controls';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';

import { useServerMapTerrain } from './zarch/use-server-map-terrain';
import { useZarchRuntime } from './zarch/use-zarch-runtime';
import {
  createZarchEntityEditState,
  reduceZarchEntityEditState
} from './zarch/zarch-entity-edit';
import { ZarchEntityCatalog } from './zarch/zarch-entity-catalog';
import { ZarchEntityEditHud } from './zarch/zarch-entity-edit-hud';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { createPlayerShipSpawnState } from './zarch/zarch-player-ship';
import { ZarchScene } from './zarch/zarch-scene';
import {
  computeAreaHeightEdits,
  createEditedTerrain,
  createZarchTileEditState,
  getDraftEdits,
  getAreaHeightPreview,
  getHeightSelectionTiles,
  getPreviewHaloTiles,
  getMergedTileState,
  getTerrainTileState,
  reduceZarchTileEditState
} from './zarch/zarch-tile-edit';

const IS_DEV = process.env.NODE_ENV !== 'production';
const LEVA_UI_STATE_STORAGE_KEY = 'carrier:leva-ui-state';

const log = createLog('Main');

ensurePlaneToArrayCompat();

type LevaUiState = {
  collapsed: boolean;
  folderState: DevSceneControlFolderState;
  position: {
    x?: number;
    y?: number;
  };
};

const DEFAULT_LEVA_UI_STATE: LevaUiState = {
  collapsed: false,
  folderState: {},
  position: {}
};

const FALLBACK_TILE_EDIT_CONFIG: ZarchTileEditConfig = {
  heightStepMeters: 4,
  maxAbsHeightSteps: 16,
  palette: [],
  tileTypes: [{ id: 'normal', label: 'Normal' }]
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readLevaUiState = (): LevaUiState => {
  if (typeof window === 'undefined') {
    return DEFAULT_LEVA_UI_STATE;
  }

  try {
    const rawState = window.localStorage.getItem(LEVA_UI_STATE_STORAGE_KEY);

    if (!rawState) {
      return DEFAULT_LEVA_UI_STATE;
    }

    const parsed = JSON.parse(rawState) as unknown;

    if (!isRecord(parsed)) {
      return DEFAULT_LEVA_UI_STATE;
    }

    const folderState = isRecord(parsed.folderState) ? parsed.folderState : {};
    const position = isRecord(parsed.position) ? parsed.position : {};

    return {
      collapsed:
        typeof parsed.collapsed === 'boolean'
          ? parsed.collapsed
          : DEFAULT_LEVA_UI_STATE.collapsed,
      folderState: Object.fromEntries(
        LEVA_CONTROL_FOLDERS.map(folderName => [
          folderName,
          typeof folderState[folderName] === 'boolean'
            ? (folderState[folderName] as boolean)
            : false
        ])
      ) as DevSceneControlFolderState,
      position: {
        x: typeof position.x === 'number' ? position.x : undefined,
        y: typeof position.y === 'number' ? position.y : undefined
      }
    };
  } catch (error) {
    log.warn('Failed to read persisted Leva state', error);
    return DEFAULT_LEVA_UI_STATE;
  }
};

export const getInitialCameraState = (map: MapMetadata) => {
  if (!isFiniteMap(map)) {
    return {
      camX: 0,
      camZ: 0
    };
  }

  return {
    camX: map.extent.widthTiles * TILE * 0.5,
    camZ: map.extent.heightTiles * TILE * 0.5
  };
};

const MainInner = () => {
  const queryClient = useQueryClient();
  const [levaUiState, setLevaUiState] = useState<LevaUiState>(() =>
    readLevaUiState()
  );
  const [containerElement, setContainerElement] =
    useState<HTMLDivElement | null>(null);
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const levaContainerRef = useRef<HTMLDivElement | null>(null);
  const initializedMapIdRef = useRef<string | null>(null);
  const [editState, dispatchEdit] = useReducer(
    reduceZarchTileEditState,
    FALLBACK_TILE_EDIT_CONFIG,
    createZarchTileEditState
  );
  const [entityEditState, dispatchEntityEdit] = useReducer(
    reduceZarchEntityEditState,
    undefined,
    createZarchEntityEditState
  );
  const [editorMode, setEditorMode] = useState<'terrain' | 'entities'>('terrain');
  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);
  const entityEditCallbacksRef = useRef<{
    catalogOpen: boolean;
    onClearSelection: () => void;
    onCloseCatalog: () => void;
    onDeleteEntity: () => void;
    onRotateEntity: (direction: 'cw' | 'ccw') => void;
    selectedEntityId: string | null;
  } | null>(null);
  const { containerProps, enterShipMode, exitShipMode, inputRef, runtimeRef } =
    useZarchRuntime({
      containerElement,
      editEnabled: editState.enabled,
      editTool: editState.tool,
      editorMode,
      entityEditCallbacksRef
    });
  const { editConfig, error, isLoading, map, terrain } = useServerMapTerrain();
  const showHud = useSceneConfigValue('showHud');
  const showMinimap = useSceneConfigValue('showMinimap');
  const activeEditConfig = editConfig ?? FALLBACK_TILE_EDIT_CONFIG;
  const editLevaStore = useCreateStore();
  const activeTerrain = useMemo(() => {
    if (!terrain || !editConfig) {
      return terrain;
    }

    return Object.keys(editState.edits).length > 0
      ? createEditedTerrain({
          editConfig,
          edits: editState.edits,
          terrain
        })
      : terrain;
  }, [editConfig, editState.edits, terrain]);
  const inspectedTile = useMemo(() => {
    if (!activeTerrain) {
      return null;
    }

    const target = editState.hoveredTile ?? editState.selectedTile;

    if (!target) {
      return null;
    }

    return getTerrainTileState(activeTerrain, target.tileX, target.tileZ);
  }, [activeTerrain, editState.hoveredTile, editState.selectedTile]);
  const dirtyEditCount = Object.keys(editState.edits).length;
  const selectedHeightTiles = useMemo(
    () => getHeightSelectionTiles(editState),
    [editState]
  );
  const previewHaloTiles = useMemo(
    () => getPreviewHaloTiles(editState),
    [editState]
  );
  const selectedHeightValue = useMemo(() => {
    if (!activeTerrain) {
      return '--';
    }

    if (selectedHeightTiles.length > 0) {
      const value = editState.lastSolvedPlaneHeight;
      return value === null ? '--' : value.toFixed(2);
    }

    const target = editState.selectedTile ?? editState.hoveredTile;

    if (!target) {
      return '--';
    }

    const value = activeTerrain.getTileAverageHeight(target.tileX, target.tileZ);
    return value === null ? '--' : value.toFixed(2);
  }, [
    activeTerrain,
    editState.hoveredTile,
    editState.lastSolvedPlaneHeight,
    editState.selectedTile,
    selectedHeightTiles.length
  ]);
  const selectedColorValue =
    editState.selectedColorIndex === null
      ? 'auto'
      : String(editState.selectedColorIndex);
  const paletteColors = useMemo(
    () =>
      activeEditConfig.palette.map(entry => ({
        hex: entry.hex,
        label: entry.label
      })),
    [activeEditConfig.palette]
  );
  const typeOptions = useMemo(
    () =>
      Object.fromEntries(
        activeEditConfig.tileTypes.map(tileType => [
          tileType.label,
          tileType.id
        ])
      ),
    [activeEditConfig.tileTypes]
  );
  useEffect(() => {
    log.info('Carrier');

    void connectApi();
  }, []);

  useEffect(() => {
    if (!IS_DEV || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      LEVA_UI_STATE_STORAGE_KEY,
      JSON.stringify(levaUiState)
    );
  }, [levaUiState]);

  const updateLevaUiState = useCallback(
    (updater: (current: LevaUiState) => LevaUiState) => {
      setLevaUiState(current => updater(current));
    },
    []
  );

  const handleLevaCollapsedChange = useCallback(
    (collapsed: boolean) => {
      updateLevaUiState(current => ({ ...current, collapsed }));
    },
    [updateLevaUiState]
  );

  const handleLevaDrag = useCallback(
    (position: { x?: number; y?: number }) => {
      updateLevaUiState(current => ({
        ...current,
        position: {
          x: position.x,
          y: position.y
        }
      }));
    },
    [updateLevaUiState]
  );

  const handleLevaClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const container = levaContainerRef.current;

      if (!container) {
        return;
      }

      let element = event.target as HTMLElement | null;

      while (element && element !== container) {
        const label = element.textContent?.trim();

        if (
          label &&
          LEVA_CONTROL_FOLDERS.includes(label as LevaControlFolder) &&
          element.nextElementSibling
        ) {
          updateLevaUiState(current => ({
            ...current,
            folderState: {
              ...current.folderState,
              [label]: !(
                current.folderState[label as LevaControlFolder] ?? false
              )
            }
          }));
          return;
        }

        element = element.parentElement;
      }
    },
    [updateLevaUiState]
  );

  useEffect(() => {
    if (!map) {
      initializedMapIdRef.current = null;
      return;
    }

    if (initializedMapIdRef.current === map.id) {
      return;
    }

    initializedMapIdRef.current = map.id;
    const initialCamera = getInitialCameraState(map);
    runtimeRef.current.mode = 'navigation';
    runtimeRef.current.camera.x = initialCamera.camX;
    runtimeRef.current.camera.z = initialCamera.camZ;
    runtimeRef.current.camera.yaw = 0;
    runtimeRef.current.camera.zoom = 1;
    runtimeRef.current.camera.zoomTarget = 1;
    runtimeRef.current.navigation.x = initialCamera.camX;
    runtimeRef.current.navigation.z = initialCamera.camZ;
    runtimeRef.current.navigation.yaw = 0;
    runtimeRef.current.navigation.velX = 0;
    runtimeRef.current.navigation.velZ = 0;
    runtimeRef.current.ship = null;
    dispatchEdit({ enabled: false, type: 'set-enabled' });
    dispatchEdit({ type: 'reset-draft' });
  }, [map, runtimeRef]);

  const handleToggleMode = useCallback(() => {
    if (!map || !activeTerrain || editState.enabled) {
      return;
    }

    if (runtimeRef.current.mode === 'ship') {
      exitShipMode();
      containerElement?.focus();
      return;
    }

    const initialCamera = getInitialCameraState(map);
    enterShipMode(
      createPlayerShipSpawnState({
        surface: {
          sampleHeightAtWorld: activeTerrain.sampleHeightAtWorld,
          waterHeight: SEA_Y
        },
        x: initialCamera.camX,
        z: initialCamera.camZ
      })
    );
    containerElement?.focus();
  }, [
    activeTerrain,
    containerElement,
    editState.enabled,
    enterShipMode,
    exitShipMode,
    map,
    runtimeRef
  ]);

  const handleSetEditEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled && runtimeRef.current.mode === 'ship') {
        exitShipMode();
      }

      dispatchEdit({ enabled, type: 'set-enabled' });
    },
    [exitShipMode, runtimeRef]
  );

  const handleEditTileHover = useCallback(
    (tile: { tileX: number; tileZ: number } | null) => {
      dispatchEdit({ hoveredTile: tile, type: 'set-hovered-tile' });
    },
    []
  );

  const handleEditTileSelectionStart = useCallback(
    (tileX: number, tileZ: number) => {
      dispatchEdit({ tileX, tileZ, type: 'begin-height-selection-box' });
    },
    []
  );

  const handleEditTileSelectionUpdate = useCallback(
    (tileX: number, tileZ: number) => {
      dispatchEdit({ tileX, tileZ, type: 'update-height-selection-box' });
    },
    []
  );

  const handleEditTileActivate = useCallback(
    (tileX: number, tileZ: number, shiftKey: boolean) => {
      if (!terrain || !editConfig) {
        return;
      }

      dispatchEdit({ saveError: null, type: 'set-save-error' });

      dispatchEdit({ tileX, tileZ, type: 'begin-height-selection-box' });
      containerElement?.focus();
    },
    [containerElement, editConfig, terrain]
  );

  const applySelectionToolOverride = useCallback(
    ({
      selectedColorIndexOverride,
      selectedTypeIdOverride
    }: {
      selectedColorIndexOverride?: number | null;
      selectedTypeIdOverride?: string;
    }) => {
      if (!terrain || selectedHeightTiles.length === 0) {
        return;
      }

      const tileEdits = selectedHeightTiles.map(tile => ({
        current: getMergedTileState(terrain, editState.edits, tile.tileX, tile.tileZ)
      }));

      if (tileEdits.length === 0) {
        return;
      }

      const anchorTile = editState.selectedTile ?? selectedHeightTiles[0]!;

      dispatchEdit({
        current: tileEdits[0]!.current,
        selectedColorIndexOverride,
        selectedTypeIdOverride,
        toolOverride:
          selectedColorIndexOverride !== undefined
            ? 'set-color'
            : selectedTypeIdOverride !== undefined
              ? 'set-type'
              : undefined,
        tileEdits,
        tileX: anchorTile.tileX,
        tileZ: anchorTile.tileZ,
        type: 'apply-tool'
      });
      containerElement?.focus();
    },
    [
      containerElement,
      editState.edits,
      editState.selectedTile,
      editState.tool,
      selectedHeightTiles,
      terrain
    ]
  );

  const handlePaletteSelection = useCallback(
    (value: string) => {
      const selectedColorIndex = value === 'auto' ? null : Number(value);

      dispatchEdit({
        selectedColorIndex,
        type: 'set-selected-color-index'
      });

      if (selectedHeightTiles.length > 0) {
        applySelectionToolOverride({
          selectedColorIndexOverride: selectedColorIndex
        });
      }
    },
    [applySelectionToolOverride, editState.tool, selectedHeightTiles.length]
  );

  const applyHeightSelection = useCallback(
    (mode: 'flatten' | 'raise' | 'lower') => {
      if (!terrain || !editConfig || selectedHeightTiles.length === 0) {
        return;
      }

      const result = computeAreaHeightEdits({
        currentPlaneHeight: editState.lastSolvedPlaneHeight,
        edits: editState.edits,
        editConfig,
        mode,
        selection: selectedHeightTiles,
        terrain
      });

      if (result.heightEdits.length === 0) {
        return;
      }

      const anchorTile = editState.selectedTile ?? selectedHeightTiles[0]!;

      dispatchEdit({
        current: getMergedTileState(terrain, editState.edits, anchorTile.tileX, anchorTile.tileZ),
        heightEdits: result.heightEdits,
        lastSolvedPlaneHeight: result.targetHeight,
        previewHaloTiles: result.haloTiles,
        tileX: anchorTile.tileX,
        tileZ: anchorTile.tileZ,
        type: 'apply-tool'
      });
      containerElement?.focus();
    },
    [
      containerElement,
      editConfig,
      editState.edits,
      editState.selectedTile,
      selectedHeightTiles,
      terrain
    ]
  );

  const handleSaveTileEdits = useCallback(async () => {
    if (!map) {
      return;
    }

    const edits = getDraftEdits(editState);

    if (edits.length === 0) {
      return;
    }

    setIsSavingEdits(true);
    dispatchEdit({ saveError: null, type: 'set-save-error' });

    try {
      await client.maps.updateTiles({
        edits,
        expectedRevision: map.revision,
        mapId: map.id
      });

      dispatchEdit({ type: 'reset-draft' });
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: query =>
            query.queryKey[0] === 'map-chunk' && query.queryKey[1] === map.id
        }),
        queryClient.invalidateQueries({
          predicate: query =>
            (query.queryKey[0] === 'map' && query.queryKey[1] === map.id) ||
            (query.queryKey[0] === 'maps' && query.queryKey.length === 1)
        })
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save tile edits';
      dispatchEdit({
        saveError: message.includes('Expected revision')
          ? 'Save conflict: reload completed server changes and re-apply the draft.'
          : message,
        type: 'set-save-error'
      });
    } finally {
      setIsSavingEdits(false);
    }
  }, [editState, map, queryClient]);

  // --- Entity editing: archetype catalog query ---
  const archetypeCatalogQuery = useQuery({
    enabled: editorMode === 'entities' && editState.enabled,
    queryFn: () => client.maps.listArchetypes({ status: 'active' }),
    queryKey: ['archetypes-catalog'],
    staleTime: 60_000
  });

  const catalogArchetypes = archetypeCatalogQuery.data ?? [];

  const catalogAssetVersionIds = useMemo(
    () => Array.from(new Set(catalogArchetypes.map(a => a.assetVersionId))),
    [catalogArchetypes]
  );

  const catalogAssetVersionQueries = useQueries({
    queries: catalogAssetVersionIds.map(id => ({
      enabled: editorMode === 'entities' && editState.enabled,
      queryFn: () => client.maps.getAssetVersion({ id }),
      queryKey: ['asset-version', id],
      staleTime: 60_000
    }))
  });

  const catalogAssetVersionsById = useMemo(
    () =>
      catalogAssetVersionQueries.reduce<Map<string, AssetVersion>>(
        (result, query) => {
          if (query.data) {
            result.set(query.data.id, query.data);
          }
          return result;
        },
        new Map()
      ),
    [catalogAssetVersionQueries]
  );

  const referencedArchetypesQuery = useQuery({
    enabled: editorMode === 'entities' && editState.enabled && !!map,
    queryFn: () => client.maps.listReferencedArchetypes({ mapId: map!.id }),
    queryKey: ['map-referenced-archetypes', map?.id, map?.revision],
    staleTime: 60_000
  });

  const referencedArchetypeIds = useMemo(
    () => new Set((referencedArchetypesQuery.data ?? []).map(a => a.id)),
    [referencedArchetypesQuery.data]
  );

  // Find selected entity from chunks
  const selectedEntity = useMemo((): StaticEntity | null => {
    if (!entityEditState.selectedEntityId || !map) return null;

    const chunks: any[] = [];
    queryClient.getQueriesData({ queryKey: ['map-chunk', map.id] }).forEach(
      ([, data]) => {
        if (data) chunks.push(data);
      }
    );

    const entities = collectChunkStaticEntities(chunks);
    return entities.find(e => e.id === entityEditState.selectedEntityId) ?? null;
  }, [entityEditState.selectedEntityId, map, queryClient]);

  // Active archetype's asset version ID for preview
  const activeAssetVersionId = useMemo(() => {
    if (!entityEditState.activeArchetypeId) return null;
    const archetype = catalogArchetypes.find(
      a => a.id === entityEditState.activeArchetypeId
    );
    return archetype?.assetVersionId ?? null;
  }, [entityEditState.activeArchetypeId, catalogArchetypes]);

  // --- Entity editing: invalidation helper ---
  const invalidateEntityQueries = useCallback(async () => {
    if (!map) return;
    await Promise.all([
      queryClient.invalidateQueries({
        predicate: query =>
          query.queryKey[0] === 'map-chunk' && query.queryKey[1] === map.id
      }),
      queryClient.invalidateQueries({
        predicate: query =>
          (query.queryKey[0] === 'map' && query.queryKey[1] === map.id) ||
          (query.queryKey[0] === 'maps' && query.queryKey.length === 1)
      }),
      queryClient.invalidateQueries({
        predicate: query =>
          query.queryKey[0] === 'map-referenced-archetypes' &&
          query.queryKey[1] === map.id
      })
    ]);
  }, [map, queryClient]);

  // --- Entity editing: mutation handlers ---
  const handlePlaceEntity = useCallback(
    async (worldX: number, worldZ: number) => {
      if (
        !map ||
        !entityEditState.activeArchetypeId ||
        entityEditState.pendingAction
      ) {
        return;
      }

      dispatchEntityEdit({ type: 'set-pending', action: 'Placing' });
      dispatchEntityEdit({ type: 'set-error', error: null });

      try {
        const result = await client.maps.createStaticEntity({
          archetypeId: entityEditState.activeArchetypeId,
          expectedRevision: map.revision,
          label: null,
          mapId: map.id,
          position: { x: worldX, z: worldZ },
          rotation: { yaw: 0 },
          scale: 1,
          state: 'active',
          yOffset: 0
        });

        dispatchEntityEdit({
          type: 'select-entity',
          entityId: result.entity.id
        });
        await invalidateEntityQueries();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to place entity';
        dispatchEntityEdit({
          type: 'set-error',
          error: message.includes('Expected revision')
            ? 'Revision conflict: reload and retry.'
            : message
        });
      } finally {
        dispatchEntityEdit({ type: 'set-pending', action: null });
      }
    },
    [entityEditState.activeArchetypeId, entityEditState.pendingAction, invalidateEntityQueries, map]
  );

  const handleRotateEntity = useCallback(
    async (direction: 'cw' | 'ccw') => {
      if (
        !map ||
        !selectedEntity ||
        entityEditState.pendingAction
      ) {
        return;
      }

      dispatchEntityEdit({ type: 'set-pending', action: 'Rotating' });
      dispatchEntityEdit({ type: 'set-error', error: null });

      const yawDelta = direction === 'cw' ? 45 : -45;
      const newYaw = ((selectedEntity.rotation.yaw + yawDelta) % 360 + 360) % 360;

      try {
        await client.maps.updateStaticEntity({
          expectedRevision: map.revision,
          id: selectedEntity.id,
          mapId: map.id,
          rotation: { yaw: newYaw }
        });
        await invalidateEntityQueries();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to rotate entity';
        dispatchEntityEdit({
          type: 'set-error',
          error: message.includes('Expected revision')
            ? 'Revision conflict: reload and retry.'
            : message
        });
      } finally {
        dispatchEntityEdit({ type: 'set-pending', action: null });
      }
    },
    [entityEditState.pendingAction, invalidateEntityQueries, map, selectedEntity]
  );

  const handleDeleteEntity = useCallback(async () => {
    if (
      !map ||
      !entityEditState.selectedEntityId ||
      entityEditState.pendingAction
    ) {
      return;
    }

    dispatchEntityEdit({ type: 'set-pending', action: 'Deleting' });
    dispatchEntityEdit({ type: 'set-error', error: null });

    try {
      await client.maps.deleteStaticEntity({
        expectedRevision: map.revision,
        id: entityEditState.selectedEntityId,
        mapId: map.id
      });
      dispatchEntityEdit({ type: 'clear-selection' });
      await invalidateEntityQueries();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete entity';
      dispatchEntityEdit({
        type: 'set-error',
        error: message.includes('Expected revision')
          ? 'Revision conflict: reload and retry.'
          : message
      });
    } finally {
      dispatchEntityEdit({ type: 'set-pending', action: null });
    }
  }, [entityEditState.pendingAction, entityEditState.selectedEntityId, invalidateEntityQueries, map]);

  // Entity edit callbacks for runtime keyboard shortcuts
  const entityEditCallbacks = useMemo(() => {
    if (editorMode !== 'entities' || !editState.enabled) return null;
    return {
      catalogOpen: entityEditState.catalogOpen,
      onClearSelection: () => dispatchEntityEdit({ type: 'clear-selection' }),
      onCloseCatalog: () =>
        dispatchEntityEdit({ type: 'set-catalog-open', open: false }),
      onDeleteEntity: () => void handleDeleteEntity(),
      onRotateEntity: (direction: 'cw' | 'ccw') =>
        void handleRotateEntity(direction),
      selectedEntityId: entityEditState.selectedEntityId
    };
  }, [
    editorMode,
    editState.enabled,
    entityEditState.catalogOpen,
    entityEditState.selectedEntityId,
    handleDeleteEntity,
    handleRotateEntity
  ]);

  // Keep the ref in sync for the runtime keyboard handler
  entityEditCallbacksRef.current = entityEditCallbacks;

  // Entity scene state for ZarchScene
  const entityEditSceneState = useMemo(() => {
    if (editorMode !== 'entities' || !editState.enabled) return null;
    return {
      activeArchetypeId: entityEditState.activeArchetypeId,
      activeAssetVersionId: activeAssetVersionId,
      hoveredEntityId: entityEditState.hoveredEntityId,
      selectedEntityId: entityEditState.selectedEntityId,
      tool: entityEditState.tool
    };
  }, [
    activeAssetVersionId,
    editorMode,
    editState.enabled,
    entityEditState.activeArchetypeId,
    entityEditState.hoveredEntityId,
    entityEditState.selectedEntityId,
    entityEditState.tool
  ]);

  // HUD handlers for entity mode
  const handleSetEditorMode = useCallback((mode: 'terrain' | 'entities') => {
    setEditorMode(mode);
  }, []);

  const handleEntityHover = useCallback((entityId: string | null) => {
    dispatchEntityEdit({ type: 'hover-entity', entityId });
  }, []);

  const handleEntitySelect = useCallback((entityId: string | null) => {
    dispatchEntityEdit({ type: 'select-entity', entityId });
  }, []);

  const handleEntityPlace = useCallback(
    (worldX: number, worldZ: number) => {
      void handlePlaceEntity(worldX, worldZ);
    },
    [handlePlaceEntity]
  );

  const handleCatalogToggle = useCallback(() => {
    dispatchEntityEdit({
      type: 'set-catalog-open',
      open: !entityEditState.catalogOpen
    });
  }, [entityEditState.catalogOpen]);

  const handleSelectArchetype = useCallback((archetypeId: string) => {
    dispatchEntityEdit({ type: 'set-active-archetype', archetypeId });
  }, []);

  const handleSetEntityTool = useCallback((tool: 'place' | 'select') => {
    dispatchEntityEdit({ type: 'set-tool', tool });
  }, []);

  useEffect(() => {
    if (!terrain || !editConfig || editState.tool !== 'height') {
      dispatchEdit({
        lastSolvedPlaneHeight: null,
        previewHaloTiles: [],
        type: 'set-height-preview'
      });
      return;
    }

    const preview = getAreaHeightPreview({
      edits: editState.edits,
      editConfig,
      selection: selectedHeightTiles,
      terrain
    });

    dispatchEdit({
      lastSolvedPlaneHeight: preview.targetHeight,
      previewHaloTiles: preview.haloTiles,
      type: 'set-height-preview'
    });
  }, [editConfig, editState.edits, editState.tool, selectedHeightTiles, terrain]);

  const [editControls, setEditControls] = useControls(
    () => ({
      enabled: {
        label: 'Enabled',
        onChange: (value: boolean, _path: string, context: { initial: boolean }) => {
          if (context.initial) {
            return;
          }

          handleSetEditEnabled(value);
        },
        transient: false,
        value: editState.enabled
      },
      tool: {
        label: 'Tool',
        onChange: (value: typeof editState.tool, _path: string, context: { initial: boolean }) => {
          if (context.initial) {
            return;
          }

          dispatchEdit({
            tool: value,
            type: 'set-tool'
          });
        },
        options: {
          Color: 'set-color',
          Height: 'height',
          Type: 'set-type'
        },
        transient: false,
        value: editState.tool
      },
      selectedTypeId: {
        label: 'Tile type',
        onChange: (value: string, _path: string, context: { initial: boolean }) => {
          if (context.initial) {
            return;
          }

          dispatchEdit({
            selectedTypeId: value,
            type: 'set-selected-type-id'
          });

          if (selectedHeightTiles.length > 0) {
            applySelectionToolOverride({
              selectedTypeIdOverride: value
            });
          }
        },
        options: typeOptions,
        transient: false,
        value: editState.selectedTypeId
      },
      selectedColorIndex: {
        ...palette({
          colors: paletteColors,
          label: 'Palette',
          onSelect: handlePaletteSelection,
          selected: selectedColorValue
        }),
        onChange: (value: string, _path: string, context: { initial: boolean }) => {
          if (context.initial) {
            return;
          }

          const selectedColorIndex = value === 'auto' ? null : Number(value);

          dispatchEdit({
            selectedColorIndex,
            type: 'set-selected-color-index'
          });

          if (selectedHeightTiles.length > 0) {
            applySelectionToolOverride({
              selectedColorIndexOverride: selectedColorIndex
            });
          }
        },
        transient: false
      },
      Undo: button(() => dispatchEdit({ type: 'undo' }), {
        disabled: !editState.canUndo
      }),
      Redo: button(() => dispatchEdit({ type: 'redo' }), {
        disabled: !editState.canRedo
      }),
      Flatten: button(() => applyHeightSelection('flatten'), {
        disabled: editState.tool !== 'height' || selectedHeightTiles.length === 0
      }),
      Raise: button(() => applyHeightSelection('raise'), {
        disabled: editState.tool !== 'height' || selectedHeightTiles.length === 0
      }),
      Lower: button(() => applyHeightSelection('lower'), {
        disabled: editState.tool !== 'height' || selectedHeightTiles.length === 0
      }),
      ClearSelection: button(() => dispatchEdit({ type: 'clear-height-selection' }), {
        disabled: editState.tool !== 'height' || selectedHeightTiles.length === 0
      }),
      Save: button(() => void handleSaveTileEdits(), {
        disabled: dirtyEditCount === 0 || isSavingEdits
      }),
      Cancel: button(() => dispatchEdit({ type: 'reset-draft' }), {
        disabled: dirtyEditCount === 0 || isSavingEdits
      }),
      dirty: {
        disabled: true,
        label: 'Dirty tiles',
        value: dirtyEditCount
      },
      heightSelection: {
        disabled: true,
        label: 'Selection',
        value: selectedHeightTiles.length
      },
      haloCount: {
        disabled: true,
        label: 'Halo tiles',
        value: previewHaloTiles.length
      },
      hoveredTile: {
        disabled: true,
        label: 'Tile',
        value: inspectedTile
          ? `${inspectedTile.tileX}, ${inspectedTile.tileZ}`
          : '--'
      },
      inspectedType: {
        disabled: true,
        label: 'Current type',
        value: inspectedTile?.typeId ?? '--'
      },
      inspectedHeightSteps: {
        disabled: true,
        label: 'Height steps',
        value: inspectedTile?.heightSteps ?? 0
      },
      currentColorLabel: {
        disabled: true,
        label: 'Current color',
        value:
          inspectedTile?.colorIndex === null || inspectedTile === null
            ? 'Auto'
            : (activeEditConfig.palette[inspectedTile.colorIndex]?.label ??
              'Custom')
      },
      saveError: {
        disabled: true,
        label: 'Status',
        value: editState.saveError ?? 'Ready'
      }
    }),
    { store: editLevaStore },
    [
      activeEditConfig.palette,
      activeEditConfig.tileTypes,
      applyHeightSelection,
      applySelectionToolOverride,
      dirtyEditCount,
      editState.canRedo,
      editState.canUndo,
      editState.enabled,
      editState.saveError,
      editState.selectedColorIndex,
      editState.selectedTypeId,
      editState.tool,
      handleSetEditEnabled,
      handlePaletteSelection,
      isSavingEdits,
      paletteColors,
      selectedColorValue,
      selectedHeightTiles.length,
      typeOptions
    ]
  );
  const [, setEditReadoutControls] = useControls(
    () => ({
      selectedHeightValue: {
        disabled: true,
        label: 'Selected height',
        value: selectedHeightValue
      }
    }),
    { store: editLevaStore },
    []
  );

  useEffect(() => {
    setEditReadoutControls({
      selectedHeightValue
    });
  }, [selectedHeightValue, setEditReadoutControls]);

  useEffect(() => {
    setEditControls({
      dirty: dirtyEditCount,
      hoveredTile: inspectedTile
        ? `${inspectedTile.tileX}, ${inspectedTile.tileZ}`
        : '--',
      currentColorLabel:
        inspectedTile?.colorIndex === null || inspectedTile === null
          ? 'Auto'
          : (activeEditConfig.palette[inspectedTile.colorIndex]?.label ??
            'Custom'),
      inspectedHeightSteps: inspectedTile?.heightSteps ?? 0,
      inspectedType: inspectedTile?.typeId ?? '--',
      haloCount: previewHaloTiles.length,
      heightSelection: selectedHeightTiles.length,
      saveError: editState.saveError ?? 'Ready'
    });
  }, [
    activeEditConfig.palette,
    dirtyEditCount,
    editState.saveError,
    inspectedTile,
    previewHaloTiles.length,
    selectedHeightTiles.length,
    setEditControls
  ]);


  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        Loading map...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-6 text-center text-white">
        Failed to load map data.
      </div>
    );
  }

  if (!map || !activeTerrain || !editConfig || !terrain) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-6 text-center text-white">
        No maps are available. Create one with the API and reload the client.
      </div>
    );
  }

  return (
    <>
      <div onClickCapture={handleLevaClickCapture} ref={levaContainerRef}>
        <Leva
          collapsed={{
            collapsed: levaUiState.collapsed,
            onChange: handleLevaCollapsedChange
          }}
          hidden={false}
          titleBar={{
            onDragEnd: handleLevaDrag,
            position: levaUiState.position
          }}
        />
      </div>
      {IS_DEV && <DevSceneControls folderState={levaUiState.folderState} />}
      <div
        className="relative h-screen w-screen touch-none overflow-hidden bg-black text-white select-none"
        ref={handleContainerRef}
        tabIndex={0}
        {...containerProps}
      >
        <Canvas
          camera={{ far: 5000, fov: 70, near: 1, position: [0, 0, 0] }}
          dpr={1}
          gl={{ antialias: false }}
          onCreated={({ gl }) => {
            gl.localClippingEnabled = true;
            gl.shadowMap.type = BasicShadowMap;
          }}
          shadows={{ type: BasicShadowMap }}
        >
          <ZarchScene
            editEnabled={editState.enabled}
            editorMode={editorMode}
            entityEditState={entityEditSceneState}
            inputRef={inputRef}
            map={map}
            onEditTileActivate={handleEditTileActivate}
            onEditTileHover={handleEditTileHover}
            onEditTileSelectionStart={handleEditTileSelectionStart}
            onEditTileSelectionUpdate={handleEditTileSelectionUpdate}
            onEntityHover={handleEntityHover}
            onEntityPlace={handleEntityPlace}
            onEntitySelect={handleEntitySelect}
            previewHaloTiles={previewHaloTiles}
            runtimeRef={runtimeRef}
            selectedHeightPlane={editState.lastSolvedPlaneHeight}
            selectedHeightTiles={selectedHeightTiles}
            terrain={activeTerrain}
          />
        </Canvas>

        {showHud && (
          <ZarchHud
            editEnabled={editState.enabled}
            onToggleMode={handleToggleMode}
            runtimeRef={runtimeRef}
            terrain={activeTerrain}
          />
        )}
        {showMinimap && (
          <ZarchMinimap runtimeRef={runtimeRef} terrain={activeTerrain} />
        )}
        {editState.enabled && (
          <ZarchEntityEditHud
            archetypes={catalogArchetypes}
            editorMode={editorMode}
            editEnabled={editState.enabled}
            entityEditState={entityEditState}
            onCatalogToggle={handleCatalogToggle}
            onDeleteEntity={() => void handleDeleteEntity()}
            onRotateEntity={direction => void handleRotateEntity(direction)}
            onSetEditorMode={handleSetEditorMode}
            onSetEnabled={handleSetEditEnabled}
            onSetTool={handleSetEntityTool}
            selectedEntity={selectedEntity}
          />
        )}
        {editState.enabled &&
          editorMode === 'entities' &&
          entityEditState.catalogOpen && (
            <ZarchEntityCatalog
              activeArchetypeId={entityEditState.activeArchetypeId}
              archetypes={catalogArchetypes}
              assetVersionsById={catalogAssetVersionsById}
              category={entityEditState.catalogCategory}
              onClose={() =>
                dispatchEntityEdit({
                  type: 'set-catalog-open',
                  open: false
                })
              }
              onSelectArchetype={handleSelectArchetype}
              onSetCategory={category =>
                dispatchEntityEdit({
                  type: 'set-catalog-category',
                  category
                })
              }
              onSetSearch={search =>
                dispatchEntityEdit({
                  type: 'set-catalog-search',
                  search
                })
              }
              referencedArchetypeIds={referencedArchetypeIds}
              search={entityEditState.catalogSearch}
            />
          )}
      </div>
      {editorMode === 'terrain' && (
        <LevaPanel store={editLevaStore} titleBar={{ title: 'Edit' }} />
      )}
      {/* <ThemeTogglePortal /> */}
    </>
  );
};

export const Main = () => (
  <JotaiProvider store={sceneConfigStore}>
    <MainInner />
  </JotaiProvider>
);
