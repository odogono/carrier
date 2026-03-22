import {
  isFiniteMap,
  type MapMetadata,
  type WorldBounds,
  type WorldPoint
} from 'carrier-contracts/types';
import { useCallback, useRef, useState } from 'react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 32;
export const DEFAULT_ZOOM = 4;
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

export type TileBounds = {
  maxTileX: number;
  maxTileZ: number;
  minTileX: number;
  minTileZ: number;
};

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

export const worldToTilePoint = (
  map: MapMetadata,
  point: Pick<WorldPoint, 'x' | 'z'>
): WorldPoint => ({
  x: point.x / map.resolution.metersPerTile,
  z: point.z / map.resolution.metersPerTile
});

export const tileToWorldPoint = (
  map: MapMetadata,
  point: Pick<WorldPoint, 'x' | 'z'>
): WorldPoint => ({
  x: point.x * map.resolution.metersPerTile,
  z: point.z * map.resolution.metersPerTile
});

export const worldBoundsToTileBounds = (
  map: MapMetadata,
  bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
): TileBounds => ({
  maxTileX: bounds.maxX / map.resolution.metersPerTile,
  maxTileZ: bounds.maxZ / map.resolution.metersPerTile,
  minTileX: bounds.minX / map.resolution.metersPerTile,
  minTileZ: bounds.minZ / map.resolution.metersPerTile
});

export const tileBoundsToWorldBounds = (
  map: MapMetadata,
  bounds: TileBounds
): WorldBounds => ({
  maxX: bounds.maxTileX * map.resolution.metersPerTile,
  maxZ: bounds.maxTileZ * map.resolution.metersPerTile,
  minX: bounds.minTileX * map.resolution.metersPerTile,
  minZ: bounds.minTileZ * map.resolution.metersPerTile
});

export const screenToTilePoint = (
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  screenX: number,
  screenY: number
): WorldPoint => ({
  x: viewport.centerTileX + (screenX - canvasWidth / 2) / viewport.zoom,
  z: viewport.centerTileZ + (screenY - canvasHeight / 2) / viewport.zoom
});

export const tileToScreenPoint = (
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  tileX: number,
  tileZ: number
): WorldPoint => ({
  x: canvasWidth / 2 + (tileX - viewport.centerTileX) * viewport.zoom,
  z: canvasHeight / 2 + (tileZ - viewport.centerTileZ) * viewport.zoom
});

const clampCenter = (
  centerX: number,
  centerZ: number,
  map: MapMetadata
): [number, number] => {
  if (!isFiniteMap(map)) {
    return [centerX, centerZ];
  }
  return [
    Math.max(0, Math.min(map.extent.widthTiles, centerX)),
    Math.max(0, Math.min(map.extent.heightTiles, centerZ))
  ];
};

export const getViewportTileBounds = (
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number
): TileBounds => {
  const halfW = canvasWidth / viewport.zoom / 2;
  const halfH = canvasHeight / viewport.zoom / 2;

  return {
    maxTileX: viewport.centerTileX + halfW,
    maxTileZ: viewport.centerTileZ + halfH,
    minTileX: viewport.centerTileX - halfW,
    minTileZ: viewport.centerTileZ - halfH
  };
};

export const getViewportWorldBounds = (
  map: MapMetadata,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number
): WorldBounds =>
  tileBoundsToWorldBounds(
    map,
    getViewportTileBounds(viewport, canvasWidth, canvasHeight)
  );

