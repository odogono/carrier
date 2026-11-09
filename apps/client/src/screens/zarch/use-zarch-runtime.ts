import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject
} from 'react';

import { clampZoom } from '@/helpers/zarch-terrain';
import { useSceneConfigRef } from '@/hooks/use-scene-controls';

import type { ZarchBulletState } from './zarch-bullets';
import type { TankShellImpactSurface } from './zarch-player-tank';
import {
  isQuickTapGesture,
  type PointerTapCandidate,
  type PointerTapPayload
} from './zarch-pointer';

export type ZarchRuntimeMode = 'lander' | 'navigation' | 'tank';

export type ZarchCameraState = {
  x: number;
  yaw: number;
  z: number;
  zoom: number;
  zoomTarget: number;
};

export type ZarchNavigationState = {
  velX: number;
  velZ: number;
  x: number;
  yaw: number;
  z: number;
};

export type ZarchLanderState = {
  landed: boolean;
  pitch: number;
  respawnDelaySeconds: number;
  respawnX: number;
  respawnY: number;
  respawnZ: number;
  spawnGraceSeconds: number;
  velX: number;
  velY: number;
  velZ: number;
  x: number;
  y: number;
  yaw: number;
  z: number;
};

/** @deprecated The gameplay mode is called Lander; retained for simulation APIs. */
export type ZarchShipState = ZarchLanderState;

export type ZarchTankState = {
  activeShellCount: number;
  lastShellImpactSurface: TankShellImpactSurface | null;
  quaternion: [number, number, number, number];
  shellImpactCount: number;
  speedMetersPerSecond: number;
  turretYaw: number;
  x: number;
  y: number;
  yaw: number;
  z: number;
};

export type ZarchTankRuntimeDiagnostics = {
  cameraYaw: number;
  colliderCenterTileX: number | null;
  colliderCenterTileZ: number | null;
  lastExitX: number | null;
  lastExitZ: number | null;
  shellBodyCount: number;
  tankBodyCount: number;
};

export type ZarchRuntimeState = {
  bullets: ZarchBulletState[];
  camera: ZarchCameraState;
  lander: ZarchLanderState | null;
  landerFireCooldownSeconds: number;
  mode: ZarchRuntimeMode;
  navigation: ZarchNavigationState;
  score: number;
  tank: ZarchTankState | null;
  tankAvailability: 'error' | 'loading' | 'ready';
  tankError: string | null;
  tankRuntimeDiagnostics: ZarchTankRuntimeDiagnostics;
};

export type ZarchInputState = {
  codes: Record<string, boolean>;
  dragActive: boolean;
  editBrushActive: boolean;
  editBrushStarted: boolean;
  fireHeld: boolean;
  hoverPointer: PointerTapPayload | null;
  keys: Record<string, boolean>;
  lastPointerX: number;
  pointerCandidate: PointerTapCandidate | null;
  pointerId: number | null;
  queuedEditTap: (PointerTapPayload & { shiftKey: boolean }) | null;
  queuedTap: PointerTapPayload | null;
};

type EditorMode = 'terrain' | 'entities';

type EntityEditCallbacks = {
  catalogOpen: boolean;
  onClearSelection: () => void;
  onCloseCatalog: () => void;
  onDeleteEntity: () => void;
  onRotateEntity: (direction: 'cw' | 'ccw') => void;
  selectedEntityId: string | null;
};

type UseZarchRuntimeArgs = {
  containerElement: HTMLElement | null;
  editEnabled: boolean;
  editorMode: EditorMode;
  entityEditCallbacksRef: RefObject<EntityEditCallbacks | null>;
};

const PREVENT_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' '
]);

