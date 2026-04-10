import { MAP_SURFACE_MATERIALS, type RuntimeMapChunk, type ZarchTileEditConfig } from 'carrier-contracts/types';
import type { ZarchTileDraftEdits } from 'carrier-terrain-edit';

import {
  createChunkMapTerrain,
  getChunkTileCoordinates
} from '@/lib/map-chunk-terrain';

export type TerrainRenderLayer =
  | 'resolved-color'
  | 'color-overrides'
  | 'base-height'
  | 'resolved-height'
  | 'height-steps'
  | 'tile-type'
  | 'surface-material';

export type TerrainRenderLegendItem = {
  color: string;
  label: string;
};

export const TERRAIN_RENDER_LAYER_OPTIONS: Array<{
  id: TerrainRenderLayer;
  label: string;
}> = [
  { id: 'resolved-color', label: 'Resolved Color' },
  { id: 'color-overrides', label: 'Color Overrides' },
  { id: 'base-height', label: 'Base Height' },
  { id: 'resolved-height', label: 'Resolved Height' },
  { id: 'height-steps', label: 'Height Steps' },
  { id: 'tile-type', label: 'Tile Type' },
  { id: 'surface-material', label: 'Surface Material' }
];

export type HeightRange = {
  max: number;
  min: number;
};

const AUTO_COLOR = '#17212e';
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const interpolateRgb = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): [number, number, number] => [
  Math.round(from[0] + (to[0] - from[0]) * t),
  Math.round(from[1] + (to[1] - from[1]) * t),
  Math.round(from[2] + (to[2] - from[2]) * t)
];

const sampleGradient = (
  stops: Array<{ color: readonly [number, number, number]; offset: number }>,
  value: number
): [number, number, number] => {
  const clamped = clamp01(value);

  for (let index = 1; index < stops.length; index += 1) {
    const current = stops[index]!;
    const previous = stops[index - 1]!;

    if (clamped <= current.offset) {
      const span = current.offset - previous.offset || 1;
      const localT = (clamped - previous.offset) / span;
      return interpolateRgb(previous.color, current.color, localT);
    }
  }

  return [...stops.at(-1)!.color] as [number, number, number];
};

const normalizeHeight = (value: number, range: HeightRange | null) => {
  if (!range) {
    return 0.5;
  }

  const span = Math.max(range.max - range.min, 0.001);
  return clamp01((value - range.min) / span);
};

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash, 31) + value.charCodeAt(index);
  }

  return Math.abs(hash);
};

export const categoricalColor = (index: number, seed = 0) => {
  const hue = (index * 73 + seed * 29) % 360;
  const saturation = 65;
  const lightness = 55;

  const c = ((1 - Math.abs((2 * lightness) / 100 - 1)) * saturation) / 100;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness / 100 - c / 2;
  let rgb: [number, number, number] = [0, 0, 0];

  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return rgb.map(value => Math.round((value + m) * 255)) as [
    number,
    number,
    number
  ];
};

const baseHeightGradient = [
  { color: [22, 35, 54] as const, offset: 0 },
  { color: [50, 96, 142] as const, offset: 0.2 },
  { color: [106, 170, 99] as const, offset: 0.5 },
  { color: [199, 188, 142] as const, offset: 0.78 },
  { color: [235, 239, 245] as const, offset: 1 }
];

const heightStepGradient = [
  { color: [37, 66, 123] as const, offset: 0 },
  { color: [87, 140, 193] as const, offset: 0.35 },
  { color: [160, 168, 178] as const, offset: 0.5 },
  { color: [211, 153, 78] as const, offset: 0.7 },
  { color: [169, 79, 54] as const, offset: 1 }
];

export const getTerrainRenderLegend = (
  layer: TerrainRenderLayer,
  editConfig: ZarchTileEditConfig | null
): TerrainRenderLegendItem[] => {
  if (layer === 'color-overrides') {
    return [
      { color: AUTO_COLOR, label: 'Auto' },
      ...(editConfig?.palette.map(entry => ({
        color: entry.hex,
        label: entry.label
      })) ?? [])
    ];
  }

  if (layer === 'tile-type') {
    return (
      editConfig?.tileTypes.map((tileType, index) => ({
        color: rgbToHex(categoricalColor(index, hashString(tileType.id))),
        label: tileType.label
      })) ?? []
    );
  }

  if (layer === 'surface-material') {
    return MAP_SURFACE_MATERIALS.map((material, index) => ({
      color: rgbToHex(categoricalColor(index, 7)),
      label: material
    }));
  }

  if (layer === 'height-steps') {
    return [
      { color: rgbToHex(heightStepGradient[0]!.color), label: 'Negative' },
      { color: rgbToHex(heightStepGradient[2]!.color), label: 'Zero' },
      { color: rgbToHex(heightStepGradient[4]!.color), label: 'Positive' }
    ];
  }

  if (layer === 'base-height' || layer === 'resolved-height') {
    return [
      { color: rgbToHex(baseHeightGradient[0]!.color), label: 'Low' },
      { color: rgbToHex(baseHeightGradient[2]!.color), label: 'Mid' },
      { color: rgbToHex(baseHeightGradient[4]!.color), label: 'High' }
    ];
  }

  return [];
};

export const rgbToHex = ([r, g, b]: readonly [number, number, number]) =>
  `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;

export const getTileTypeLayerRgb = (
  typeId: string,
  editConfig: ZarchTileEditConfig | null
) => {
  const typeIndex =
    editConfig?.tileTypes.findIndex(tileType => tileType.id === typeId) ?? 0;
  return categoricalColor(Math.max(typeIndex, 0), hashString(typeId));
};

export const getSurfaceMaterialLayerRgb = (materialIndex: number) =>
  categoricalColor(Math.max(materialIndex, 0), 7);

export const getHeightLayerRgb = (
  value: number,
  range: HeightRange | null
) => sampleGradient(baseHeightGradient, normalizeHeight(value, range));

export const getHeightStepLayerRgb = (
  heightSteps: number,
  maxAbsHeightSteps: number
) =>
  sampleGradient(
    heightStepGradient,
    clamp01((heightSteps / Math.max(maxAbsHeightSteps, 1) + 1) * 0.5)
  );

export const computeVisibleHeightRange = ({
  chunks,
  draftEdits,
  editConfig,
  layer,
  map
}: {
  chunks: Map<string, RuntimeMapChunk>;
  draftEdits?: ZarchTileDraftEdits;
  editConfig: ZarchTileEditConfig | null;
  layer: TerrainRenderLayer;
  map: import('carrier-contracts/types').MapMetadata;
}) => {
  if (layer !== 'base-height' && layer !== 'resolved-height') {
    return null;
  }

  const terrain = createChunkMapTerrain({
    chunks,
    draftEdits,
    editConfig,
    map
  });
  const values: number[] = [];

  for (const chunk of chunks.values()) {
    for (const tile of getChunkTileCoordinates(chunk)) {
      const value =
        layer === 'base-height'
          ? terrain.getTileBaseAverageHeight(tile.tileX, tile.tileZ)
          : terrain.getTileAverageHeight(tile.tileX, tile.tileZ);

      if (value !== null) {
        values.push(value);
      }
    }
  }

  if (values.length === 0) {
    return null;
  }

  return {
    max: Math.max(...values),
    min: Math.min(...values)
  };
};
