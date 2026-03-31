import { type RefObject, useEffect, useRef } from 'react';

import {
  MINIMAP_POLL_MS,
  TILE,
  getLandscapeViewMetrics,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';
import { useSceneConfigValue } from '@/hooks/use-scene-controls';

import type { ZarchRuntimeState } from './use-zarch-runtime';

type ZarchMinimapProps = {
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

export const wrapWorldCoordinate = (value: number, size: number) =>
  size <= 0 ? 0 : ((value % size) + size) % size;

const MINIMAP_DRAW_SIZE = 140;
const MINIMAP_MIN_VIEW_SIZE_PX = 6;

type MinimapPoint = {
  x: number;
  y: number;
};

type MinimapRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const wrapSegment = (
  start: number,
  length: number,
  total: number,
  shouldWrap: boolean
) => {
  if (total <= 0) {
    return [];
  }

  if (!shouldWrap) {
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(total, start + length);

    if (clampedEnd <= clampedStart) {
      return [];
    }

    return [
      {
        length: clampedEnd - clampedStart,
        start: clampedStart
      }
    ];
  }

  if (length >= total) {
    return [
      {
        length: total,
        start: 0
      }
    ];
  }

  const wrappedStart = wrapWorldCoordinate(start, total);
  const end = wrappedStart + length;

  if (end <= total) {
    return [
      {
        length,
        start: wrappedStart
      }
    ];
  }

  return [
    {
      length: total - wrappedStart,
      start: wrappedStart
    },
    {
      length: end - total,
      start: 0
    }
  ];
};

export const worldToMinimapPoint = ({
  drawSize,
  heightWorld,
  widthWorld,
  worldX,
  worldZ
}: {
  drawSize: number;
  heightWorld: number;
  widthWorld: number;
  worldX: number;
  worldZ: number;
}): MinimapPoint => {
  const w = Math.max(widthWorld, TILE);
  const h = Math.max(heightWorld, TILE);
  const wrappedX = wrapWorldCoordinate(worldX, w);
  const wrappedZ = wrapWorldCoordinate(worldZ, h);

  return {
    x: drawSize - (wrappedX / w) * drawSize,
    y: drawSize - (wrappedZ / h) * drawSize
  };
};

export const getMinimapViewportRectangles = ({
  cameraX,
  cameraZ,
  drawSize,
  heightWorld,
  minSizePx,
  viewSpanWorldX,
  viewSpanWorldZ,
  widthWorld,
  wrapX,
  wrapZ
}: {
  cameraX: number;
  cameraZ: number;
  drawSize: number;
  heightWorld: number;
  minSizePx: number;
  viewSpanWorldX: number;
  viewSpanWorldZ: number;
  widthWorld: number;
  wrapX: boolean;
  wrapZ: boolean;
}): MinimapRect[] => {
  const safeWidthWorld = Math.max(widthWorld, TILE);
  const safeHeightWorld = Math.max(heightWorld, TILE);
  const widthPx = Math.min(
    drawSize,
    Math.max((viewSpanWorldX / safeWidthWorld) * drawSize, minSizePx)
  );
  const heightPx = Math.min(
    drawSize,
    Math.max((viewSpanWorldZ / safeHeightWorld) * drawSize, minSizePx)
  );
  const center = worldToMinimapPoint({
    drawSize,
    heightWorld: safeHeightWorld,
    widthWorld: safeWidthWorld,
    worldX: cameraX,
    worldZ: cameraZ
  });
  const xSegments = wrapSegment(
    center.x - widthPx * 0.5,
    widthPx,
    drawSize,
    wrapX
  );
  const ySegments = wrapSegment(
    center.y - heightPx * 0.5,
    heightPx,
    drawSize,
    wrapZ
  );

  return xSegments.flatMap(xSegment =>
    ySegments.map(ySegment => ({
      height: ySegment.length,
      width: xSegment.length,
      x: xSegment.start,
      y: ySegment.start
    }))
  );
};

export const ZarchMinimap = ({ runtimeRef, terrain }: ZarchMinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landscapeClipScale = useSceneConfigValue('landscapeClipScale');
  const viewRadiusBase = useSceneConfigValue('viewRadiusBase');
  const landscapeClipScaleRef = useRef(landscapeClipScale);
  const viewRadiusBaseRef = useRef(viewRadiusBase);
  landscapeClipScaleRef.current = landscapeClipScale;
  viewRadiusBaseRef.current = viewRadiusBase;

  useEffect(() => {
    const { heightTiles, widthTiles } = terrain;
    if (widthTiles === null || heightTiles === null) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const backgroundCanvas = document.createElement('canvas');
    let animationFrameId = 0;
    let lastBackgroundRefresh = -Infinity;

    canvas.width = MINIMAP_DRAW_SIZE;
    canvas.height = MINIMAP_DRAW_SIZE;
    backgroundCanvas.width = MINIMAP_DRAW_SIZE;
    backgroundCanvas.height = MINIMAP_DRAW_SIZE;

    const context = canvas.getContext('2d');
    const backgroundContext = backgroundCanvas.getContext('2d');

    if (!context || !backgroundContext) {
      return;
    }

    const renderBackground = () => {
      const image = backgroundContext.createImageData(
        MINIMAP_DRAW_SIZE,
        MINIMAP_DRAW_SIZE
      );

      for (let pixelY = 0; pixelY < MINIMAP_DRAW_SIZE; pixelY += 1) {
        const gz = Math.min(
          Math.floor(
            ((MINIMAP_DRAW_SIZE - 1 - pixelY) / MINIMAP_DRAW_SIZE) * heightTiles
          ),
          heightTiles - 1
        );

        for (let pixelX = 0; pixelX < MINIMAP_DRAW_SIZE; pixelX += 1) {
          const gx = Math.min(
            Math.floor(
              ((MINIMAP_DRAW_SIZE - 1 - pixelX) / MINIMAP_DRAW_SIZE) *
                widthTiles
            ),
            widthTiles - 1
          );
          const elevation = terrain.getTileAverageHeight(gx, gz);
          const index = (pixelY * MINIMAP_DRAW_SIZE + pixelX) * 4;

          if (elevation === null) {
            image.data[index] = 8;
            image.data[index + 1] = 19;
            image.data[index + 2] = 31;
          } else if (elevation < -10) {
            image.data[index] = 30;
            image.data[index + 1] = 80;
            image.data[index + 2] = 160;
          } else {
            const tint = Math.max(0, Math.min((elevation + 25) / 50, 1));
            image.data[index] = Math.round(60 + tint * 100);
            image.data[index + 1] = Math.round(120 + tint * 80);
            image.data[index + 2] = 40;
          }

          image.data[index + 3] = 255;
        }
      }
      backgroundContext.putImageData(image, 0, 0);
    };

    const draw = (now: number) => {
      if (now - lastBackgroundRefresh >= MINIMAP_POLL_MS * 4) {
        renderBackground();
        lastBackgroundRefresh = now;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(backgroundCanvas, 0, 0);
      const runtime = runtimeRef.current;
      const cameraX = runtime?.camera.x ?? 0;
      const cameraZ = runtime?.camera.z ?? 0;
      const { visibleZoomRadius } = getLandscapeViewMetrics({
        landscapeClipScale: landscapeClipScaleRef.current,
        viewRadiusBase: viewRadiusBaseRef.current,
        zoom: runtime?.camera.zoom ?? 1
      });
      const viewportRects = getMinimapViewportRectangles({
        cameraX,
        cameraZ,
        drawSize: MINIMAP_DRAW_SIZE,
        heightWorld: heightTiles * TILE,
        minSizePx: MINIMAP_MIN_VIEW_SIZE_PX,
        viewSpanWorldX: visibleZoomRadius * TILE * 2,
        viewSpanWorldZ: visibleZoomRadius * TILE * 2,
        widthWorld: widthTiles * TILE,
        wrapX: terrain.wrapX,
        wrapZ: terrain.wrapZ
      });

      context.save();
      context.strokeStyle = '#ff4040';
      context.lineWidth = 2;

      viewportRects.forEach(rect => {
        const x = Math.max(1, Math.min(MINIMAP_DRAW_SIZE - 1, rect.x));
        const y = Math.max(1, Math.min(MINIMAP_DRAW_SIZE - 1, rect.y));
        const width = Math.max(0, Math.min(MINIMAP_DRAW_SIZE - x, rect.width));
        const height = Math.max(
          0,
          Math.min(MINIMAP_DRAW_SIZE - y, rect.height)
        );

        if (width <= 0 || height <= 0) {
          return;
        }

        context.strokeRect(x, y, width, height);
      });
      context.restore();

      animationFrameId = window.requestAnimationFrame(draw);
    };

    renderBackground();
    animationFrameId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [runtimeRef, terrain]);

  if (terrain.widthTiles === null || terrain.heightTiles === null) {
    return null;
  }

  return (
    <canvas
      className="pointer-events-none absolute top-9 left-2 z-10 h-[140px] w-[140px] border-2 border-[#888] bg-[#003] [image-rendering:pixelated]"
      ref={canvasRef}
    />
  );
};
