import { type RefObject, useEffect, useRef } from 'react';

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
    keys: {},
    lastPointerX: 0
  });

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      inputRef.current.keys[event.key] = true;

      if (PREVENT_SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      inputRef.current.keys[event.key] = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      runtimeRef.current.camZoomTarget = clampZoom(
        runtimeRef.current.camZoomTarget + event.deltaY * 0.001
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest('button')) {
        return;
      }

      inputRef.current.dragActive = true;
      inputRef.current.lastPointerX = event.clientX;
    };

    const handlePointerUp = () => {
      inputRef.current.dragActive = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!inputRef.current.dragActive) {
        return;
      }

      runtimeRef.current.camYaw -=
        (event.clientX - inputRef.current.lastPointerX) * 0.005;
      inputRef.current.lastPointerX = event.clientX;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef]);

  return {
    inputRef,
    runtimeRef
  };
};
