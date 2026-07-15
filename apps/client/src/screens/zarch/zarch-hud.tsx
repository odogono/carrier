import { useEffect, useState, type RefObject } from 'react';

import {
  DEFAULT_BEST,
  DEFAULT_WAVE,
  SCORE_POLL_MS,
  TILE,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

import type { ZarchRuntimeState } from './use-zarch-runtime';

type ZarchHudProps = {
  editEnabled: boolean;
  onSelectMode: (mode: ZarchRuntimeState['mode']) => void;
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

type ViewCenterState = {
  height: number | null;
  mode: ZarchRuntimeState['mode'];
  shipAltitude: number | null;
  tankAvailability: ZarchRuntimeState['tankAvailability'];
  tankError: string | null;
  tankSpeed: number | null;
  tileX: number;
  tileZ: number;
  worldX: number;
  worldZ: number;
};

export const ZarchHud = ({
  editEnabled,
  onSelectMode,
  runtimeRef,
  terrain
}: ZarchHudProps) => {
  const [score, setScore] = useState(0);
  const [viewCenter, setViewCenter] = useState<ViewCenterState>({
    height: null,
    mode: 'navigation',
    shipAltitude: null,
    tankAvailability: 'loading',
    tankError: null,
    tankSpeed: null,
    tileX: 0,
    tileZ: 0,
    worldX: 0,
    worldZ: 0
  });

  useEffect(() => {
    const updateHud = () => {
      const runtime = runtimeRef.current;
      const focusX = runtime?.camera.x ?? 0;
      const focusZ = runtime?.camera.z ?? 0;
      const terrainHeight = runtime
        ? terrain.sampleHeightAtWorld(focusX, focusZ)
        : null;

      setScore(Math.round(runtimeRef.current?.score ?? 0));
      setViewCenter({
        height: terrainHeight,
        mode: runtime?.mode ?? 'navigation',
        shipAltitude:
          runtime?.mode === 'lander' && runtime.lander && terrainHeight !== null
            ? runtime.lander.y - terrainHeight
            : null,
        tankAvailability: runtime?.tankAvailability ?? 'loading',
        tankError: runtime?.tankError ?? null,
        tankSpeed:
          runtime?.mode === 'tank' && runtime.tank
            ? runtime.tank.speedMetersPerSecond
            : null,
        tileX: Math.floor(focusX / TILE),
        tileZ: Math.floor(focusZ / TILE),
        worldX: focusX,
        worldZ: focusZ
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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-4 border-b-2 border-[#c8a000] bg-[#111] px-3 py-1 pr-3 font-mono text-[13px] text-[#e8d060]">
        <span className="text-[#ff6060]">Score: {score}</span>
        <span>🚀</span>
        <span className="text-[15px] font-bold text-[#60b8ff]">Zarch</span>
        <span>💣</span>
        <span>Wave: {DEFAULT_WAVE}</span>
        <span>
          Mode:{' '}
          {viewCenter.mode === 'lander'
            ? 'Lander'
            : viewCenter.mode === 'tank'
              ? 'Tank'
              : 'Navigation'}
        </span>
        {editEnabled ? <span>Edit: On</span> : null}
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
        {viewCenter.shipAltitude !== null ? (
          <span>Altitude: {viewCenter.shipAltitude.toFixed(1)}</span>
        ) : null}
        {viewCenter.tankSpeed !== null ? (
          <span>Speed: {viewCenter.tankSpeed.toFixed(1)} m/s</span>
        ) : null}
        {viewCenter.tankError ? (
          <span className="text-[#ff6060]">{viewCenter.tankError}</span>
        ) : null}
        <span className="ml-auto">Best: {DEFAULT_BEST}</span>
        {(['navigation', 'lander', 'tank'] as const).map(mode => (
          <button
            className="pointer-events-auto rounded border border-[#c8a000] bg-[#2a2200] px-2 py-1 text-[#ffe58a] transition hover:bg-[#403400] disabled:opacity-40"
            disabled={
              editEnabled ||
              viewCenter.mode === mode ||
              (mode === 'tank' && viewCenter.tankAvailability !== 'ready')
            }
            key={mode}
            onClick={() => onSelectMode(mode)}
            onMouseDown={event => event.preventDefault()}
            type="button"
          >
            {mode === 'navigation'
              ? 'Navigation'
              : mode === 'lander'
                ? 'Lander'
                : 'Tank'}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute right-2 bottom-2 z-10 text-right font-mono text-[11px] leading-relaxed text-[#555]">
        {viewCenter.mode === 'lander' ? (
          <>
            <div>W/S - pitch</div>
            <div>A/D - yaw</div>
            <div>Space - thrust</div>
            <div>F - fire</div>
          </>
        ) : viewCenter.mode === 'tank' ? (
          <>
            <div>W/S - drive</div>
            <div>A/D - steer</div>
            <div>Pointer / F - aim and fire</div>
          </>
        ) : (
          <>
            <div>WASD / Arrow keys - move</div>
            <div>Mouse drag - rotate</div>
          </>
        )}
        <div>Scroll / Q / E - zoom</div>
      </div>
    </>
  );
};
