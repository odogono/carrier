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
  type ArchetypeCategory,
  type AssetVersion,
  type MapMetadata,
  type RuntimeMapChunk,
  type StaticEntity,
  type ZarchTileEditConfig
} from 'carrier-contracts/types';
import { Provider as JotaiProvider } from 'jotai';
import {
  Leva,
  LevaPanel,
  button,
  folder,
  useControls,
  useCreateStore
} from 'leva';
import { createLog } from 'odgn-ts-helpers/log';

import { palette } from '@/components/leva-palette-plugin';
// import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { client, connectApi } from '@/helpers/api-link';
import { ensurePlaneToArrayCompat } from '@/helpers/three-plane-compat';
import { sceneConfigStore } from '@/helpers/zarch-scene-config';
import {
  collectChunkStaticEntities,
  getSceneMetersScale
} from '@/helpers/zarch-static-entities';
import { SEA_Y, TILE } from '@/helpers/zarch-terrain';
import {
  DevSceneControls,
  LEVA_CONTROL_FOLDERS,
  useSceneConfigValue,
  type DevSceneControlFolderState,
  type LevaControlFolder
} from '@/hooks/use-scene-controls';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServerMapTerrain } from './zarch/use-server-map-terrain';
import {
  useZarchRuntime,
  type ZarchRuntimeMode
} from './zarch/use-zarch-runtime';
import {
  createZarchEntityEditState,
  reduceZarchEntityEditState,
  type ZarchEntityEditTool
} from './zarch/zarch-entity-edit';
import { normalizeEntityYaw } from './zarch/zarch-entity-transform';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { createPlayerShipSpawnState } from './zarch/zarch-player-ship';
import { findNearestTankSpawn } from './zarch/zarch-player-tank';
import { ZarchScene } from './zarch/zarch-scene';
import {
  computeAreaHeightEdits,
  createEditedTerrain,
  createZarchTileEditState,
  getAreaHeightPreview,
  getDraftEdits,
  getHeightSelectionTiles,
  getMergedTileState,
  getPreviewHaloTiles,
  getTerrainTileState,
  reduceZarchTileEditState
} from './zarch/zarch-tile-edit';

const IS_DEV = process.env.NODE_ENV !== 'production';
const LEVA_UI_STATE_STORAGE_KEY = 'carrier:leva-ui-state';

const log = createLog('Main');

ensurePlaneToArrayCompat();

type EditorMode = 'terrain' | 'entities';

type LevaUiState = {
  catalog: LevaPanelUiState;
  collapsed: boolean;
  edit: LevaPanelUiState;
  entity: LevaPanelUiState;
  folderState: DevSceneControlFolderState;
  position: LevaPanelUiState['position'];
};

type LevaPanelUiState = {
  collapsed: boolean;
  position: {
    x?: number;
    y?: number;
  };
};

const DEFAULT_LEVA_PANEL_UI_STATE: LevaPanelUiState = {
  collapsed: false,
  position: {}
};

const DEFAULT_LEVA_UI_STATE: LevaUiState = {
  catalog: DEFAULT_LEVA_PANEL_UI_STATE,
  collapsed: false,
  edit: DEFAULT_LEVA_PANEL_UI_STATE,
  entity: DEFAULT_LEVA_PANEL_UI_STATE,
  folderState: {},
  position: {}
};
const EMPTY_LEVA_SCHEMA = {};

const FALLBACK_TILE_EDIT_CONFIG: ZarchTileEditConfig = {
  heightStepMeters: 4,
  maxAbsHeightSteps: 16,
  palette: [],
  tileTypes: [{ id: 'normal', label: 'Normal' }]
};
const CATALOG_NONE_VALUE = '__none__';
const CATALOG_CATEGORIES: Array<{
  label: string;
  value: ArchetypeCategory | 'all';
}> = [
  { label: 'All', value: 'all' },
  { label: 'Building', value: 'building' },
  { label: 'Landmark', value: 'landmark' },
  { label: 'Industrial', value: 'industrial' },
  { label: 'Prop', value: 'natural-prop' }
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toEntityEditErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return message.includes('Expected revision')
    ? 'Revision conflict: reload and retry.'
    : message;
};

export const getEditPanelVisibility = ({
  catalogOpen,
  editEnabled,
  editorMode
}: {
  catalogOpen: boolean;
  editEnabled: boolean;
  editorMode: EditorMode;
}) => {
  const entity = editEnabled && editorMode === 'entities';

  return {
    catalog: entity && catalogOpen,
    edit: true,
    entity
  };
};