export const useZarchRuntime = ({
  containerElement,
  editEnabled,
  editorMode,
  entityEditCallbacksRef
}: UseZarchRuntimeArgs) => {
  const configRef = useSceneConfigRef();
  const runtimeRef = useRef<ZarchRuntimeState>({
    bullets: [],
    camera: {
      x: 0,
      yaw: 0,
      z: 0,
      zoom: 1,
      zoomTarget: 1
    },
    lander: null,
    landerFireCooldownSeconds: 0,
    mode: 'navigation',
    navigation: {
      velX: 0,
      velZ: 0,
      x: 0,
      yaw: 0,
      z: 0
    },
    score: 0,
    tank: null,
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
    }
  });
  const inputRef = useRef<ZarchInputState>({
    codes: {},
    dragActive: false,
    editBrushActive: false,
    editBrushStarted: false,
    fireHeld: false,
    hoverPointer: null,
    keys: {},
    lastPointerX: 0,
    pointerCandidate: null,
    pointerId: null,
    queuedEditTap: null,
    queuedTap: null
  });

  useEffect(() => {
    const container = containerElement;

    if (!container) {
      return;
    }

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const config = configRef.current;
      runtimeRef.current.camera.zoomTarget = clampZoom(
        runtimeRef.current.camera.zoomTarget + event.deltaY * 0.001,
        config.zoomMin,
        config.zoomMax
      );
    };

    container.addEventListener('wheel', handleWheel, {
      capture: true,
      passive: false
    });

    return () => {
      container.removeEventListener('wheel', handleWheel, true);
    };
  }, [configRef, containerElement]);

  const containerProps = useMemo(() => {
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      inputRef.current.keys[event.key] = true;
      inputRef.current.codes[event.code] = true;

      if (event.code === 'KeyF') {
        inputRef.current.fireHeld = true;
      }

      if (PREVENT_SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
      }

      // Entity mode keyboard shortcuts
      if (editEnabled && editorMode === 'entities') {
        const callbacks = entityEditCallbacksRef.current;
        if (callbacks) {
          if (event.code === 'Escape') {
            if (callbacks.catalogOpen) {
              callbacks.onCloseCatalog();
            } else if (callbacks.selectedEntityId) {
              callbacks.onClearSelection();
            }
            event.preventDefault();
          } else if (event.code === 'KeyR' && callbacks.selectedEntityId) {
            callbacks.onRotateEntity(event.shiftKey ? 'ccw' : 'cw');
            event.preventDefault();
          } else if (
            (event.code === 'Delete' || event.code === 'Backspace') &&
            callbacks.selectedEntityId
          ) {
            callbacks.onDeleteEntity();
            event.preventDefault();
          }
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
      inputRef.current.keys[event.key] = false;
      inputRef.current.codes[event.code] = false;

      if (event.code === 'KeyF') {
        inputRef.current.fireHeld = false;
      }
    };

    const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
      if (
        !event.isPrimary ||
        (event.pointerType === 'mouse' && event.button !== 0) ||
        (event.target as HTMLElement | null)?.closest('button,select,option')
      ) {
        return;
      }

      if (editEnabled) {
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        inputRef.current.editBrushActive = true;
        inputRef.current.editBrushStarted = false;
        inputRef.current.lastPointerX = event.clientX;
        inputRef.current.pointerCandidate = {
          clientX: event.clientX,
          clientY: event.clientY,
          timeStamp: event.timeStamp
        };
        inputRef.current.pointerId = event.pointerId;
        inputRef.current.hoverPointer = {
          clientX: event.clientX,
          clientY: event.clientY
        };
        return;
      }

      if (runtimeRef.current.mode === 'tank') {
        event.currentTarget.focus();
        inputRef.current.fireHeld = true;
        inputRef.current.hoverPointer = {
          clientX: event.clientX,
          clientY: event.clientY
        };
        return;
      }

      if (runtimeRef.current.mode !== 'navigation') {
        return;
      }

      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      inputRef.current.dragActive = true;
      inputRef.current.lastPointerX = event.clientX;
      inputRef.current.pointerCandidate = {
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp
      };
      inputRef.current.pointerId = event.pointerId;
    };

    const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
      if (editEnabled) {
        inputRef.current.hoverPointer = {
          clientX: event.clientX,
          clientY: event.clientY
        };
        return;
      }

      if (runtimeRef.current.mode === 'tank') {
        inputRef.current.hoverPointer = {
          clientX: event.clientX,
          clientY: event.clientY
        };
        return;
      }

      if (
        !inputRef.current.dragActive ||
        runtimeRef.current.mode !== 'navigation' ||
        inputRef.current.pointerId !== event.pointerId
      ) {
        return;
      }

      runtimeRef.current.navigation.yaw -=
        (event.clientX - inputRef.current.lastPointerX) * 0.005;
      runtimeRef.current.camera.yaw = runtimeRef.current.navigation.yaw;
      inputRef.current.lastPointerX = event.clientX;
    };

    const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
      if (runtimeRef.current.mode === 'tank') {
        inputRef.current.fireHeld = false;
        inputRef.current.hoverPointer = {
          clientX: event.clientX,
          clientY: event.clientY
        };
        return;
      }
      if (
        editEnabled &&
        event.isPrimary &&
        (event.pointerType !== 'mouse' || event.button === 0) &&
        !(event.target as HTMLElement | null)?.closest('button,select,option')
      ) {
        inputRef.current.editBrushActive = false;
        inputRef.current.editBrushStarted = false;
        inputRef.current.hoverPointer = {
          clientX: event.clientX,
          clientY: event.clientY
        };

        if (
          inputRef.current.pointerId === event.pointerId &&
          inputRef.current.pointerCandidate &&
          isQuickTapGesture(
            inputRef.current.pointerCandidate,
            {
              clientX: event.clientX,
              clientY: event.clientY
            },
            event.timeStamp,
            configRef.current.particleTapMaxDurationMs,
            configRef.current.particleTapMaxMovementPx
          )
        ) {
          inputRef.current.queuedEditTap = {
            clientX: event.clientX,
            clientY: event.clientY,
            shiftKey: event.shiftKey
          };
        }

        inputRef.current.pointerCandidate = null;
        inputRef.current.pointerId = null;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        return;
      }

      if (
        event.isPrimary &&
        (event.pointerType !== 'mouse' || event.button === 0) &&
        inputRef.current.pointerId === event.pointerId &&
        inputRef.current.pointerCandidate &&
        isQuickTapGesture(
          inputRef.current.pointerCandidate,
          {
            clientX: event.clientX,
            clientY: event.clientY
          },
          event.timeStamp,
          configRef.current.particleTapMaxDurationMs,
          configRef.current.particleTapMaxMovementPx
        )
      ) {
        inputRef.current.queuedTap = {
          clientX: event.clientX,
          clientY: event.clientY
        };
      }

      if (
        inputRef.current.pointerId !== null &&
        event.currentTarget.hasPointerCapture(inputRef.current.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(inputRef.current.pointerId);
      }

      inputRef.current.dragActive = false;
      inputRef.current.pointerCandidate = null;
      inputRef.current.pointerId = null;
    };

    return {
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onPointerCancel: handlePointerUp,
      onPointerDown: handlePointerDown,
      onPointerLeave: () => {
        if (editEnabled) {
          if (inputRef.current.editBrushActive) {
            return;
          }

          inputRef.current.editBrushActive = false;
          inputRef.current.editBrushStarted = false;
          inputRef.current.hoverPointer = null;
          inputRef.current.pointerCandidate = null;
          inputRef.current.pointerId = null;
        }
      },
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp
    };
  }, [configRef, editEnabled, editorMode, entityEditCallbacksRef]);

  return {
    containerProps,
    enterLanderMode: (landerState: ZarchLanderState) => {
      runtimeRef.current.mode = 'lander';
      runtimeRef.current.bullets = [];
      runtimeRef.current.lander = landerState;
      runtimeRef.current.landerFireCooldownSeconds = 0;
      runtimeRef.current.tank = null;
      runtimeRef.current.camera.x = landerState.x;
      runtimeRef.current.camera.z = landerState.z;
    },
    enterNavigationMode: () => {
      const runtime = runtimeRef.current;
      const leavingTank = runtime.mode === 'tank';

      if (leavingTank) {
        runtime.tankRuntimeDiagnostics.lastExitX = runtime.navigation.x;
        runtime.tankRuntimeDiagnostics.lastExitZ = runtime.navigation.z;
      }

      runtime.mode = 'navigation';
      if (!leavingTank) {
        runtime.navigation.x = runtime.camera.x;
        runtime.navigation.z = runtime.camera.z;
        runtime.navigation.yaw = runtime.camera.yaw;
      }
      runtime.navigation.velX = 0;
      runtime.navigation.velZ = 0;
      runtime.bullets = [];
      runtime.landerFireCooldownSeconds = 0;
      runtime.lander = null;
      runtime.tank = null;
      inputRef.current.fireHeld = false;
    },
    enterTankMode: (tankState: ZarchTankState) => {
      runtimeRef.current.mode = 'tank';
      runtimeRef.current.bullets = [];
      runtimeRef.current.lander = null;
      runtimeRef.current.tank = tankState;
    },
    inputRef,
    runtimeRef
  };
};
