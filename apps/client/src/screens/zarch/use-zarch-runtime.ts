import { type KeyboardEvent, type PointerEvent, type RefObject, type WheelEvent, useMemo, useRef } from 'react';

import { clampZoom } from '@/helpers/zarch-terrain';

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
  pointerId: number | null;
  keys: Record<string, boolean>;
  lastPointerX: number;
};

type UseZarchRuntimeArgs = {
  containerRef: RefObject<HTMLElement | null>;
};

const PREVENT_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' '
]);

export const useZarchRuntime = ({ containerRef }: UseZarchRuntimeArgs) => {
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
    pointerId: null,
    keys: {},
    lastPointerX: 0
  });

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
      if ((event.target as HTMLElement | null)?.closest('button')) {
        return;
      }

      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      inputRef.current.dragActive = true;
      inputRef.current.lastPointerX = event.clientX;
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
        inputRef.current.pointerId !== null &&
        event.currentTarget.hasPointerCapture(inputRef.current.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(inputRef.current.pointerId);
      }

      inputRef.current.dragActive = false;
      inputRef.current.pointerId = null;
    };

    const handleWheel = (event: WheelEvent<HTMLElement>) => {
      event.preventDefault();
      runtimeRef.current.camZoomTarget = clampZoom(
        runtimeRef.current.camZoomTarget + event.deltaY * 0.001
      );
    };

    return {
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onPointerCancel: handlePointerUp,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onWheel: handleWheel
    };
  }, []);

  return {
    containerProps,
    inputRef,
    runtimeRef
  };
};
