import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";

import type { MapMetadata } from "carrier-contracts/types";
import { Home, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMapChunks } from "@/hooks/use-map-chunks";
import { getVisibleChunkRange, useMapViewport } from "@/hooks/use-map-viewport";

import { MapStage } from "./map-stage";

type MapViewerProps = {
  map: MapMetadata;
  mapId: string;
};

export function MapViewer({ map, mapId }: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });

  const handleWheelCapture = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSize((prev) => {
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (prev.width === w && prev.height === h) return prev;
      return { height: h, width: w };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    viewport,
    zoomIn,
    zoomOut,
  } = useMapViewport(map, size.width, size.height);

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
    map,
  );
  const chunks = useMapChunks(mapId, chunkRange);

  const zoomPercent = Math.round(viewport.zoom * 100);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative h-[500px] overflow-hidden rounded-md border bg-[#0a1320]"
      >
        {size.width > 0 && size.height > 0 && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheelCapture={handleWheelCapture}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            tabIndex={0}
            className="outline-none"
            style={{
              cursor: isDragging ? "grabbing" : "crosshair",
              display: "block",
              height: size.height,
              overscrollBehavior: "contain",
              width: size.width,
            }}
          >
            <MapStage
              canvasWidth={size.width}
              canvasHeight={size.height}
              chunks={chunks}
              map={map}
              viewport={viewport}
            />
          </div>
        )}
        <div className="absolute right-3 bottom-3 flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={zoomIn}
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={zoomOut}
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={fitToView}
            title="Reset view"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {map.widthTiles}&times;{map.heightTiles} tiles &middot; Zoom{" "}
          {zoomPercent}%
        </span>
        <span>Drag to pan &middot; Scroll to zoom &middot; Home to reset</span>
      </div>
    </div>
  );
}
