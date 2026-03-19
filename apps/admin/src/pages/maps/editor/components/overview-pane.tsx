import { useCallback, useRef } from "react";

import type { WorldBounds, WorldPoint } from "carrier-contracts/types";

import { getBoundsCenter, STOP_PROPAGATION } from "../helpers/drafts";

type OverviewPaneProps = {
  bounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ"> | null;
  clusters: ReadonlyArray<{
    bbox: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ">;
    controlPointCount: number;
    derivedIslandCount: number;
    sourcePolygonCount: number;
  }>;
  onRecenter: (point: Pick<WorldPoint, "x" | "z">) => void;
  viewportBounds: Pick<WorldBounds, "maxX" | "maxZ" | "minX" | "minZ"> | null;
};

export function OverviewPane({
  bounds,
  clusters,
  onRecenter,
  viewportBounds,
}: OverviewPaneProps) {
  const dragRef = useRef<{ dx: number; dz: number } | null>(null);
  const draggedRef = useRef(false);

  const toRelative = useCallback(
    (point: Pick<WorldPoint, "x" | "z">) => {
      if (!bounds) {
        return { x: 50, z: 50 };
      }

      const width = Math.max(bounds.maxX - bounds.minX, 1);
      const height = Math.max(bounds.maxZ - bounds.minZ, 1);

      return {
        x: ((point.x - bounds.minX) / width) * 100,
        z: ((point.z - bounds.minZ) / height) * 100,
      };
    },
    [bounds],
  );

  const toWorld = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      currentTarget: { getBoundingClientRect(): DOMRect };
    }) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const relativeX = (event.clientX - rect.left) / rect.width;
      const relativeZ = (event.clientY - rect.top) / rect.height;

      if (!bounds) {
        return { x: 0, z: 0 };
      }

      return {
        x: bounds.minX + (bounds.maxX - bounds.minX) * relativeX,
        z: bounds.minZ + (bounds.maxZ - bounds.minZ) * relativeZ,
      };
    },
    [bounds],
  );

  if (!bounds || !viewportBounds) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Overview will appear once the viewport is ready.
      </div>
    );
  }

  const topLeft = toRelative({
    x: viewportBounds.minX,
    z: viewportBounds.minZ,
  });
  const bottomRight = toRelative({
    x: viewportBounds.maxX,
    z: viewportBounds.maxZ,
  });
  const center = getBoundsCenter(viewportBounds);

  return (
    <div
      className="relative h-56 overflow-hidden rounded-md border bg-slate-950"
      onClick={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }

        if (dragRef.current) {
          return;
        }

        onRecenter(toWorld(event));
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) {
          return;
        }

        draggedRef.current = true;

        onRecenter({
          x: toWorld(event).x + dragRef.current.dx,
          z: toWorld(event).z + dragRef.current.dz,
        });
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      {clusters.map((cluster, index) => {
        const position = toRelative({
          x: (cluster.bbox.minX + cluster.bbox.maxX) / 2,
          z: (cluster.bbox.minZ + cluster.bbox.maxZ) / 2,
        });

        return (
          <div
            className="absolute h-3 w-3 rounded-full bg-sky-400"
            key={`${cluster.bbox.minX}:${cluster.bbox.minZ}:${index}`}
            style={{
              left: `${position.x}%`,
              top: `${position.z}%`,
              transform: "translate(-50%, -50%)",
            }}
            title={`${cluster.sourcePolygonCount} polygons · ${cluster.controlPointCount} controls · ${cluster.derivedIslandCount} islands`}
          />
        );
      })}
      <div
        className="absolute border-2 border-emerald-300/90 bg-emerald-300/10"
        onPointerDown={(event) => {
          STOP_PROPAGATION(event);
          const pointerWorld = toWorld(event);
          dragRef.current = {
            dx: center.x - pointerWorld.x,
            dz: center.z - pointerWorld.z,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        style={{
          height: `${Math.max(bottomRight.z - topLeft.z, 4)}%`,
          left: `${topLeft.x}%`,
          top: `${topLeft.z}%`,
          width: `${Math.max(bottomRight.x - topLeft.x, 4)}%`,
        }}
      />
    </div>
  );
}
