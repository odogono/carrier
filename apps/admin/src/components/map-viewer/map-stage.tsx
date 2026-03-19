import {
  isFiniteMap,
  type MapMetadata,
  type RuntimeMapChunk
} from 'carrier-contracts/types';
import Konva from 'konva';
import { useEffect, useMemo, useRef } from 'react';
import { Image, Layer, Rect, Stage } from 'react-konva';

import type { Viewport } from '@/hooks/use-map-viewport';
import { clearBitmapCache, getChunkBitmap } from '@/lib/chunk-bitmap';

import { GridLines } from './grid-lines';

const BACKGROUND_COLOR = '#0a1320';

type MapStageProps = {
  canvasHeight: number;
  canvasWidth: number;
  chunks: Map<string, RuntimeMapChunk>;
  map: MapMetadata;
  viewport: Viewport;
};

export function MapStage({
  canvasHeight,
  canvasWidth,
  chunks,
  map,
  viewport
}: MapStageProps) {
  const terrainLayerRef = useRef<Konva.Layer>(null);

  const stageX = canvasWidth / 2 - viewport.centerTileX * viewport.zoom;
  const stageY = canvasHeight / 2 - viewport.centerTileZ * viewport.zoom;

  useEffect(() => {
    const layer = terrainLayerRef.current;
    if (!layer) return;
    const ctx = layer.getCanvas().getContext();
    ctx.imageSmoothingEnabled = false;
  }, []);

  useEffect(() => {
    return () => {
      clearBitmapCache(map.id);
    };
  }, [map.id]);

  const chunkImages = useMemo(() => {
    return Array.from(chunks.values()).map(chunk => ({
      height: chunk.tileHeight,
      image: getChunkBitmap(chunk),
      key: `${chunk.chunkX}:${chunk.chunkZ}`,
      width: chunk.tileWidth,
      x: chunk.originTileX,
      y: chunk.originTileZ
    }));
  }, [chunks]);

  return (
    <Stage
      width={canvasWidth}
      height={canvasHeight}
      scaleX={viewport.zoom}
      scaleY={viewport.zoom}
      x={stageX}
      y={stageY}
      listening={false}
      style={{ background: BACKGROUND_COLOR }}
    >
      <Layer ref={terrainLayerRef}>
        {chunkImages.map(ci => (
          <Image
            key={ci.key}
            image={ci.image}
            x={ci.x}
            y={ci.y}
            width={ci.width}
            height={ci.height}
            listening={false}
          />
        ))}
      </Layer>
      <Layer>
        <GridLines
          viewport={viewport}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          map={map}
        />
      </Layer>
      <Layer>
        {isFiniteMap(map) && (
          <Rect
            x={0}
            y={0}
            width={map.extent.widthTiles}
            height={map.extent.heightTiles}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={1 / viewport.zoom}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
}
