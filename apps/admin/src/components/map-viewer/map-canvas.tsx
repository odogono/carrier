import { useCallback, useEffect, useRef } from 'react';

import type { MapChunk, MapMetadata } from 'carrier-contracts/types';

import { clearBitmapCache, getChunkBitmap } from '@/lib/chunk-bitmap';

import type { Viewport } from '@/hooks/use-map-viewport';

const BACKGROUND_COLOR = '#0a1320';

type MapCanvasProps = {
  canvasHeight: number;
  canvasWidth: number;
  chunks: Map<string, MapChunk>;
  isDragging: boolean;
  map: MapMetadata;
  onKeyDown: (e: React.KeyboardEvent<HTMLCanvasElement>) => void;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  viewport: Viewport;
};

export function MapCanvas({
  canvasHeight,
  canvasWidth,
  chunks,
  isDragging,
  map,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  viewport
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef(viewport);
  const chunksRef = useRef(chunks);
  const mapRef = useRef(map);

  viewportRef.current = viewport;
  chunksRef.current = chunks;
  mapRef.current = map;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const v = viewportRef.current;
    const currentChunks = chunksRef.current;
    const currentMap = mapRef.current;

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const originX = canvas.width / 2 - v.centerTileX * v.zoom;
    const originZ = canvas.height / 2 - v.centerTileZ * v.zoom;

    for (const chunk of currentChunks.values()) {
      const bitmap = getChunkBitmap(chunk);

      const destX = originX + chunk.originTileX * v.zoom;
      const destZ = originZ + chunk.originTileZ * v.zoom;
      const destW = chunk.tileWidth * v.zoom;
      const destH = chunk.tileHeight * v.zoom;

      ctx.drawImage(bitmap, destX, destZ, destW, destH);
    }

    // Draw map boundary outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      originX,
      originZ,
      currentMap.widthTiles * v.zoom,
      currentMap.heightTiles * v.zoom
    );
  }, []);

  useEffect(() => {
    let rafId = 0;

    const loop = () => {
      draw();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [draw]);

  useEffect(() => {
    return () => {
      clearBitmapCache(map.id);
    };
  }, [map.id]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      tabIndex={0}
      className="outline-none"
      style={{
        cursor: isDragging ? 'grabbing' : 'crosshair',
        display: 'block',
        height: canvasHeight,
        width: canvasWidth
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    />
  );
}
