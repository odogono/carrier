import { type RefObject, useEffect, useRef } from 'react';

import { MINIMAP_POLL_MS, TILE, type ZarchTerrain } from '@/helpers/zarch-terrain';

import type { ZarchRuntimeState } from './use-zarch-runtime';

type ZarchMinimapProps = {
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

export const wrapWorldCoordinate = (value: number, size: number) =>
  size <= 0 ? 0 : ((value % size) + size) % size;

export const ZarchMinimap = ({ runtimeRef, terrain }: ZarchMinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const { heightTiles, widthTiles } = terrain;
    if (widthTiles === null || heightTiles === null) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const drawSize = 140;
    const backgroundCanvas = document.createElement('canvas');
    let animationFrameId = 0;
    let lastBackgroundRefresh = -Infinity;

    canvas.width = drawSize;
    canvas.height = drawSize;
    backgroundCanvas.width = drawSize;
    backgroundCanvas.height = drawSize;

    const context = canvas.getContext('2d');
    const backgroundContext = backgroundCanvas.getContext('2d');

    if (!context || !backgroundContext) {
      return;
    }

    const renderBackground = () => {
      const image = backgroundContext.createImageData(drawSize, drawSize);

      for (let pixelY = 0; pixelY < drawSize; pixelY += 1) {
        const gz = Math.min(
          Math.floor((pixelY / drawSize) * heightTiles),
          heightTiles - 1
        );

        for (let pixelX = 0; pixelX < drawSize; pixelX += 1) {
          const gx = Math.min(
            Math.floor((pixelX / drawSize) * widthTiles),
            widthTiles - 1
          );
          const elevation = terrain.getTileAverageHeight(gx, gz);
          const index = (pixelY * drawSize + pixelX) * 4;

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

      const px = Math.min(
        drawSize - 1,
        Math.max(
          0,
          Math.round(
            (wrapWorldCoordinate(
              runtimeRef.current?.camera.x ?? 0,
              Math.max(widthTiles * TILE, TILE)
            ) /
              Math.max(widthTiles * TILE, TILE)) *
              drawSize
          )
        )
      );
      const pz = Math.min(
        drawSize - 1,
        Math.max(
          0,
          Math.round(
            (wrapWorldCoordinate(
              runtimeRef.current?.camera.z ?? 0,
              Math.max(heightTiles * TILE, TILE)
            ) /
              Math.max(heightTiles * TILE, TILE)) *
              drawSize
          )
        )
      );

      context.fillStyle = '#ff4040';
      context.fillRect(px - 1, pz - 1, 3, 3);

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
