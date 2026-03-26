import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef
} from 'react';

import { clampZoom } from '@/helpers/zarch-terrain';
import { useSceneConfigRef } from '@/hooks/use-scene-controls';

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
  camera: ZarchCameraState;
  mode: ZarchRuntimeMode;
  navigation: ZarchNavigationState;
  score: number;
  ship: ZarchShipState | null;
};

export type ZarchInputState = {
  codes: Record<string, boolean>;
  dragActive: boolean;
  keys: Record<string, boolean>;
  lastPointerX: number;
  pointerCandidate: PointerTapCandidate | null;
  pointerId: number | null;
  queuedTap: PointerTapPayload | null;
};

type UseZarchRuntimeArgs = {
  containerElement: HTMLElement | null;
};

const PREVENT_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' '
]);

export const useZarchRuntime = ({
  containerElement
}: UseZarchRuntimeArgs) => {
  const configRef = useSceneConfigRef();
  const runtimeRef = useRef<ZarchRuntimeState>({
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
    ship: null
  });
  const inputRef = useRef<ZarchInputState>({
    codes: {},
    dragActive: false,
    keys: {},
    lastPointerX: 0,
    pointerCandidate: null,
    pointerId: null,
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

      if (PREVENT_SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
      inputRef.current.keys[event.key] = false;
      inputRef.current.codes[event.code] = false;
    };

    const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
      if (
        runtimeRef.current.mode !== 'navigation' ||
        !event.isPrimary ||
        (event.pointerType === 'mouse' && event.button !== 0) ||
        (event.target as HTMLElement | null)?.closest('button')
      ) {
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
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp
    };
  }, [configRef]);

  return {
    containerProps,
    enterShipMode: (shipState: ZarchShipState) => {
      runtimeRef.current.mode = 'ship';
      runtimeRef.current.ship = shipState;
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
      runtime.ship = null;
    },
    inputRef,
    runtimeRef
  };
};
