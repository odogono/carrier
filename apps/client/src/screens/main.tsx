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
import { TILE } from '@/helpers/zarch-terrain';
import {
  DevSceneControls,
  useSceneConfigValue
} from '@/hooks/use-scene-controls';

import { useServerMapTerrain } from './zarch/use-server-map-terrain';
import { useZarchRuntime } from './zarch/use-zarch-runtime';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { ZarchScene } from './zarch/zarch-scene';

const IS_DEV = process.env.NODE_ENV !== 'production';

const log = createLog('Main');

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
  const [containerElement, setContainerElement] =
    useState<HTMLDivElement | null>(null);
  const initializedMapIdRef = useRef<string | null>(null);
  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);
  const { containerProps, inputRef, runtimeRef } = useZarchRuntime({
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
    if (!map) {
      initializedMapIdRef.current = null;
      return;
    }

    if (initializedMapIdRef.current === map.id) {
      return;
    }

    initializedMapIdRef.current = map.id;
    const initialCamera = getInitialCameraState(map);
    runtimeRef.current.camX = initialCamera.camX;
    runtimeRef.current.camZ = initialCamera.camZ;
    runtimeRef.current.camYaw = 0;
    runtimeRef.current.camZoom = 1;
    runtimeRef.current.camZoomTarget = 1;
    runtimeRef.current.velX = 0;
    runtimeRef.current.velZ = 0;
  }, [map, runtimeRef]);

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
      <Leva collapsed hidden={!IS_DEV} oneLineLabels />
      {IS_DEV && <DevSceneControls />}
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

        {showHud && <ZarchHud runtimeRef={runtimeRef} terrain={terrain} />}
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
