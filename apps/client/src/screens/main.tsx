import { useEffect, useMemo, useRef } from 'react';

import { BasicShadowMap } from 'three';
import { Canvas } from '@react-three/fiber';

import { createLog } from 'odgn-ts-helpers/log';

import { ThemeTogglePortal } from '@/components/theme/toggle-portal';
import { connectApi } from '@/helpers/api-link';
import { createZarchTerrain } from '@/helpers/zarch-terrain';

import { useZarchRuntime } from './zarch/use-zarch-runtime';
import { ZarchHud } from './zarch/zarch-hud';
import { ZarchMinimap } from './zarch/zarch-minimap';
import { ZarchScene } from './zarch/zarch-scene';

const log = createLog('Main');

export const Main = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terrain = useMemo(() => createZarchTerrain(), []);
  const { inputRef, runtimeRef } = useZarchRuntime({
    containerRef
  });

  useEffect(() => {
    log.info('Carrier');

    void connectApi();
  }, []);

  return (
    <>
      <div
        className="relative h-screen w-screen touch-none overflow-hidden bg-black text-white select-none"
        ref={containerRef}
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
