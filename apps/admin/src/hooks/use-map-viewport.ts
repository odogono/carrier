import { useCallback, useRef, useState } from "react";

import { isFiniteMap, type MapMetadata } from "carrier-contracts/types";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 32;
const DEFAULT_ZOOM = 4;
const ZOOM_FACTOR = 1.15;

export type Viewport = {
  centerTileX: number;
  centerTileZ: number;
  zoom: number;
};

export type ViewportChunkRange = {
  maxChunkX: number;
  maxChunkZ: number;
  minChunkX: number;
  minChunkZ: number;
};

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

const clampCenter = (
  centerX: number,
  centerZ: number,
  map: MapMetadata,
): [number, number] => {
  if (!isFiniteMap(map)) {
    return [centerX, centerZ];
  }
  return [
    Math.max(0, Math.min(map.extent.widthTiles, centerX)),
    Math.max(0, Math.min(map.extent.heightTiles, centerZ)),
  ];
};

export const getVisibleChunkRange = (
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  map: MapMetadata,
  extraRing = 1,
): ViewportChunkRange => {
  const halfW = canvasWidth / viewport.zoom / 2;
  const halfH = canvasHeight / viewport.zoom / 2;
  const chunkSize = map.resolution.chunkSizeTiles;

  if (isFiniteMap(map)) {
    const minTileX = Math.max(0, Math.floor(viewport.centerTileX - halfW));
    const maxTileX = Math.min(
      map.extent.widthTiles - 1,
      Math.ceil(viewport.centerTileX + halfW),
    );
    const minTileZ = Math.max(0, Math.floor(viewport.centerTileZ - halfH));
    const maxTileZ = Math.min(
      map.extent.heightTiles - 1,
      Math.ceil(viewport.centerTileZ + halfH),
    );

    const maxChunkX = Math.max(
      Math.ceil(map.extent.widthTiles / chunkSize) - 1,
      0,
    );
    const maxChunkZ = Math.max(
      Math.ceil(map.extent.heightTiles / chunkSize) - 1,
      0,
    );

    return {
      maxChunkX: Math.min(
        Math.floor(maxTileX / chunkSize) + extraRing,
        maxChunkX,
      ),
      maxChunkZ: Math.min(
        Math.floor(maxTileZ / chunkSize) + extraRing,
        maxChunkZ,
      ),
      minChunkX: Math.max(
        Math.floor(minTileX / chunkSize) - extraRing,
        0,
      ),
      minChunkZ: Math.max(
        Math.floor(minTileZ / chunkSize) - extraRing,
        0,
      ),
    };
  }

  // Infinite map: no bounds clamping
  const minTileX = Math.floor(viewport.centerTileX - halfW);
  const maxTileX = Math.ceil(viewport.centerTileX + halfW);
  const minTileZ = Math.floor(viewport.centerTileZ - halfH);
  const maxTileZ = Math.ceil(viewport.centerTileZ + halfH);

  return {
    maxChunkX: Math.floor(maxTileX / chunkSize) + extraRing,
    maxChunkZ: Math.floor(maxTileZ / chunkSize) + extraRing,
    minChunkX: Math.floor(minTileX / chunkSize) - extraRing,
    minChunkZ: Math.floor(minTileZ / chunkSize) - extraRing,
  };
};

const computeFitViewport = (
  map: MapMetadata,
  canvasWidth: number,
  canvasHeight?: number,
): Viewport => {
  if (isFiniteMap(map)) {
    const wZoom = canvasWidth > 0 ? canvasWidth / map.extent.widthTiles : 1;
    const hZoom = canvasHeight && canvasHeight > 0 ? canvasHeight / map.extent.heightTiles : wZoom;
    return {
      centerTileX: map.extent.widthTiles / 2,
      centerTileZ: map.extent.heightTiles / 2,
      zoom: clampZoom(Math.min(wZoom, hZoom)),
    };
  }

  return {
    centerTileX: 0,
    centerTileZ: 0,
    zoom: DEFAULT_ZOOM,
  };
};

