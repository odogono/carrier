import { useCallback, useEffect, useRef, useState } from 'react';

import { BasicShadowMap } from 'three';
import { Canvas } from '@react-three/fiber';

import { isFiniteMap, type MapMetadata } from 'carrier-contracts/types';
import { Provider as JotaiProvider } from 'jotai';
import { Leva } from 'leva';
import { createLog } from 'odgn-ts-helpers/log';

import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { connectApi } from '@/helpers/api-link';
import { sceneConfigStore } from '@/helpers/zarch-scene-config';
import { SEA_Y, TILE } from '@/helpers/zarch-terrain';
import {
  DEV_SCENE_CONTROL_FOLDERS,
  type DevSceneControlFolder,
  type DevSceneControlFolderState,
  DevSceneControls,
  useSceneConfigValue
} from '@/hooks/use-scene-controls';

import { useServerMapTerrain } from './zarch/use-server-map-terrain';
import { createPlayerShipSpawnState } from './zarch/zarch-player-ship';
import { useZarchRuntime } from './zarch/use-zarch-runtime';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { ZarchScene } from './zarch/zarch-scene';

const IS_DEV = process.env.NODE_ENV !== 'production';
const LEVA_UI_STATE_STORAGE_KEY = 'carrier:leva-ui-state';

const log = createLog('Main');

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
        DEV_SCENE_CONTROL_FOLDERS.map(folderName => [
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
  const [levaUiState, setLevaUiState] = useState<LevaUiState>(() =>
    readLevaUiState()
  );
  const [containerElement, setContainerElement] =
    useState<HTMLDivElement | null>(null);
  const levaContainerRef = useRef<HTMLDivElement | null>(null);
  const initializedMapIdRef = useRef<string | null>(null);
  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);
  const {
    containerProps,
    enterShipMode,
    exitShipMode,
    inputRef,
    runtimeRef
  } = useZarchRuntime({
    containerElement
  });
  const { error, isLoading, map, terrain } = useServerMapTerrain();
  const showHud = useSceneConfigValue('showHud');
  const showMinimap = useSceneConfigValue('showMinimap');

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
          DEV_SCENE_CONTROL_FOLDERS.includes(label as DevSceneControlFolder) &&
          element.nextElementSibling
        ) {
          updateLevaUiState(current => ({
            ...current,
            folderState: {
              ...current.folderState,
              [label]: !(current.folderState[label as DevSceneControlFolder] ?? false)
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
  }, [map, runtimeRef]);

  const handleToggleMode = useCallback(() => {
    if (!map || !terrain) {
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
          sampleHeightAtWorld: terrain.sampleHeightAtWorld,
          waterHeight: SEA_Y
        },
        x: initialCamera.camX,
        z: initialCamera.camZ
      })
    );
    containerElement?.focus();
  }, [containerElement, enterShipMode, exitShipMode, map, runtimeRef, terrain]);

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

  if (!map || !terrain) {
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
          hidden={!IS_DEV}
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
            inputRef={inputRef}
            map={map}
            runtimeRef={runtimeRef}
            terrain={terrain}
          />
        </Canvas>

        {showHud && (
          <ZarchHud
            onToggleMode={handleToggleMode}
            runtimeRef={runtimeRef}
            terrain={terrain}
          />
        )}
        {showMinimap && (
          <ZarchMinimap runtimeRef={runtimeRef} terrain={terrain} />
        )}
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
