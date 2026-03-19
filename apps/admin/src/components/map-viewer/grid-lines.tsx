import { isFiniteMap, type MapMetadata } from 'carrier-contracts/types';
import { useMemo } from 'react';
import { Line, Text } from 'react-konva';

import type { Viewport } from '@/hooks/use-map-viewport';

type GridLevel = {
  label: string;
  spacingTiles: number;
};

const GRID_LEVELS: GridLevel[] = [
  { label: '500m', spacingTiles: 50 },
  { label: '1km', spacingTiles: 100 },
  { label: '5km', spacingTiles: 500 },
  { label: '10km', spacingTiles: 1000 },
  { label: '100km', spacingTiles: 10000 }
];

const GRID_STROKE = 'rgba(255, 255, 255, 0.3)';
const LABEL_FILL = 'rgba(255, 255, 255, 0.3)';

const chooseGridLevel = (visibleTiles: number): GridLevel => {
  for (const level of GRID_LEVELS) {
    const count = visibleTiles / level.spacingTiles;
    if (count >= 3 && count <= 12) return level;
  }

  // Fallback: pick level closest to showing ~5 lines
  return GRID_LEVELS.reduce((best, level) => {
    const bestCount = visibleTiles / best.spacingTiles;
    const count = visibleTiles / level.spacingTiles;
    return Math.abs(count - 5) < Math.abs(bestCount - 5) ? level : best;
  });
};

const formatLabel = (tilePos: number, metersPerTile: number): string => {
  const meters = tilePos * metersPerTile;
  if (Math.abs(meters) >= 1000) return `${meters / 1000}km`;
  return `${meters}m`;
};

type GridLinesProps = {
  canvasHeight: number;
  canvasWidth: number;
  map: MapMetadata;
  viewport: Viewport;
};

export function GridLines({
  canvasHeight,
  canvasWidth,
  map,
  viewport
}: GridLinesProps) {
  const elements = useMemo(() => {
    const finite = isFiniteMap(map);
    const metersPerTile = map.resolution.metersPerTile;
    const boundsW = finite ? map.extent.widthTiles : null;
    const boundsH = finite ? map.extent.heightTiles : null;

    const visibleTilesX = canvasWidth / viewport.zoom;
    const visibleTilesZ = canvasHeight / viewport.zoom;
    const maxVisible = Math.max(visibleTilesX, visibleTilesZ);

    const level = chooseGridLevel(maxVisible);
    const spacing = level.spacingTiles;

    // Visible tile range
    const minTileX = viewport.centerTileX - visibleTilesX / 2;
    const maxTileX = viewport.centerTileX + visibleTilesX / 2;
    const minTileZ = viewport.centerTileZ - visibleTilesZ / 2;
    const maxTileZ = viewport.centerTileZ + visibleTilesZ / 2;

    const strokeWidth = 1 / viewport.zoom;
    const fontSize = 11 / viewport.zoom;
    const labelPadding = 4 / viewport.zoom;

    const lines: Array<{ key: string; points: number[] }> = [];
    const labels: Array<{ key: string; text: string; x: number; y: number }> =
      [];

    // Clamp helpers — for finite maps, clamp to bounds; for infinite, use viewport edges
    const clampMinX = boundsW !== null ? Math.max(0, minTileX) : minTileX;
    const clampMaxX = boundsW !== null ? Math.min(boundsW, maxTileX) : maxTileX;
    const clampMinZ = boundsH !== null ? Math.max(0, minTileZ) : minTileZ;
    const clampMaxZ = boundsH !== null ? Math.min(boundsH, maxTileZ) : maxTileZ;

    // Vertical lines
    const firstX = Math.ceil(clampMinX / spacing) * spacing;
    const lastX = Math.floor(clampMaxX / spacing) * spacing;

    for (let x = firstX; x <= lastX; x += spacing) {
      lines.push({
        key: `v${x}`,
        points: [x, clampMinZ, x, clampMaxZ]
      });
      labels.push({
        key: `lv${x}`,
        text: formatLabel(x, metersPerTile),
        x: x + labelPadding,
        y: clampMinZ + labelPadding
      });
    }

    // Horizontal lines
    const firstZ = Math.ceil(clampMinZ / spacing) * spacing;
    const lastZ = Math.floor(clampMaxZ / spacing) * spacing;

    for (let z = firstZ; z <= lastZ; z += spacing) {
      lines.push({
        key: `h${z}`,
        points: [clampMinX, z, clampMaxX, z]
      });
      labels.push({
        key: `lh${z}`,
        text: formatLabel(z, metersPerTile),
        x: clampMinX + labelPadding,
        y: z + labelPadding
      });
    }

    return { fontSize, labels, lines, strokeWidth };
  }, [
    canvasHeight,
    canvasWidth,
    map,
    viewport.centerTileX,
    viewport.centerTileZ,
    viewport.zoom
  ]);

  return (
    <>
      {elements.lines.map(line => (
        <Line
          key={line.key}
          points={line.points}
          stroke={GRID_STROKE}
          strokeWidth={elements.strokeWidth}
          listening={false}
        />
      ))}
      {elements.labels.map(label => (
        <Text
          key={label.key}
          x={label.x}
          y={label.y}
          text={label.text}
          fontSize={elements.fontSize}
          fill={LABEL_FILL}
          listening={false}
        />
      ))}
    </>
  );
}
