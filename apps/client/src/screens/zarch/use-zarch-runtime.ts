import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef
} from 'react';

import { clampZoom } from '@/helpers/zarch-terrain';
import { useSceneConfigRef } from '@/hooks/use-scene-controls';

import type { ZarchBulletState } from './zarch-bullets';
import {
  isQuickTapGesture,
  type PointerTapCandidate,
  type PointerTapPayload
} from './zarch-pointer';

export type ZarchRuntimeMode = 'navigation' | 'ship';

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

export type ZarchShipState = {
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

export type ZarchRuntimeState = {
  bullets: ZarchBulletState[];
  camera: ZarchCameraState;
  mode: ZarchRuntimeMode;
  navigation: ZarchNavigationState;
  score: number;
  ship: ZarchShipState | null;
  shipFireCooldownSeconds: number;
};

export type ZarchInputState = {
  codes: Record<string, boolean>;
  dragActive: boolean;
  editBrushActive: boolean;
  editBrushStarted: boolean;
  hoverPointer: PointerTapPayload | null;
  keys: Record<string, boolean>;
  lastPointerX: number;
  pointerCandidate: PointerTapCandidate | null;
  pointerId: number | null;
  queuedEditTap: (PointerTapPayload & { shiftKey: boolean }) | null;
  queuedTap: PointerTapPayload | null;
  shipFireHeld: boolean;
};

type UseZarchRuntimeArgs = {
  containerElement: HTMLElement | null;
  editEnabled: boolean;
  editTool: 'height' | 'set-color' | 'set-type';
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
  editTool
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
    mode: 'navigation',
    navigation: {
      velX: 0,
      velZ: 0,
      x: 0,
      yaw: 0,
      z: 0
    },
    score: 0,
    ship: null,
    shipFireCooldownSeconds: 0
  });
  const inputRef = useRef<ZarchInputState>({
    codes: {},
    dragActive: false,
    editBrushActive: false,
    editBrushStarted: false,
    hoverPointer: null,
    keys: {},
    lastPointerX: 0,
    pointerCandidate: null,
    pointerId: null,
    queuedEditTap: null,
    queuedTap: null,
    shipFireHeld: false
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
        inputRef.current.shipFireHeld = true;
      }

      if (PREVENT_SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
      inputRef.current.keys[event.key] = false;
      inputRef.current.codes[event.code] = false;

      if (event.code === 'KeyF') {
        inputRef.current.shipFireHeld = false;
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
        inputRef.current.editBrushActive = true;
        inputRef.current.editBrushStarted = false;
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
  }, [configRef, editEnabled, editTool]);

  return {
    containerProps,
    enterShipMode: (shipState: ZarchShipState) => {
      runtimeRef.current.mode = 'ship';
      runtimeRef.current.bullets = [];
      runtimeRef.current.ship = shipState;
      runtimeRef.current.shipFireCooldownSeconds = 0;
      runtimeRef.current.camera.x = shipState.x;
      runtimeRef.current.camera.z = shipState.z;
    },
    exitShipMode: () => {
      const runtime = runtimeRef.current;

      runtime.mode = 'navigation';
      runtime.navigation.x = runtime.camera.x;
      runtime.navigation.z = runtime.camera.z;
      runtime.navigation.yaw = runtime.camera.yaw;
      runtime.navigation.velX = 0;
      runtime.navigation.velZ = 0;
      runtime.bullets = [];
      runtime.shipFireCooldownSeconds = 0;
      runtime.ship = null;
      inputRef.current.shipFireHeld = false;
    },
    inputRef,
    runtimeRef
  };
};