export const getVisibleChunkRange = (
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  map: MapMetadata,
  extraRing = 1
): ViewportChunkRange => {
  const halfW = canvasWidth / viewport.zoom / 2;
  const halfH = canvasHeight / viewport.zoom / 2;
  const chunkSize = map.resolution.chunkSizeTiles;

  if (isFiniteMap(map)) {
    const minTileX = Math.max(0, Math.floor(viewport.centerTileX - halfW));
    const maxTileX = Math.min(
      map.extent.widthTiles - 1,
      Math.ceil(viewport.centerTileX + halfW)
    );
    const minTileZ = Math.max(0, Math.floor(viewport.centerTileZ - halfH));
    const maxTileZ = Math.min(
      map.extent.heightTiles - 1,
      Math.ceil(viewport.centerTileZ + halfH)
    );

    const maxChunkX = Math.max(
      Math.ceil(map.extent.widthTiles / chunkSize) - 1,
      0
    );
    const maxChunkZ = Math.max(
      Math.ceil(map.extent.heightTiles / chunkSize) - 1,
      0
    );

    return {
      maxChunkX: Math.min(
        Math.floor(maxTileX / chunkSize) + extraRing,
        maxChunkX
      ),
      maxChunkZ: Math.min(
        Math.floor(maxTileZ / chunkSize) + extraRing,
        maxChunkZ
      ),
      minChunkX: Math.max(Math.floor(minTileX / chunkSize) - extraRing, 0),
      minChunkZ: Math.max(Math.floor(minTileZ / chunkSize) - extraRing, 0)
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
    minChunkZ: Math.floor(minTileZ / chunkSize) - extraRing
  };
};

export const getDefaultViewport = (
  map: MapMetadata,
  canvasWidth: number,
  canvasHeight?: number
): Viewport => {
  if (isFiniteMap(map)) {
    const wZoom = canvasWidth > 0 ? canvasWidth / map.extent.widthTiles : 1;
    const hZoom =
      canvasHeight && canvasHeight > 0
        ? canvasHeight / map.extent.heightTiles
        : wZoom;
    return {
      centerTileX: map.extent.widthTiles / 2,
      centerTileZ: map.extent.heightTiles / 2,
      zoom: clampZoom(Math.min(wZoom, hZoom))
    };
  }

  return {
    centerTileX: 0,
    centerTileZ: 0,
    zoom: DEFAULT_ZOOM
  };
};

export const fitViewportToTileBounds = (
  map: MapMetadata,
  canvasWidth: number,
  canvasHeight: number,
  bounds: TileBounds,
  paddingTiles = 2
): Viewport => {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return getDefaultViewport(map, canvasWidth, canvasHeight);
  }

  const width = Math.max(bounds.maxTileX - bounds.minTileX, 1);
  const height = Math.max(bounds.maxTileZ - bounds.minTileZ, 1);
  const paddedWidth = width + paddingTiles * 2;
  const paddedHeight = height + paddingTiles * 2;

  return {
    centerTileX: (bounds.minTileX + bounds.maxTileX) / 2,
    centerTileZ: (bounds.minTileZ + bounds.maxTileZ) / 2,
    zoom: clampZoom(
      Math.min(canvasWidth / paddedWidth, canvasHeight / paddedHeight)
    )
  };
};

export const fitViewportToWorldBounds = (
  map: MapMetadata,
  canvasWidth: number,
  canvasHeight: number,
  bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>,
  paddingTiles = 2
): Viewport =>
  fitViewportToTileBounds(
    map,
    canvasWidth,
    canvasHeight,
    worldBoundsToTileBounds(map, bounds),
    paddingTiles
  );