export const useMapViewport = (
  map: MapMetadata,
  canvasWidth: number,
  canvasHeight: number,
) => {
  const [viewport, setViewport] = useState<Viewport>(() =>
    computeFitViewport(map, canvasWidth),
  );

  const dragRef = useRef<{
    startX: number;
    startZ: number;
    pointerX: number;
    pointerZ: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const endDrag = useCallback((target: EventTarget | null, pointerId: number) => {
    dragRef.current = null;
    setIsDragging(false);

    if (!(target instanceof Element) || !target.hasPointerCapture(pointerId)) {
      return;
    }

    target.releasePointerCapture(pointerId);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setViewport((v) => {
      dragRef.current = {
        pointerX: e.clientX,
        pointerZ: e.clientY,
        startX: v.centerTileX,
        startZ: v.centerTileZ,
      };
      return v;
    });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;

      setViewport((v) => {
        const dx = (e.clientX - drag.pointerX) / v.zoom;
        const dy = (e.clientY - drag.pointerZ) / v.zoom;
        const [cx, cz] = clampCenter(drag.startX - dx, drag.startZ - dy, map);
        return { ...v, centerTileX: cx, centerTileZ: cz };
      });
    },
    [map],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      setViewport((v) => {
        const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newZoom = clampZoom(v.zoom * factor);

        const cursorTileX =
          v.centerTileX + (offsetX - canvasWidth / 2) / v.zoom;
        const cursorTileZ =
          v.centerTileZ + (offsetY - canvasHeight / 2) / v.zoom;

        const [cx, cz] = clampCenter(
          cursorTileX - (offsetX - canvasWidth / 2) / newZoom,
          cursorTileZ - (offsetY - canvasHeight / 2) / newZoom,
          map,
        );

        return { centerTileX: cx, centerTileZ: cz, zoom: newZoom };
      });
    },
    [map, canvasWidth, canvasHeight],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const panAmount = () => {
        const tilesVisible = canvasWidth / viewport.zoom;
        return Math.max(1, tilesVisible * 0.25);
      };

      switch (e.key) {
        case "ArrowLeft": {
          e.preventDefault();
          setViewport((v) => {
            const [cx, cz] = clampCenter(
              v.centerTileX - panAmount(),
              v.centerTileZ,
              map,
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          setViewport((v) => {
            const [cx, cz] = clampCenter(
              v.centerTileX + panAmount(),
              v.centerTileZ,
              map,
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setViewport((v) => {
            const [cx, cz] = clampCenter(
              v.centerTileX,
              v.centerTileZ - panAmount(),
              map,
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          setViewport((v) => {
            const [cx, cz] = clampCenter(
              v.centerTileX,
              v.centerTileZ + panAmount(),
              map,
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case "+":
        case "=": {
          e.preventDefault();
          setViewport((v) => ({
            ...v,
            zoom: clampZoom(v.zoom * 1.3),
          }));
          break;
        }
        case "-": {
          e.preventDefault();
          setViewport((v) => ({
            ...v,
            zoom: clampZoom(v.zoom / 1.3),
          }));
          break;
        }
        case "Home":
        case "0": {
          e.preventDefault();
          setViewport(computeFitViewport(map, canvasWidth));
          break;
        }
      }
    },
    [map, canvasWidth, canvasHeight, viewport.zoom],
  );

  const fitToView = useCallback(() => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return;
    setViewport(computeFitViewport(map, canvasWidth, canvasHeight));
  }, [map, canvasWidth, canvasHeight]);

  const zoomIn = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: clampZoom(v.zoom * 1.3) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: clampZoom(v.zoom / 1.3) }));
  }, []);

  return {
    fitToView,
    isDragging,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerCancel,
    onPointerLeave,
    onPointerUp,
    onWheel,
    viewport,
    zoomIn,
    zoomOut,
  };
};
