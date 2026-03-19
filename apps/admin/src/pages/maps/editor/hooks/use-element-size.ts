import { useCallback, useEffect, useState, type RefObject } from "react";

export const useElementSize = (ref: RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState({ height: 0, width: 0 });

  const measure = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setSize((previous) => {
      const next = {
        height: Math.floor(rect.height),
        width: Math.floor(rect.width),
      };

      if (previous.height === next.height && previous.width === next.width) {
        return previous;
      }

      return next;
    });
  }, [ref]);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [measure, ref]);

  return size;
};
