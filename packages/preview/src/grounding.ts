import type { RuntimeMapChunk } from "carrier-contracts/types";

export type PreviewTerrainGrid = {
  heights: Float32Array;
  originX: number;
  originZ: number;
  sampleSpacing: number;
  samplesHigh: number;
  samplesWide: number;
};

export type GroundingSampleLabel =
  "center" | "front-left" | "front-right" | "back-left" | "back-right";

export type GroundingSample = {
  height: number;
  label: GroundingSampleLabel;
  x: number;
  z: number;
};

export type GroundingResult = {
  averageTerrainHeightMeters: number;
  effectiveHeightMeters: number;
  maxHeightDeltaMeters: number;
  samples: GroundingSample[];
  scaledYOffsetMeters: number;
  valid: boolean;
};

const rotateOffset = (x: number, z: number, yawRadians: number) => {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);

  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine,
  };
};

export const getGroundingSamplePoints = ({
  anchorX,
  anchorZ,
  depthMeters,
  widthMeters,
  yawDegrees,
}: {
  anchorX: number;
  anchorZ: number;
  depthMeters: number;
  widthMeters: number;
  yawDegrees: number;
}): Array<Omit<GroundingSample, "height">> => {
  const halfWidth = widthMeters * 0.5;
  const halfDepth = depthMeters * 0.5;
  const yawRadians = (yawDegrees * Math.PI) / 180;
  const offsets: Array<{
    label: GroundingSampleLabel;
    x: number;
    z: number;
  }> = [
    { label: "center", x: 0, z: 0 },
    { label: "front-left", x: -halfWidth, z: -halfDepth },
    { label: "front-right", x: halfWidth, z: -halfDepth },
    { label: "back-left", x: -halfWidth, z: halfDepth },
    { label: "back-right", x: halfWidth, z: halfDepth },
  ];

  return offsets.map((offset) => {
    const rotated = rotateOffset(offset.x, offset.z, yawRadians);

    return {
      label: offset.label,
      x: anchorX + rotated.x,
      z: anchorZ + rotated.z,
    };
  });
};

export const sampleTerrainHeight = (
  terrain: PreviewTerrainGrid,
  x: number,
  z: number,
) => {
  const localX = (x - terrain.originX) / terrain.sampleSpacing;
  const localZ = (z - terrain.originZ) / terrain.sampleSpacing;

  if (
    localX < 0 ||
    localZ < 0 ||
    localX > terrain.samplesWide - 1 ||
    localZ > terrain.samplesHigh - 1
  ) {
    return null;
  }

  const x0 = Math.floor(localX);
  const z0 = Math.floor(localZ);
  const x1 = Math.min(x0 + 1, terrain.samplesWide - 1);
  const z1 = Math.min(z0 + 1, terrain.samplesHigh - 1);
  const tx = localX - x0;
  const tz = localZ - z0;
  const rowStride = terrain.samplesWide;
  const h00 = terrain.heights[z0 * rowStride + x0];
  const h10 = terrain.heights[z0 * rowStride + x1];
  const h01 = terrain.heights[z1 * rowStride + x0];
  const h11 = terrain.heights[z1 * rowStride + x1];

  if (
    h00 === undefined ||
    h10 === undefined ||
    h01 === undefined ||
    h11 === undefined
  ) {
    return null;
  }

  const top = h00 * (1 - tx) + h10 * tx;
  const bottom = h01 * (1 - tx) + h11 * tx;
  return top * (1 - tz) + bottom * tz;
};

export const computeScaledGroundingResult = ({
  anchorX,
  anchorZ,
  footprintDepthMeters,
  footprintWidthMeters,
  maxHeightDeltaMeters,
  placementScale,
  sampleHeight,
  yOffsetMeters,
  yawDegrees,
}: {
  anchorX: number;
  anchorZ: number;
  footprintDepthMeters: number;
  footprintWidthMeters: number;
  maxHeightDeltaMeters: number;
  placementScale: number;
  sampleHeight: (point: Omit<GroundingSample, "height">) => number | null;
  yOffsetMeters: number;
  yawDegrees: number;
}): GroundingResult | null => {
  const samples = getGroundingSamplePoints({
    anchorX,
    anchorZ,
    depthMeters: footprintDepthMeters * placementScale,
    widthMeters: footprintWidthMeters * placementScale,
    yawDegrees,
  }).map((sample) => {
    const height = sampleHeight(sample);
    return height === null ? null : { ...sample, height };
  });

  if (samples.some((sample) => sample === null)) {
    return null;
  }

  const resolvedSamples = samples as GroundingSample[];
  const heights = resolvedSamples.map((sample) => sample.height);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const averageHeight =
    heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const maxHeightDelta = maxHeight - minHeight;
  const scaledYOffsetMeters = yOffsetMeters * placementScale;
  const effectiveHeightMeters = averageHeight + scaledYOffsetMeters;

  return {
    averageTerrainHeightMeters: averageHeight,
    effectiveHeightMeters,
    maxHeightDeltaMeters: maxHeightDelta,
    samples: resolvedSamples,
    scaledYOffsetMeters,
    valid: maxHeightDelta <= maxHeightDeltaMeters,
  };
};

export const computeGroundingResult = ({
  anchorX,
  anchorZ,
  depthMeters,
  maxHeightDeltaMeters,
  terrain,
  widthMeters,
  yawDegrees,
}: {
  anchorX: number;
  anchorZ: number;
  depthMeters: number;
  maxHeightDeltaMeters: number;
  terrain: PreviewTerrainGrid;
  widthMeters: number;
  yawDegrees: number;
}): GroundingResult | null =>
  computeScaledGroundingResult({
    anchorX,
    anchorZ,
    footprintDepthMeters: depthMeters,
    footprintWidthMeters: widthMeters,
    maxHeightDeltaMeters,
    placementScale: 1,
    sampleHeight: (point) => sampleTerrainHeight(terrain, point.x, point.z),
    yOffsetMeters: 0,
    yawDegrees,
  });

export const getChunkCenterAnchor = (
  chunk: Pick<
    RuntimeMapChunk,
    "originTileX" | "originTileZ" | "tileWidth" | "tileHeight"
  >,
  metersPerTile: number,
) => ({
  x: (chunk.originTileX + chunk.tileWidth * 0.5) * metersPerTile,
  z: (chunk.originTileZ + chunk.tileHeight * 0.5) * metersPerTile,
});
