import { useCallback, useRef, useState } from 'react';

/**
 * Tracks element width/height via ResizeObserver. Uses a callback ref so the
 * first measure runs when the node is attached (avoids layout-before-paint 0×0
 * reads that skip mounting canvas/SVG in some environments).
 */
export const useElementSize = () => {
  const [size, setSize] = useState({ height: 0, width: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((element: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!element) {
      setSize({ height: 0, width: 0 });
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        height: Math.round(rect.height),
        width: Math.round(rect.width)
      });
    };

    measure();
    requestAnimationFrame(measure);

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  return [ref, size] as const;
};
