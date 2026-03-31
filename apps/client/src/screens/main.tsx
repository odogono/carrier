import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { BasicShadowMap } from 'three';
import { Canvas } from '@react-three/fiber';

import { type ZarchTileEditConfig, isFiniteMap, type MapMetadata } from 'carrier-contracts/types';
import { Provider as JotaiProvider } from 'jotai';
import { Leva } from 'leva';
import { createLog } from 'odgn-ts-helpers/log';
import { useQueryClient } from '@tanstack/react-query';

import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { client, connectApi } from '@/helpers/api-link';
import { ensurePlaneToArrayCompat } from '@/helpers/three-plane-compat';
import { sceneConfigStore } from '@/helpers/zarch-scene-config';
import { SEA_Y, TILE } from '@/helpers/zarch-terrain';
import {
  DevSceneControls,
  LEVA_CONTROL_FOLDERS,
  type LevaControlFolder,
  useSceneConfigValue,
  type DevSceneControlFolderState
} from '@/hooks/use-scene-controls';

import { useServerMapTerrain } from './zarch/use-server-map-terrain';
import { useZarchRuntime } from './zarch/use-zarch-runtime';
import { ZarchEditHud } from './zarch/zarch-edit-hud';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { createPlayerShipSpawnState } from './zarch/zarch-player-ship';
import { ZarchScene } from './zarch/zarch-scene';
import {
  createEditedTerrain,
  createZarchTileEditState,
  getDraftEdits,
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
  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);
  const { containerProps, enterShipMode, exitShipMode, inputRef, runtimeRef } =
    useZarchRuntime({
      containerElement,
      editEnabled: editState.enabled
    });
  const { editConfig, error, isLoading, map, terrain } = useServerMapTerrain();
  const showHud = useSceneConfigValue('showHud');
  const showMinimap = useSceneConfigValue('showMinimap');
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
  }, [activeTerrain, containerElement, editState.enabled, enterShipMode, exitShipMode, map, runtimeRef]);

  const handleEditTileHover = useCallback((tile: { tileX: number; tileZ: number } | null) => {
    dispatchEdit({ hoveredTile: tile, type: 'set-hovered-tile' });
  }, []);

  const handleEditTileActivate = useCallback(
    (tileX: number, tileZ: number) => {
      if (!terrain) {
        return;
      }

      dispatchEdit({ saveError: null, type: 'set-save-error' });
      dispatchEdit({
        current: getMergedTileState(terrain, editState.edits, tileX, tileZ),
        tileX,
        tileZ,
        type: 'apply-tool'
      });
      containerElement?.focus();
    },
    [containerElement, editState.edits, terrain]
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

  const handleSetEditEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled && runtimeRef.current.mode === 'ship') {
        exitShipMode();
      }

      dispatchEdit({ enabled, type: 'set-enabled' });
    },
    [exitShipMode, runtimeRef]
  );

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
          oneLineLabels
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
            inputRef={inputRef}
            map={map}
            onEditTileActivate={handleEditTileActivate}
            onEditTileHover={handleEditTileHover}
            runtimeRef={runtimeRef}
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
        <ZarchEditHud
          editConfig={editConfig}
          editState={editState}
          inspectedTile={inspectedTile}
          isSaving={isSavingEdits}
          onCancel={() => dispatchEdit({ type: 'reset-draft' })}
          onRedo={() => dispatchEdit({ type: 'redo' })}
          onSave={() => void handleSaveTileEdits()}
          onSetColorIndex={colorIndex =>
            dispatchEdit({ selectedColorIndex: colorIndex, type: 'set-selected-color-index' })
          }
          onSetEnabled={handleSetEditEnabled}
          onSetTool={tool => dispatchEdit({ tool, type: 'set-tool' })}
          onSetTypeId={typeId =>
            dispatchEdit({ selectedTypeId: typeId, type: 'set-selected-type-id' })
          }
          onUndo={() => dispatchEdit({ type: 'undo' })}
        />
      </div>
      <ThemeTogglePortal />
    </>
  );
};

export const Main = () => (
  <JotaiProvider store={sceneConfigStore}>
    <MainInner />
  </JotaiProvider>
);