export const useMapViewport = (
  map: MapMetadata,
  canvasWidth: number,
  canvasHeight: number
) => {
  const [viewport, setViewport] = useState<Viewport>(() =>
    getDefaultViewport(map, canvasWidth, canvasHeight)
  );

  const dragRef = useRef<{
    pointerX: number;
    pointerZ: number;
    startX: number;
    startZ: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const endDrag = useCallback(
    (target: EventTarget | null, pointerId: number) => {
      dragRef.current = null;
      setIsDragging(false);

      if (
        !(target instanceof Element) ||
        !target.hasPointerCapture(pointerId)
      ) {
        return;
      }

      target.releasePointerCapture(pointerId);
    },
    []
  );

  const onPointerDown = useCallback((e: React.PointerEvent<Element>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setViewport(v => {
      dragRef.current = {
        pointerX: e.clientX,
        pointerZ: e.clientY,
        startX: v.centerTileX,
        startZ: v.centerTileZ
      };
      return v;
    });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<Element>) => {
      const drag = dragRef.current;
      if (!drag) {return;}

      setViewport(v => {
        const dx = (e.clientX - drag.pointerX) / v.zoom;
        const dy = (e.clientY - drag.pointerZ) / v.zoom;
        const [cx, cz] = clampCenter(drag.startX - dx, drag.startZ - dy, map);
        return { ...v, centerTileX: cx, centerTileZ: cz };
      });
    },
    [map]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<Element>) => {
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<Element>) => {
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<Element>) => {
      if (!dragRef.current) {return;}
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<Element>) => {
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      setViewport(v => {
        const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newZoom = clampZoom(v.zoom * factor);

        const cursorTileX =
          v.centerTileX + (offsetX - canvasWidth / 2) / v.zoom;
        const cursorTileZ =
          v.centerTileZ + (offsetY - canvasHeight / 2) / v.zoom;

        const [cx, cz] = clampCenter(
          cursorTileX - (offsetX - canvasWidth / 2) / newZoom,
          cursorTileZ - (offsetY - canvasHeight / 2) / newZoom,
          map
        );

        return { centerTileX: cx, centerTileZ: cz, zoom: newZoom };
      });
    },
    [map, canvasWidth, canvasHeight]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<Element>) => {
      const panAmount = () => {
        const tilesVisible = canvasWidth / viewport.zoom;
        return Math.max(1, tilesVisible * 0.25);
      };

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          setViewport(v => {
            const [cx, cz] = clampCenter(
              v.centerTileX - panAmount(),
              v.centerTileZ,
              map
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          setViewport(v => {
            const [cx, cz] = clampCenter(
              v.centerTileX + panAmount(),
              v.centerTileZ,
              map
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setViewport(v => {
            const [cx, cz] = clampCenter(
              v.centerTileX,
              v.centerTileZ - panAmount(),
              map
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          setViewport(v => {
            const [cx, cz] = clampCenter(
              v.centerTileX,
              v.centerTileZ + panAmount(),
              map
            );
            return { ...v, centerTileX: cx, centerTileZ: cz };
          });
          break;
        }
        case '+':
        case '=': {
          e.preventDefault();
          setViewport(v => ({
            ...v,
            zoom: clampZoom(v.zoom * 1.3)
          }));
          break;
        }
        case '-': {
          e.preventDefault();
          setViewport(v => ({
            ...v,
            zoom: clampZoom(v.zoom / 1.3)
          }));
          break;
        }
        case 'Home':
        case '0': {
          e.preventDefault();
          setViewport(getDefaultViewport(map, canvasWidth, canvasHeight));
          break;
        }
      }
    },
    [map, canvasWidth, canvasHeight, viewport.zoom]
  );

  const fitToView = useCallback(() => {
    if (canvasWidth <= 0 || canvasHeight <= 0) {return;}
    setViewport(getDefaultViewport(map, canvasWidth, canvasHeight));
  }, [map, canvasWidth, canvasHeight]);

  const fitToWorldBounds = useCallback(
    (bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>) => {
      if (canvasWidth <= 0 || canvasHeight <= 0) {return;}
      setViewport(
        fitViewportToWorldBounds(map, canvasWidth, canvasHeight, bounds)
      );
    },
    [canvasHeight, canvasWidth, map]
  );

  const recenterOnWorldPoint = useCallback(
    (point: Pick<WorldPoint, 'x' | 'z'>) => {
      setViewport(v => {
        const tilePoint = worldToTilePoint(map, point);
        const [centerTileX, centerTileZ] = clampCenter(
          tilePoint.x,
          tilePoint.z,
          map
        );

        return {
          ...v,
          centerTileX,
          centerTileZ
        };
      });
    },
    [map]
  );

  const zoomIn = useCallback(() => {
    setViewport(v => ({ ...v, zoom: clampZoom(v.zoom * 1.3) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(v => ({ ...v, zoom: clampZoom(v.zoom / 1.3) }));
  }, []);

  return {
    fitToView,
    fitToWorldBounds,
    isDragging,
    onKeyDown,
    onPointerCancel,
    onPointerDown,
    onPointerLeave,
    onPointerMove,
    onPointerUp,
    onWheel,
    recenterOnWorldPoint,
    setViewport,
    viewport,
    zoomIn,
    zoomOut
  };
};
