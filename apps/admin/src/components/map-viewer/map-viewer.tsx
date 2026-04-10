import type { MapMetadata } from 'carrier-contracts/types';
import { Home, Minus, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent
} from 'react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useMapChunks } from '@/hooks/use-map-chunks';
import { mapEditorKeys } from '@/hooks/use-map-editor-data';
import { getVisibleChunkRange, useMapViewport } from '@/hooks/use-map-viewport';
import { client } from '@/lib/api-client';
import {
  TERRAIN_RENDER_LAYER_OPTIONS,
  getTerrainRenderLegend,
  type TerrainRenderLayer
} from '@/lib/terrain-render';
import { useQuery } from '@tanstack/react-query';

import { MapStage } from './map-stage';

type MapViewerProps = {
  map: MapMetadata;
  mapId: string;
};

export function MapViewer({ map, mapId }: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const [renderLayer, setRenderLayer] =
    useState<TerrainRenderLayer>('resolved-color');
  const [size, setSize] = useState({ height: 0, width: 0 });

  const handleWheelCapture = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    setSize(prev => {
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (prev.width === w && prev.height === h) {
        return prev;
      }
      return { height: h, width: w };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    measureContainer();

    const observer = new ResizeObserver(measureContainer);
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [measureContainer]);

  const {
    fitToView,
    isDragging,
    onKeyDown,
    onPointerCancel,
    onPointerDown,
    onPointerLeave,
    onPointerMove,
    onPointerUp,
    onWheel,
    viewport,
    zoomIn,
    zoomOut
  } = useMapViewport(map, size.width, size.height);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      interactionRef.current?.focus();
      onPointerDown(e);
    },
    [onPointerDown]
  );

  // Refit when canvas size first becomes available
  const hasFitted = useRef(false);

  useEffect(() => {
    if (size.width > 0 && size.height > 0 && !hasFitted.current) {
      hasFitted.current = true;
      fitToView();
    }
  }, [size.width, size.height, fitToView]);

  const chunkRange = getVisibleChunkRange(
    viewport,
    size.width,
    size.height,
    map
  );
  const chunks = useMapChunks(mapId, chunkRange);
  const tileEditConfigQuery = useQuery({
    queryFn: () => client.maps.getTileEditConfig({}),
    queryKey: mapEditorKeys.tileEditConfig()
  });
  const legendItems = getTerrainRenderLegend(
    renderLayer,
    tileEditConfigQuery.data ?? null
  );

  const zoomPercent = Math.round(viewport.zoom * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 rounded-md border bg-card/60 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Terrain Layer
            </div>
            <div className="text-sm text-foreground">
              Switch between authored and derived terrain views
            </div>
          </div>
          <div className="w-full sm:w-[220px]">
            <Select
              aria-label="Terrain render layer"
              onChange={event =>
                setRenderLayer(event.target.value as TerrainRenderLayer)
              }
              value={renderLayer}
            >
              {TERRAIN_RENDER_LAYER_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <div
        className="relative h-[500px] overflow-hidden rounded-md border bg-[#0a1320]"
        ref={containerRef}
      >
        {size.width > 0 && size.height > 0 && (
          <div
            className="outline-none"
            onKeyDown={onKeyDown}
            onPointerCancel={onPointerCancel}
            onPointerDown={handlePointerDown}
            onPointerLeave={onPointerLeave}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
            onWheelCapture={handleWheelCapture}
            ref={interactionRef}
            style={{
              cursor: isDragging ? 'grabbing' : 'crosshair',
              display: 'block',
              height: size.height,
              overscrollBehavior: 'contain',
              touchAction: 'none',
              width: size.width
            }}
            tabIndex={0}
          >
            <MapStage
              canvasHeight={size.height}
              canvasWidth={size.width}
              chunks={chunks}
              editConfig={tileEditConfigQuery.data ?? null}
              map={map}
              renderLayer={renderLayer}
              viewport={viewport}
            />
          </div>
        )}
        <div className="absolute right-3 bottom-3 flex gap-1">
          <Button
            className="h-8 w-8"
            onClick={zoomIn}
            size="icon"
            title="Zoom in"
            variant="secondary"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            className="h-8 w-8"
            onClick={zoomOut}
            size="icon"
            title="Zoom out"
            variant="secondary"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            className="h-8 w-8"
            onClick={fitToView}
            size="icon"
            title="Reset view"
            variant="secondary"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {legendItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {legendItems.map(item => (
            <div
              className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
              key={`${renderLayer}-${item.label}`}
            >
              <span
                className="inline-block h-3 w-3 rounded-sm border border-black/40"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {map.extent.kind === 'finite' ? (
            <>
              {map.extent.widthTiles}&times;{map.extent.heightTiles} tiles
            </>
          ) : (
            'Infinite'
          )}{' '}
          &middot; Zoom {zoomPercent}%
        </span>
        <span>Drag to pan &middot; Scroll to zoom &middot; Home to reset</span>
      </div>
    </div>
  );
}
