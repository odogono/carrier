import { type RefObject, useEffect, useState } from 'react';

import {
  DEFAULT_BEST,
  DEFAULT_WAVE,
  SCORE_POLL_MS,
  TILE,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

import type { ZarchRuntimeState } from './use-zarch-runtime';

type ZarchHudProps = {
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

type ViewCenterState = {
  height: number | null;
  tileX: number;
  tileZ: number;
  worldX: number;
  worldZ: number;
};

export const ZarchHud = ({ runtimeRef, terrain }: ZarchHudProps) => {
  const [score, setScore] = useState(0);
  const [viewCenter, setViewCenter] = useState<ViewCenterState>({
    height: null,
    tileX: 0,
    tileZ: 0,
    worldX: 0,
    worldZ: 0
  });

  useEffect(() => {
    const updateHud = () => {
      const runtime = runtimeRef.current;

      setScore(Math.round(runtimeRef.current?.score ?? 0));
      setViewCenter({
        height:
          runtime
            ? terrain.sampleHeight(
                Math.round(runtime.camX / TILE),
                Math.round(runtime.camZ / TILE)
              )
            : null,
        tileX: runtime ? Math.floor(runtime.camX / TILE) : 0,
        tileZ: runtime ? Math.floor(runtime.camZ / TILE) : 0,
        worldX: runtime?.camX ?? 0,
        worldZ: runtime?.camZ ?? 0
      });
    };

    updateHud();

    const intervalId = window.setInterval(updateHud, SCORE_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runtimeRef, terrain]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-6 border-b-2 border-[#c8a000] bg-[#111] px-3 py-1 pr-20 font-mono text-[13px] text-[#e8d060]">
        <span className="text-[#ff6060]">Score: {score}</span>
        <span>🚀</span>
        <span className="text-[15px] font-bold text-[#60b8ff]">Zarch</span>
        <span>💣</span>
        <span>Wave: {DEFAULT_WAVE}</span>
        <span>
          Centre: {viewCenter.worldX.toFixed(1)}, {viewCenter.worldZ.toFixed(1)}
        </span>
        <span>
          Tile: {viewCenter.tileX}, {viewCenter.tileZ}
        </span>
        <span>
          Height:{' '}
          {viewCenter.height === null ? '--' : viewCenter.height.toFixed(1)}
        </span>
        <span className="ml-auto">Best: {DEFAULT_BEST}</span>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-2 z-10 text-right font-mono text-[11px] leading-relaxed text-[#555]">
        <div>WASD / Arrow keys - move</div>
        <div>Mouse drag - rotate</div>
        <div>Scroll / Q / E - zoom</div>
      </div>
    </>
  );
};