const readLevaPanelUiState = (
  value: unknown,
  fallback: LevaPanelUiState
): LevaPanelUiState => {
  if (!isRecord(value)) {
    return fallback;
  }

  const position = isRecord(value.position) ? value.position : {};

  return {
    collapsed:
      typeof value.collapsed === 'boolean'
        ? value.collapsed
        : fallback.collapsed,
    position: {
      x: typeof position.x === 'number' ? position.x : fallback.position.x,
      y: typeof position.y === 'number' ? position.y : fallback.position.y
    }
  };
};

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
    const editState = readLevaPanelUiState(
      parsed.edit,
      DEFAULT_LEVA_PANEL_UI_STATE
    );
    const catalogState = readLevaPanelUiState(
      parsed.catalog,
      DEFAULT_LEVA_PANEL_UI_STATE
    );
    const entityState = readLevaPanelUiState(
      parsed.entity,
      DEFAULT_LEVA_PANEL_UI_STATE
    );
    const viewState = readLevaPanelUiState(parsed, DEFAULT_LEVA_UI_STATE);

    return {
      catalog: catalogState,
      collapsed: viewState.collapsed,
      edit: editState,
      entity: entityState,
      folderState: Object.fromEntries(
        LEVA_CONTROL_FOLDERS.map(folderName => [
          folderName,
          typeof folderState[folderName] === 'boolean'
            ? (folderState[folderName] as boolean)
            : false
        ])
      ) as DevSceneControlFolderState,
      position: viewState.position
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
  const [editorMode, setEditorMode] = useState<EditorMode>('terrain');
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
  const {
    containerProps,
    enterLanderMode,
    enterNavigationMode,
    enterTankMode,
    inputRef,
    runtimeRef
  } = useZarchRuntime({
    containerElement,
    editEnabled: editState.enabled,
    editorMode,
    entityEditCallbacksRef
  });
  const { editConfig, error, isLoading, map, terrain } = useServerMapTerrain();
  const showHud = useSceneConfigValue('showHud');
  const showMinimap = useSceneConfigValue('showMinimap');
  const activeEditConfig = editConfig ?? FALLBACK_TILE_EDIT_CONFIG;
  const catalogLevaStore = useCreateStore();
  const editLevaStore = useCreateStore();
  const entityLevaStore = useCreateStore();
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

    const value = activeTerrain.getTileAverageHeight(
      target.tileX,
      target.tileZ
    );
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

  const handleEditLevaCollapsedChange = useCallback(
    (collapsed: boolean) => {
      updateLevaUiState(current => ({
        ...current,
        edit: { ...current.edit, collapsed }
      }));
    },
    [updateLevaUiState]
  );

  const handleCatalogLevaCollapsedChange = useCallback(
    (collapsed: boolean) => {
      updateLevaUiState(current => ({
        ...current,
        catalog: { ...current.catalog, collapsed }
      }));
    },
    [updateLevaUiState]
  );

  const handleEntityLevaCollapsedChange = useCallback(
    (collapsed: boolean) => {
      updateLevaUiState(current => ({
        ...current,
        entity: { ...current.entity, collapsed }
      }));
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

  const handleCatalogLevaDrag = useCallback(
    (position: { x?: number; y?: number }) => {
      updateLevaUiState(current => ({
        ...current,
        catalog: {
          ...current.catalog,
          position: {
            x: position.x,
            y: position.y
          }
        }
      }));
    },
    [updateLevaUiState]
  );

  const handleEntityLevaDrag = useCallback(
    (position: { x?: number; y?: number }) => {
      updateLevaUiState(current => ({
        ...current,
        entity: {
          ...current.entity,
          position: {
            x: position.x,
            y: position.y
          }
        }
      }));
    },
    [updateLevaUiState]
  );

  const handleEditLevaDrag = useCallback(
    (position: { x?: number; y?: number }) => {
      updateLevaUiState(current => ({
        ...current,
        edit: {
          ...current.edit,
          position: {
            x: position.x,
            y: position.y
          }
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
    runtimeRef.current.lander = null;
    runtimeRef.current.tank = null;
    dispatchEdit({ enabled: false, type: 'set-enabled' });
    dispatchEdit({ type: 'reset-draft' });
  }, [map, runtimeRef]);

  const handleSelectMode = useCallback(
    (mode: ZarchRuntimeMode) => {
      if (!map || !activeTerrain || editState.enabled) {
        return;
      }

      if (mode === 'navigation') {
        enterNavigationMode();
        containerElement?.focus();
        return;
      }

      const focus = runtimeRef.current.camera;
      enterNavigationMode();
      if (mode === 'lander') {
        enterLanderMode(
          createPlayerShipSpawnState({
            surface: {
              sampleHeightAtWorld: activeTerrain.sampleHeightAtWorld,
              waterHeight: SEA_Y
            },
            x: focus.x,
            z: focus.z
          })
        );
      } else {
        if (runtimeRef.current.tankAvailability !== 'ready') {
          return;
        }
        const spawn = findNearestTankSpawn({
          surface: activeTerrain,
          tileMeters: TILE,
          x: focus.x,
          z: focus.z
        });
        if (!spawn) {
          runtimeRef.current.tankError =
            'No valid loaded Tank spawn is available';
          containerElement?.focus();
          return;
        }
        runtimeRef.current.tankError = null;
        const sceneScale = getSceneMetersScale(map);
        enterTankMode({
          activeShellCount: 0,
          lastShellImpactSurface: null,
          quaternion: [
            0,
            Math.sin(runtimeRef.current.camera.yaw / 2),
            0,
            Math.cos(runtimeRef.current.camera.yaw / 2)
          ],
          shellImpactCount: 0,
          speedMetersPerSecond: 0,
          turretYaw: 0,
          x: spawn.x / sceneScale,
          y: spawn.y,
          yaw: runtimeRef.current.camera.yaw,
          z: spawn.z / sceneScale
        });
      }
      containerElement?.focus();
    },
    [
      activeTerrain,
      containerElement,
      editState.enabled,
      enterLanderMode,
      enterNavigationMode,
      enterTankMode,
      map,
      runtimeRef
    ]
  );

  const handleSetEditEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled && runtimeRef.current.mode !== 'navigation') {
        enterNavigationMode();
      }

      dispatchEdit({ enabled, type: 'set-enabled' });
    },
    [enterNavigationMode, runtimeRef]
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
    (tileX: number, tileZ: number, _shiftKey: boolean) => {
      if (!terrain || !editConfig) {
        return;
      }

      dispatchEdit({ saveError: null, type: 'set-save-error' });

      dispatchEdit({ tileX, tileZ, type: 'begin-height-selection-box' });
      containerElement?.focus();
    },
    [containerElement, editConfig, terrain]
  );

  const handleEditTileBlankActivate = useCallback(() => {
    dispatchEdit({ type: 'clear-height-selection' });
    containerElement?.focus();
  }, [containerElement]);

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
        current: getMergedTileState(
          terrain,
          editState.edits,
          tile.tileX,
          tile.tileZ
        )
      }));

      if (tileEdits.length === 0) {
        return;
      }

      const anchorTile = editState.selectedTile ?? selectedHeightTiles[0]!;

      dispatchEdit({
        current: tileEdits[0]!.current,
        selectedColorIndexOverride,
        selectedTypeIdOverride,
        tileEdits,
        tileX: anchorTile.tileX,
        tileZ: anchorTile.tileZ,
        toolOverride:
          selectedColorIndexOverride !== undefined
            ? 'set-color'
            : selectedTypeIdOverride !== undefined
              ? 'set-type'
              : undefined,
        type: 'apply-tool'
      });
      containerElement?.focus();
    },
    [
      containerElement,
      editState.edits,
      editState.selectedTile,
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
    [applySelectionToolOverride, selectedHeightTiles.length]
  );

  const applyHeightSelection = useCallback(
    (mode: 'flatten' | 'raise' | 'lower') => {
      if (!terrain || !editConfig || selectedHeightTiles.length === 0) {
        return;
      }

      const result = computeAreaHeightEdits({
        currentPlaneHeight: editState.lastSolvedPlaneHeight,
        editConfig,
        edits: editState.edits,
        mode,
        selection: selectedHeightTiles,
        terrain
      });

      if (result.heightEdits.length === 0) {
        return;
      }

      const anchorTile = editState.selectedTile ?? selectedHeightTiles[0]!;

      dispatchEdit({
        current: getMergedTileState(
          terrain,
          editState.edits,
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
      containerElement?.focus();
    },
    [
      containerElement,
      editConfig,
      editState.edits,
      editState.lastSolvedPlaneHeight,
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

  const archetypeCatalogQuery = useQuery({
    enabled: editorMode === 'entities' && editState.enabled,
    queryFn: () => client.maps.listArchetypes({ status: 'active' }),
    queryKey: ['archetypes-catalog'],
    staleTime: 60_000
  });

  const catalogArchetypes = useMemo(
    () => archetypeCatalogQuery.data ?? [],
    [archetypeCatalogQuery.data]
  );

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
  const filteredCatalogArchetypes = useMemo(() => {
    let result = catalogArchetypes;

    if (entityEditState.catalogCategory) {
      result = result.filter(
        archetype => archetype.category === entityEditState.catalogCategory
      );
    }

    if (entityEditState.catalogSearch.trim()) {
      const search = entityEditState.catalogSearch.trim().toLowerCase();
      result = result.filter(
        archetype =>
          archetype.name.toLowerCase().includes(search) ||
          archetype.category.toLowerCase().includes(search) ||
          archetype.tags.some(tag => tag.toLowerCase().includes(search))
      );
    }

    return result;
  }, [
    catalogArchetypes,
    entityEditState.catalogCategory,
    entityEditState.catalogSearch
  ]);
  const catalogArchetypeOptions = useMemo(() => {
    if (filteredCatalogArchetypes.length === 0) {
      return {
        'No matching archetypes': CATALOG_NONE_VALUE
      };
    }

    return Object.fromEntries(
      filteredCatalogArchetypes.map(archetype => {
        const assetVersion = catalogAssetVersionsById.get(
          archetype.assetVersionId
        );
        const footprint = assetVersion
          ? ` ${assetVersion.footprint.widthMeters.toFixed(0)}x${assetVersion.footprint.depthMeters.toFixed(0)}m`
          : '';
        const used = referencedArchetypeIds.has(archetype.id)
          ? ' (on map)'
          : '';

        return [
          `${archetype.name}${used}${footprint} [${archetype.id}]`,
          archetype.id
        ];
      })
    );
  }, [
    catalogAssetVersionsById,
    filteredCatalogArchetypes,
    referencedArchetypeIds
  ]);
  const catalogCategoryValue = entityEditState.catalogCategory ?? 'all';
  const catalogCategoryOptions = useMemo(
    () =>
      Object.fromEntries(
        CATALOG_CATEGORIES.map(category => [category.label, category.value])
      ),
    []
  );

  const selectedEntity = useMemo((): StaticEntity | null => {
    if (!entityEditState.selectedEntityId || !map) {
      return null;
    }

    const chunks: RuntimeMapChunk[] = [];
    queryClient
      .getQueriesData({ queryKey: ['map-chunk', map.id] })
      .forEach(([, data]) => {
        if (data) {
          chunks.push(data as RuntimeMapChunk);
        }
      });

    const entities = collectChunkStaticEntities(chunks);
    return (
      entities.find(e => e.id === entityEditState.selectedEntityId) ?? null
    );
  }, [entityEditState.selectedEntityId, map, queryClient]);

  const activeArchetype = useMemo(() => {
    if (!entityEditState.activeArchetypeId) {
      return null;
    }
    return (
      catalogArchetypes.find(a => a.id === entityEditState.activeArchetypeId) ??
      null
    );
  }, [catalogArchetypes, entityEditState.activeArchetypeId]);
  const activeAssetVersionId = activeArchetype?.assetVersionId ?? null;

  const invalidateEntityQueries = useCallback(async () => {
    if (!map) {
      return;
    }
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

  const handlePlaceEntity = useCallback(
    async (worldX: number, worldZ: number) => {
      if (
        !map ||
        !entityEditState.activeArchetypeId ||
        entityEditState.pendingAction
      ) {
        return;
      }

      dispatchEntityEdit({ action: 'Placing', type: 'set-pending' });
      dispatchEntityEdit({ error: null, type: 'set-error' });

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
          entityId: result.entity.id,
          type: 'select-entity'
        });
        await invalidateEntityQueries();
      } catch (error) {
        dispatchEntityEdit({
          error: toEntityEditErrorMessage(error, 'Failed to place entity'),
          type: 'set-error'
        });
      } finally {
        dispatchEntityEdit({ action: null, type: 'set-pending' });
      }
    },
    [
      entityEditState.activeArchetypeId,
      entityEditState.pendingAction,
      invalidateEntityQueries,
      map
    ]
  );

  const handleRotateEntity = useCallback(
    async (direction: 'cw' | 'ccw') => {
      if (!map || !selectedEntity || entityEditState.pendingAction) {
        return;
      }

      dispatchEntityEdit({ action: 'Rotating', type: 'set-pending' });
      dispatchEntityEdit({ error: null, type: 'set-error' });

      const yawDelta = direction === 'cw' ? 45 : -45;
      const newYaw = normalizeEntityYaw(selectedEntity.rotation.yaw + yawDelta);

      try {
        await client.maps.updateStaticEntity({
          expectedRevision: map.revision,
          id: selectedEntity.id,
          mapId: map.id,
          rotation: { yaw: newYaw }
        });
        await invalidateEntityQueries();
      } catch (error) {
        dispatchEntityEdit({
          error: toEntityEditErrorMessage(error, 'Failed to rotate entity'),
          type: 'set-error'
        });
      } finally {
        dispatchEntityEdit({ action: null, type: 'set-pending' });
      }
    },
    [
      entityEditState.pendingAction,
      invalidateEntityQueries,
      map,
      selectedEntity
    ]
  );

  const handleMoveEntity = useCallback(
    async (entity: StaticEntity, position: { x: number; z: number }) => {
      if (!map || entityEditState.pendingAction) {
        return;
      }

      dispatchEntityEdit({ action: 'Moving', type: 'set-pending' });
      dispatchEntityEdit({ error: null, type: 'set-error' });

      try {
        await client.maps.updateStaticEntity({
          expectedRevision: map.revision,
          id: entity.id,
          mapId: map.id,
          position
        });
        await invalidateEntityQueries();
      } catch (error) {
        dispatchEntityEdit({
          error: toEntityEditErrorMessage(error, 'Failed to move entity'),
          type: 'set-error'
        });
      } finally {
        dispatchEntityEdit({ action: null, type: 'set-pending' });
      }
    },
    [entityEditState.pendingAction, invalidateEntityQueries, map]
  );

  const handleSetEntityTransform = useCallback(
    async (
      entity: StaticEntity,
      transform: {
        scale: number;
        yaw: number;
      }
    ) => {
      if (!map || entityEditState.pendingAction) {
        return;
      }

      dispatchEntityEdit({ action: 'Rotating', type: 'set-pending' });
      dispatchEntityEdit({ error: null, type: 'set-error' });

      try {
        await client.maps.updateStaticEntity({
          expectedRevision: map.revision,
          id: entity.id,
          mapId: map.id,
          rotation: { yaw: normalizeEntityYaw(transform.yaw) },
          scale: transform.scale
        });
        await invalidateEntityQueries();
      } catch (error) {
        dispatchEntityEdit({
          error: toEntityEditErrorMessage(error, 'Failed to transform entity'),
          type: 'set-error'
        });
      } finally {
        dispatchEntityEdit({ action: null, type: 'set-pending' });
      }
    },
    [entityEditState.pendingAction, invalidateEntityQueries, map]
  );

  const handleSetEntityYOffset = useCallback(
    async (yOffset: number) => {
      if (!map || !selectedEntity || entityEditState.pendingAction) {
        return;
      }

      dispatchEntityEdit({ action: 'Updating height', type: 'set-pending' });
      dispatchEntityEdit({ error: null, type: 'set-error' });

      try {
        await client.maps.updateStaticEntity({
          expectedRevision: map.revision,
          id: selectedEntity.id,
          mapId: map.id,
          yOffset
        });
        await invalidateEntityQueries();
      } catch (error) {
        dispatchEntityEdit({
          error: toEntityEditErrorMessage(
            error,
            'Failed to update entity height'
          ),
          type: 'set-error'
        });
      } finally {
        dispatchEntityEdit({ action: null, type: 'set-pending' });
      }
    },
    [
      entityEditState.pendingAction,
      invalidateEntityQueries,
      map,
      selectedEntity
    ]
  );

  const handleSetEntityArchetype = useCallback(
    async (entity: StaticEntity, archetypeId: string) => {
      if (!map || entityEditState.pendingAction) {
        return;
      }

      dispatchEntityEdit({ action: 'Updating archetype', type: 'set-pending' });
      dispatchEntityEdit({ error: null, type: 'set-error' });

      try {
        await client.maps.updateStaticEntity({
          archetypeId,
          expectedRevision: map.revision,
          id: entity.id,
          mapId: map.id
        });
        await invalidateEntityQueries();
      } catch (error) {
        dispatchEntityEdit({
          error: toEntityEditErrorMessage(error, 'Failed to change archetype'),
          type: 'set-error'
        });
      } finally {
        dispatchEntityEdit({ action: null, type: 'set-pending' });
      }
    },
    [entityEditState.pendingAction, invalidateEntityQueries, map]
  );

  const handleDeleteEntity = useCallback(async () => {
    if (
      !map ||
      !entityEditState.selectedEntityId ||
      entityEditState.pendingAction
    ) {
      return;
    }

    dispatchEntityEdit({ action: 'Deleting', type: 'set-pending' });
    dispatchEntityEdit({ error: null, type: 'set-error' });

    try {
      await client.maps.deleteStaticEntity({
        expectedRevision: map.revision,
        id: entityEditState.selectedEntityId,
        mapId: map.id
      });
      dispatchEntityEdit({ type: 'clear-selection' });
      await invalidateEntityQueries();
    } catch (error) {
      dispatchEntityEdit({
        error: toEntityEditErrorMessage(error, 'Failed to delete entity'),
        type: 'set-error'
      });
    } finally {
      dispatchEntityEdit({ action: null, type: 'set-pending' });
    }
  }, [
    entityEditState.pendingAction,
    entityEditState.selectedEntityId,
    invalidateEntityQueries,
    map
  ]);

  const entityEditCallbacks = useMemo(() => {
    if (editorMode !== 'entities' || !editState.enabled) {
      return null;
    }
    return {
      catalogOpen: entityEditState.catalogOpen,
      onClearSelection: () => dispatchEntityEdit({ type: 'clear-selection' }),
      onCloseCatalog: () =>
        dispatchEntityEdit({ open: false, type: 'set-catalog-open' }),
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

  entityEditCallbacksRef.current = entityEditCallbacks;

  const entityEditSceneState = useMemo(() => {
    if (editorMode !== 'entities' || !editState.enabled) {
      return null;
    }
    return {
      activeArchetypeId: entityEditState.activeArchetypeId,
      activeAssetVersionId,
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

  const handleSetEditorMode = useCallback((mode: EditorMode) => {
    setEditorMode(mode);
  }, []);

  const handleEntityHover = useCallback((entityId: string | null) => {
    dispatchEntityEdit({ entityId, type: 'hover-entity' });
  }, []);

  const handleEntitySelect = useCallback((entityId: string | null) => {
    dispatchEntityEdit({ entityId, type: 'select-entity' });
  }, []);

  const handleEntityPlace = useCallback(
    (worldX: number, worldZ: number) => {
      void handlePlaceEntity(worldX, worldZ);
    },
    [handlePlaceEntity]
  );

  const handleCatalogToggle = useCallback(() => {
    dispatchEntityEdit({
      open: !entityEditState.catalogOpen,
      type: 'set-catalog-open'
    });
  }, [entityEditState.catalogOpen]);

  const selectedEntityRef = useRef<StaticEntity | null>(selectedEntity);
  selectedEntityRef.current = selectedEntity;
  const handleSetEntityArchetypeRef = useRef(handleSetEntityArchetype);
  handleSetEntityArchetypeRef.current = handleSetEntityArchetype;

  const handleSelectArchetype = useCallback((archetypeId: string) => {
    dispatchEntityEdit({ archetypeId, type: 'set-active-archetype' });

    const entity = selectedEntityRef.current;
    if (entity && entity.archetypeId !== archetypeId) {
      void handleSetEntityArchetypeRef.current(entity, archetypeId);
    }
  }, []);

  const handleSetEntityTool = useCallback((tool: 'place' | 'select') => {
    dispatchEntityEdit({ tool, type: 'set-tool' });
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
      editConfig,
      edits: editState.edits,
      selection: selectedHeightTiles,
      terrain
    });

    dispatchEdit({
      lastSolvedPlaneHeight: preview.targetHeight,
      previewHaloTiles: preview.haloTiles,
      type: 'set-height-preview'
    });
  }, [
    editConfig,
    editState.edits,
    editState.tool,
    selectedHeightTiles,
    terrain
  ]);

  useControls(
    () => ({
      [editState.enabled ? 'Exit Edit' : 'Enter Edit']: button(() =>
        handleSetEditEnabled(!editState.enabled)
      )
    }),
    { store: editLevaStore },
    [editState.enabled, handleSetEditEnabled]
  );
  const [, setEditControls] = useControls(
    () => ({
      editStatus: {
        disabled: true,
        label: 'Edit',
        value: editState.enabled ? 'On' : 'Off'
      },
      mode: {
        label: 'Mode',
        onChange: (
          value: EditorMode,
          _path: string,
          context: { initial: boolean }
        ) => {
          if (context.initial) {
            return;
          }

          handleSetEditorMode(value);
        },
        options: {
          Entities: 'entities',
          Terrain: 'terrain'
        },
        transient: false,
        value: editorMode
      }
    }),
    { store: editLevaStore },
    [editState.enabled, editorMode, handleSetEditorMode]
  );
  const [, setTerrainControls] = useControls(
    () =>
      editorMode === 'terrain'
        ? {
            Terrain: folder(
              {
                Cancel: button(() => dispatchEdit({ type: 'reset-draft' }), {
                  disabled: dirtyEditCount === 0 || isSavingEdits
                }),
                ClearSelection: button(
                  () => dispatchEdit({ type: 'clear-height-selection' }),
                  {
                    disabled:
                      editState.tool !== 'height' ||
                      selectedHeightTiles.length === 0
                  }
                ),
                currentColorLabel: {
                  disabled: true,
                  label: 'Current color',
                  value:
                    inspectedTile?.colorIndex === null || inspectedTile === null
                      ? 'Auto'
                      : (activeEditConfig.palette[inspectedTile.colorIndex]
                          ?.label ?? 'Custom')
                },
                dirty: {
                  disabled: true,
                  label: 'Dirty tiles',
                  value: dirtyEditCount
                },
                Flatten: button(() => applyHeightSelection('flatten'), {
                  disabled:
                    editState.tool !== 'height' ||
                    selectedHeightTiles.length === 0
                }),
                haloCount: {
                  disabled: true,
                  label: 'Halo tiles',
                  value: previewHaloTiles.length
                },
                heightSelection: {
                  disabled: true,
                  label: 'Selection',
                  value: selectedHeightTiles.length
                },
                hoveredTile: {
                  disabled: true,
                  label: 'Tile',
                  value: inspectedTile
                    ? `${inspectedTile.tileX}, ${inspectedTile.tileZ}`
                    : '--'
                },
                inspectedHeightSteps: {
                  disabled: true,
                  label: 'Height steps',
                  value: inspectedTile?.heightSteps ?? 0
                },
                inspectedType: {
                  disabled: true,
                  label: 'Current type',
                  value: inspectedTile?.typeId ?? '--'
                },
                Lower: button(() => applyHeightSelection('lower'), {
                  disabled:
                    editState.tool !== 'height' ||
                    selectedHeightTiles.length === 0
                }),
                Raise: button(() => applyHeightSelection('raise'), {
                  disabled:
                    editState.tool !== 'height' ||
                    selectedHeightTiles.length === 0
                }),
                Redo: button(() => dispatchEdit({ type: 'redo' }), {
                  disabled: !editState.canRedo
                }),
                Save: button(() => void handleSaveTileEdits(), {
                  disabled: dirtyEditCount === 0 || isSavingEdits
                }),
                saveError: {
                  disabled: true,
                  label: 'Status',
                  value: editState.saveError ?? 'Ready'
                },
                selectedColorIndex: {
                  ...palette({
                    colors: paletteColors,
                    label: 'Palette',
                    onSelect: handlePaletteSelection,
                    selected: selectedColorValue
                  }),
                  onChange: (
                    value: string,
                    _path: string,
                    context: { initial: boolean }
                  ) => {
                    if (context.initial) {
                      return;
                    }

                    const selectedColorIndex =
                      value === 'auto' ? null : Number(value);

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
                selectedHeightValue: {
                  disabled: true,
                  label: 'Selected height',
                  value: selectedHeightValue
                },
                selectedTypeId: {
                  label: 'Tile type',
                  onChange: (
                    value: string,
                    _path: string,
                    context: { initial: boolean }
                  ) => {
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
                tool: {
                  label: 'Tool',
                  onChange: (
                    value: typeof editState.tool,
                    _path: string,
                    context: { initial: boolean }
                  ) => {
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
                Undo: button(() => dispatchEdit({ type: 'undo' }), {
                  disabled: !editState.canUndo
                })
              },
              { collapsed: false }
            )
          }
        : EMPTY_LEVA_SCHEMA,
    { store: editLevaStore },
    [
      activeEditConfig.palette,
      activeEditConfig.tileTypes,
      applyHeightSelection,
      applySelectionToolOverride,
      dirtyEditCount,
      editorMode,
      editState.canRedo,
      editState.canUndo,
      editState.saveError,
      editState.selectedColorIndex,
      editState.selectedTypeId,
      editState.tool,
      handlePaletteSelection,
      isSavingEdits,
      paletteColors,
      selectedColorValue,
      selectedHeightValue,
      selectedHeightTiles.length,
      typeOptions
    ]
  );

  useEffect(() => {
    setEditControls({
      editStatus: editState.enabled ? 'On' : 'Off',
      mode: editorMode
    });
  }, [editorMode, editState.enabled, setEditControls]);

  useEffect(() => {
    if (editorMode !== 'terrain') {
      return;
    }

    setTerrainControls({
      currentColorLabel:
        inspectedTile?.colorIndex === null || inspectedTile === null
          ? 'Auto'
          : (activeEditConfig.palette[inspectedTile.colorIndex]?.label ??
            'Custom'),
      dirty: dirtyEditCount,
      haloCount: previewHaloTiles.length,
      heightSelection: selectedHeightTiles.length,
      hoveredTile: inspectedTile
        ? `${inspectedTile.tileX}, ${inspectedTile.tileZ}`
        : '--',
      inspectedHeightSteps: inspectedTile?.heightSteps ?? 0,
      inspectedType: inspectedTile?.typeId ?? '--',
      saveError: editState.saveError ?? 'Ready',
      selectedHeightValue,
      tool: editState.tool
    });
  }, [
    activeEditConfig.palette,
    dirtyEditCount,
    editorMode,
    editState.saveError,
    editState.tool,
    inspectedTile,
    previewHaloTiles.length,
    selectedHeightValue,
    selectedHeightTiles.length,
    setTerrainControls
  ]);

  const selectedEntityName = selectedEntity
    ? (selectedEntity.label ?? selectedEntity.id)
    : '--';
  const selectedEntityPosition = selectedEntity
    ? `${selectedEntity.position.x.toFixed(1)}, ${selectedEntity.position.z.toFixed(1)}`
    : '--';
  const selectedEntityYaw = selectedEntity?.rotation.yaw ?? 0;
  const selectedEntityScale = selectedEntity?.scale ?? 1;
  const selectedEntityYOffset = selectedEntity?.yOffset ?? 0;
  const entityPanelStatus =
    entityEditState.error ??
    entityEditState.pendingAction ??
    (selectedEntity ? 'Ready' : 'No entity selected');

  const handleSetEntityYOffsetRef = useRef(handleSetEntityYOffset);
  handleSetEntityYOffsetRef.current = handleSetEntityYOffset;
  const handleSetEntityTransformRef = useRef(handleSetEntityTransform);
  handleSetEntityTransformRef.current = handleSetEntityTransform;
  const handleSetEntityToolRef = useRef(handleSetEntityTool);
  handleSetEntityToolRef.current = handleSetEntityTool;
  const handleCatalogToggleRef = useRef(handleCatalogToggle);
  handleCatalogToggleRef.current = handleCatalogToggle;
  const handleDeleteEntityRef = useRef(handleDeleteEntity);
  handleDeleteEntityRef.current = handleDeleteEntity;

  const onEntityYOffsetEditEnd = useCallback((value: number) => {
    const entity = selectedEntityRef.current;
    if (!entity || !Number.isFinite(value) || value === entity.yOffset) {
      return;
    }
    void handleSetEntityYOffsetRef.current(value);
  }, []);
  const onEntityYawEditEnd = useCallback((value: number) => {
    const entity = selectedEntityRef.current;
    if (!entity || !Number.isFinite(value)) {
      return;
    }
    const yaw = normalizeEntityYaw(value);
    if (yaw === entity.rotation.yaw) {
      return;
    }
    void handleSetEntityTransformRef.current(entity, {
      scale: entity.scale,
      yaw
    });
  }, []);
  const onEntityScaleEditEnd = useCallback((value: number) => {
    const entity = selectedEntityRef.current;
    if (
      !entity ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value === entity.scale
    ) {
      return;
    }
    void handleSetEntityTransformRef.current(entity, {
      scale: value,
      yaw: entity.rotation.yaw
    });
  }, []);
  const onEntityToolChange = useCallback(
    (
      value: ZarchEntityEditTool,
      _path: string,
      context: { initial: boolean }
    ) => {
      if (context.initial) {
        return;
      }
      handleSetEntityToolRef.current(value);
    },
    []
  );
  const onEntityCatalogClick = useCallback(
    () => handleCatalogToggleRef.current(),
    []
  );
  const onEntityDeleteClick = useCallback(
    () => void handleDeleteEntityRef.current(),
    []
  );

  const [, setEntityControls] = useControls(
    () => ({
      activeArchetype: {
        disabled: true,
        label: 'Archetype',
        value: '--'
      },
      Catalog: button(onEntityCatalogClick),
      Delete: button(onEntityDeleteClick),
      selectedEntity: {
        disabled: true,
        label: 'Selected',
        value: '--'
      },
      selectedPosition: {
        disabled: true,
        label: 'Position',
        value: '--'
      },
      selectedScale: {
        label: 'Scale',
        min: 0.1,
        onEditEnd: onEntityScaleEditEnd,
        step: 0.1,
        value: 1
      },
      selectedYaw: {
        label: 'Yaw',
        onEditEnd: onEntityYawEditEnd,
        step: 1,
        value: 0
      },
      status: {
        disabled: true,
        label: 'Status',
        value: '--'
      },
      tool: {
        label: 'Tool',
        onChange: onEntityToolChange,
        options: {
          Place: 'place',
          Select: 'select'
        },
        transient: false,
        value: 'place'
      },
      yOffset: {
        label: 'Height offset',
        onEditEnd: onEntityYOffsetEditEnd,
        step: 0.1,
        value: 0
      }
    }),
    { store: entityLevaStore }
  );

  useEffect(() => {
    setEntityControls({
      activeArchetype: activeArchetype?.name ?? '--',
      selectedEntity: selectedEntityName,
      selectedPosition: selectedEntityPosition,
      selectedScale: selectedEntityScale,
      selectedYaw: selectedEntityYaw,
      status: entityPanelStatus,
      tool: entityEditState.tool,
      yOffset: selectedEntityYOffset
    });
  }, [
    activeArchetype?.name,
    entityPanelStatus,
    entityEditState.tool,
    selectedEntityName,
    selectedEntityPosition,
    selectedEntityScale,
    selectedEntityYaw,
    selectedEntityYOffset,
    setEntityControls
  ]);

  const [, setCatalogControls] = useControls(
    () => ({
      archetype: {
        label: 'Archetype',
        onChange: (
          value: string,
          _path: string,
          context: { initial: boolean }
        ) => {
          if (context.initial || value === CATALOG_NONE_VALUE) {
            return;
          }

          handleSelectArchetype(value);
        },
        options: catalogArchetypeOptions,
        transient: false,
        value:
          entityEditState.activeArchetypeId &&
          filteredCatalogArchetypes.some(
            archetype => archetype.id === entityEditState.activeArchetypeId
          )
            ? entityEditState.activeArchetypeId
            : CATALOG_NONE_VALUE
      },
      category: {
        label: 'Category',
        onChange: (
          value: ArchetypeCategory | 'all',
          _path: string,
          context: { initial: boolean }
        ) => {
          if (context.initial) {
            return;
          }

          dispatchEntityEdit({
            category: value === 'all' ? null : value,
            type: 'set-catalog-category'
          });
        },
        options: catalogCategoryOptions,
        transient: false,
        value: catalogCategoryValue
      },
      Close: button(() =>
        dispatchEntityEdit({
          open: false,
          type: 'set-catalog-open'
        })
      ),
      referenced: {
        disabled: true,
        label: 'On map',
        value:
          entityEditState.activeArchetypeId &&
          referencedArchetypeIds.has(entityEditState.activeArchetypeId)
            ? 'Yes'
            : 'No'
      },
      search: {
        label: 'Search',
        onChange: (
          value: string,
          _path: string,
          context: { initial: boolean }
        ) => {
          if (context.initial) {
            return;
          }

          dispatchEntityEdit({
            search: value,
            type: 'set-catalog-search'
          });
        },
        transient: false,
        value: entityEditState.catalogSearch
      },
      selected: {
        disabled: true,
        label: 'Selected',
        value: activeArchetype?.name ?? '--'
      }
    }),
    { store: catalogLevaStore },
    [
      activeArchetype?.name,
      catalogArchetypeOptions,
      catalogCategoryOptions,
      catalogCategoryValue,
      entityEditState.activeArchetypeId,
      entityEditState.catalogSearch,
      filteredCatalogArchetypes,
      handleSelectArchetype,
      referencedArchetypeIds
    ]
  );

  useEffect(() => {
    setCatalogControls({
      archetype:
        entityEditState.activeArchetypeId &&
        filteredCatalogArchetypes.some(
          archetype => archetype.id === entityEditState.activeArchetypeId
        )
          ? entityEditState.activeArchetypeId
          : CATALOG_NONE_VALUE,
      category: catalogCategoryValue,
      referenced:
        entityEditState.activeArchetypeId &&
        referencedArchetypeIds.has(entityEditState.activeArchetypeId)
          ? 'Yes'
          : 'No',
      search: entityEditState.catalogSearch,
      selected: activeArchetype?.name ?? '--'
    });
  }, [
    activeArchetype?.name,
    catalogCategoryValue,
    entityEditState.activeArchetypeId,
    entityEditState.catalogSearch,
    filteredCatalogArchetypes,
    referencedArchetypeIds,
    setCatalogControls
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

  const editPanelVisibility = getEditPanelVisibility({
    catalogOpen: entityEditState.catalogOpen,
    editEnabled: editState.enabled,
    editorMode
  });

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
        data-testid="zarch-gameplay-surface"
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
            onEditTileBlankActivate={handleEditTileBlankActivate}
            onEditTileHover={handleEditTileHover}
            onEditTileSelectionStart={handleEditTileSelectionStart}
            onEditTileSelectionUpdate={handleEditTileSelectionUpdate}
            onEntityHover={handleEntityHover}
            onEntityMove={(entity, position) =>
              void handleMoveEntity(entity, position)
            }
            onEntityPlace={handleEntityPlace}
            onEntitySelect={handleEntitySelect}
            onEntityTransform={(entity, transform) =>
              void handleSetEntityTransform(entity, transform)
            }
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
            onSelectMode={handleSelectMode}
            runtimeRef={runtimeRef}
            terrain={activeTerrain}
          />
        )}
        {showMinimap && (
          <ZarchMinimap runtimeRef={runtimeRef} terrain={activeTerrain} />
        )}
      </div>
      {editPanelVisibility.edit && (
        <LevaPanel
          collapsed={{
            collapsed: levaUiState.edit.collapsed,
            onChange: handleEditLevaCollapsedChange
          }}
          store={editLevaStore}
          titleBar={{
            onDragEnd: handleEditLevaDrag,
            position: levaUiState.edit.position,
            title: 'Edit'
          }}
        />
      )}
      {editPanelVisibility.entity && (
        <LevaPanel
          collapsed={{
            collapsed: levaUiState.entity.collapsed,
            onChange: handleEntityLevaCollapsedChange
          }}
          store={entityLevaStore}
          titleBar={{
            onDragEnd: handleEntityLevaDrag,
            position: levaUiState.entity.position,
            title: 'Entity'
          }}
        />
      )}
      {editPanelVisibility.catalog && (
        <LevaPanel
          collapsed={{
            collapsed: levaUiState.catalog.collapsed,
            onChange: handleCatalogLevaCollapsedChange
          }}
          store={catalogLevaStore}
          titleBar={{
            onDragEnd: handleCatalogLevaDrag,
            position: levaUiState.catalog.position,
            title: 'Catalog'
          }}
        />
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
