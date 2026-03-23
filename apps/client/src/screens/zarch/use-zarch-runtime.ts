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

export type ZarchRuntimeState = {
  camX: number;
  camYaw: number;
  camZ: number;
  camZoom: number;
  camZoomTarget: number;
  score: number;
  velX: number;
  velZ: number;
};

export type ZarchInputState = {
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
    camX: 0,
    camYaw: 0,
    camZ: 0,
    camZoom: 1,
    camZoomTarget: 1,
    score: 0,
    velX: 0,
    velZ: 0
  });
  const inputRef = useRef<ZarchInputState>({
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
      runtimeRef.current.camZoomTarget = clampZoom(
        runtimeRef.current.camZoomTarget + event.deltaY * 0.001,
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

      if (PREVENT_SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
      inputRef.current.keys[event.key] = false;
    };

    const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
      if (
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
        inputRef.current.pointerId !== event.pointerId
      ) {
        return;
      }

      runtimeRef.current.camYaw -=
        (event.clientX - inputRef.current.lastPointerX) * 0.005;
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
    inputRef,
    runtimeRef
  };
};
