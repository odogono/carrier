import {
  isFiniteMap,
  type MapMetadata,
  type RuntimeMapChunk,
  type ZarchTileEditConfig
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
  editConfig: ZarchTileEditConfig | null;
  map: MapMetadata;
  viewport: Viewport;
};

export function MapStage({
  canvasHeight,
  canvasWidth,
  chunks,
  editConfig,
  map,
  viewport
}: MapStageProps) {
  const terrainLayerRef = useRef<Konva.Layer>(null);

  const stageX = canvasWidth / 2 - viewport.centerTileX * viewport.zoom;
  const stageY = canvasHeight / 2 - viewport.centerTileZ * viewport.zoom;

  useEffect(() => {
    const layer = terrainLayerRef.current;
    if (!layer) {return;}
    const ctx = layer.getCanvas().getContext();
    ctx.imageSmoothingEnabled = false;
  }, []);

  useEffect(() => () => {
      clearBitmapCache(map.id);
    }, [map.id]);

  const chunkImages = useMemo(() => Array.from(chunks.values()).map(chunk => ({
      height: chunk.tileHeight,
      image: getChunkBitmap(chunk, chunks, editConfig),
      key: `${chunk.chunkX}:${chunk.chunkZ}`,
      width: chunk.tileWidth,
      x: chunk.originTileX,
      y: chunk.originTileZ
    })), [chunks, editConfig]);

  return (
    <Stage
      height={canvasHeight}
      listening={false}
      scaleX={viewport.zoom}
      scaleY={viewport.zoom}
      style={{ background: BACKGROUND_COLOR }}
      width={canvasWidth}
      x={stageX}
      y={stageY}
    >
      <Layer ref={terrainLayerRef}>
        {chunkImages.map(ci => (
          <Image
            height={ci.height}
            image={ci.image}
            key={ci.key}
            listening={false}
            width={ci.width}
            x={ci.x}
            y={ci.y}
          />
        ))}
      </Layer>
      <Layer>
        <GridLines
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          map={map}
          viewport={viewport}
        />
      </Layer>
      <Layer>
        {isFiniteMap(map) && (
          <Rect
            height={map.extent.heightTiles}
            listening={false}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={1 / viewport.zoom}
            width={map.extent.widthTiles}
            x={0}
            y={0}
          />
        )}
      </Layer>
    </Stage>
  );
}
