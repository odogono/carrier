import { useEffect, useRef } from 'react';

import { BasicShadowMap } from 'three';
import { Canvas } from '@react-three/fiber';

import { createLog } from 'odgn-ts-helpers/log';

import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { connectApi } from '@/helpers/api-link';
import { TILE } from '@/helpers/zarch-terrain';

import { useServerMapTerrain } from './zarch/use-server-map-terrain';
import { useZarchRuntime } from './zarch/use-zarch-runtime';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { ZarchScene } from './zarch/zarch-scene';

const log = createLog('Main');

export const Main = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedMapIdRef = useRef<string | null>(null);
  const { containerProps, inputRef, runtimeRef } = useZarchRuntime({
    containerRef
  });
  const { error, isLoading, map, terrain } = useServerMapTerrain();

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
    runtimeRef.current.camX = (map.widthTiles * TILE) * 0.5;
    runtimeRef.current.camZ = (map.heightTiles * TILE) * 0.5;
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
      <div
        className="relative h-screen w-screen touch-none overflow-hidden bg-black text-white select-none"
        ref={containerRef}
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
            runtimeRef={runtimeRef}
            terrain={terrain}
          />
        </Canvas>

        <ZarchHud runtimeRef={runtimeRef} />
        <ZarchMinimap runtimeRef={runtimeRef} terrain={terrain} />
      </div>
      <ThemeTogglePortal />
    </>
  );
};
