import { type RefObject, useEffect, useRef } from 'react';

import {
  GRID,
  MINIMAP_POLL_MS,
  TILE,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

import type { ZarchRuntimeState } from './use-zarch-runtime';

type ZarchMinimapProps = {
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

export const ZarchMinimap = ({ runtimeRef, terrain }: ZarchMinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = GRID;
    canvas.height = GRID;

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const minimapImage = context.createImageData(GRID, GRID);

    for (let gz = 0; gz < GRID; gz += 1) {
      for (let gx = 0; gx < GRID; gx += 1) {
        const elevation = terrain.sampleHeight(gx, gz);
        const index = (gz * GRID + gx) * 4;

        if (elevation < -10) {
          minimapImage.data[index] = 30;
          minimapImage.data[index + 1] = 80;
          minimapImage.data[index + 2] = 160;
        } else {
          const tint = (elevation + 25) / 50;
          minimapImage.data[index] = Math.round(60 + tint * 100);
          minimapImage.data[index + 1] = Math.round(120 + tint * 80);
          minimapImage.data[index + 2] = 40;
        }

        minimapImage.data[index + 3] = 255;
      }
    }

    const draw = () => {
      context.putImageData(minimapImage, 0, 0);

      const px = ((((runtimeRef.current?.camX ?? 0) / TILE) % GRID) + GRID) % GRID;
      const pz = ((((runtimeRef.current?.camZ ?? 0) / TILE) % GRID) + GRID) % GRID;

      context.fillStyle = '#ff4040';
      context.fillRect(Math.round(px) - 1, Math.round(pz) - 1, 3, 3);
    };

    draw();

    const intervalId = window.setInterval(draw, MINIMAP_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runtimeRef, terrain]);

  return (
    <canvas
      className="pointer-events-none absolute top-9 left-2 z-10 h-[140px] w-[140px] border-2 border-[#888] bg-[#003] [image-rendering:pixelated]"
      ref={canvasRef}
    />
  );
};
