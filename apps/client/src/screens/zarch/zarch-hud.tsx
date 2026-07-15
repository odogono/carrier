import { useEffect, useState, type RefObject } from 'react';

import {
  DEFAULT_BEST,
  DEFAULT_WAVE,
  SCORE_POLL_MS,
  TILE,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

import type { ZarchRuntimeState, ZarchTankState } from './use-zarch-runtime';

type ZarchHudProps = {
  editEnabled: boolean;
  onSelectMode: (mode: ZarchRuntimeState['mode']) => void;
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

type ViewCenterState = {
  activeShellCount: number | null;
  height: number | null;
  lastShellImpactSurface: ZarchTankState['lastShellImpactSurface'];
  mode: ZarchRuntimeState['mode'];
  shellImpactCount: number | null;
  shipAltitude: number | null;
  tankAvailability: ZarchRuntimeState['tankAvailability'];
  tankError: string | null;
  tankRuntimeDiagnostics: ZarchRuntimeState['tankRuntimeDiagnostics'];
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
    activeShellCount: null,
    height: null,
    lastShellImpactSurface: null,
    mode: 'navigation',
    shellImpactCount: null,
    shipAltitude: null,
    tankAvailability: 'loading',
    tankError: null,
    tankRuntimeDiagnostics: {
      cameraYaw: 0,
      colliderCenterTileX: null,
      colliderCenterTileZ: null,
      lastExitX: null,
      lastExitZ: null,
      shellBodyCount: 0,
      tankBodyCount: 0
    },
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
        activeShellCount:
          runtime?.mode === 'tank' && runtime.tank
            ? runtime.tank.activeShellCount
            : null,
        height: terrainHeight,
        lastShellImpactSurface:
          runtime?.mode === 'tank' && runtime.tank
            ? runtime.tank.lastShellImpactSurface
            : null,
        mode: runtime?.mode ?? 'navigation',
        shellImpactCount:
          runtime?.mode === 'tank' && runtime.tank
            ? runtime.tank.shellImpactCount
            : null,
        shipAltitude:
          runtime?.mode === 'lander' && runtime.lander && terrainHeight !== null
            ? runtime.lander.y - terrainHeight
            : null,
        tankAvailability: runtime?.tankAvailability ?? 'loading',
        tankError: runtime?.tankError ?? null,
        tankRuntimeDiagnostics: runtime?.tankRuntimeDiagnostics ?? {
          cameraYaw: 0,
          colliderCenterTileX: null,
          colliderCenterTileZ: null,
          lastExitX: null,
          lastExitZ: null,
          shellBodyCount: 0,
          tankBodyCount: 0
        },
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
        <span data-testid="zarch-hud-mode">
          Mode:{' '}
          {viewCenter.mode === 'lander'
            ? 'Lander'
            : viewCenter.mode === 'tank'
              ? 'Tank'
              : 'Navigation'}
        </span>
        {editEnabled ? <span>Edit: On</span> : null}
        <span data-testid="zarch-hud-centre">
          Centre: {viewCenter.worldX.toFixed(1)}, {viewCenter.worldZ.toFixed(1)}
        </span>
        <span>
          Tile: {viewCenter.tileX}, {viewCenter.tileZ}
        </span>
        <span data-testid="zarch-hud-height">
          Height:{' '}
          {viewCenter.height === null ? '--' : viewCenter.height.toFixed(1)}
        </span>
        {viewCenter.shipAltitude !== null ? (
          <span>Altitude: {viewCenter.shipAltitude.toFixed(1)}</span>
        ) : null}
        {viewCenter.tankSpeed !== null ? (
          <span data-testid="zarch-hud-tank-speed">
            Speed: {viewCenter.tankSpeed.toFixed(1)} m/s
          </span>
        ) : null}
        {viewCenter.activeShellCount !== null ? (
          <span data-testid="zarch-hud-shell-count">
            Shells: {viewCenter.activeShellCount}
          </span>
        ) : null}
        {viewCenter.shellImpactCount !== null ? (
          <span
            aria-hidden="true"
            className="hidden"
            data-testid="zarch-hud-shell-impact"
          >
            Impacts: {viewCenter.shellImpactCount}; Last:{' '}
            {viewCenter.lastShellImpactSurface ?? 'none'}
          </span>
        ) : null}
        {viewCenter.tankError ? (
          <span className="text-[#ff6060]">{viewCenter.tankError}</span>
        ) : null}
        <span
          aria-hidden="true"
          className="hidden"
          data-testid="zarch-hud-tank-runtime-diagnostics"
        >
          Camera yaw: {viewCenter.tankRuntimeDiagnostics.cameraYaw}; Collider
          tile: {viewCenter.tankRuntimeDiagnostics.colliderCenterTileX ?? '--'},
          {viewCenter.tankRuntimeDiagnostics.colliderCenterTileZ ?? '--'}; Tank
          bodies: {viewCenter.tankRuntimeDiagnostics.tankBodyCount}; Shell
          bodies: {viewCenter.tankRuntimeDiagnostics.shellBodyCount}; Exit:{' '}
          {viewCenter.tankRuntimeDiagnostics.lastExitX ?? '--'},
          {viewCenter.tankRuntimeDiagnostics.lastExitZ ?? '--'}
        </span>
        <span className="ml-auto">Best: {DEFAULT_BEST}</span>
        {(['navigation', 'lander', 'tank'] as const).map(mode => (
          <button
            className="pointer-events-auto rounded border border-[#c8a000] bg-[#2a2200] px-2 py-1 text-[#ffe58a] transition hover:bg-[#403400] disabled:opacity-40"
            data-testid={`zarch-mode-${mode}`}
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
