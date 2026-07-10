import { describe, expect, test } from "bun:test";

import { computeScaledGroundingResult } from "./grounding";

const fixture = await Bun.file(
  new URL("../../../fixtures/static-entity-grounding.json", import.meta.url),
).json();

const sampleHeight = (x: number, z: number) =>
  fixture.terrainPlane.baseHeightMeters +
  fixture.terrainPlane.xSlope * x +
  fixture.terrainPlane.zSlope * z;

describe("static entity grounding", () => {
  test("uses scaled footprint samples, scaled yOffset, and map-space tolerance", () => {
    const result = computeScaledGroundingResult({
      anchorX: fixture.placement.position.x,
      anchorZ: fixture.placement.position.z,
      footprintDepthMeters: fixture.assetVersion.footprint.depthMeters,
      footprintWidthMeters: fixture.assetVersion.footprint.widthMeters,
      maxHeightDeltaMeters: fixture.assetVersion.maxHeightDeltaMeters,
      placementScale: fixture.placement.scale,
      sampleHeight: (point) => sampleHeight(point.x, point.z),
      yOffsetMeters: fixture.placement.yOffset,
      yawDegrees: fixture.placement.rotation.yaw,
    });

    expect(result).not.toBeNull();
    expect(result?.averageTerrainHeightMeters).toBeCloseTo(
      fixture.expected.averageTerrainHeightMeters,
      8,
    );
    expect(result?.scaledYOffsetMeters).toBeCloseTo(
      fixture.expected.scaledYOffsetMeters,
      8,
    );
    expect(result?.effectiveHeightMeters).toBeCloseTo(
      fixture.expected.effectiveHeightMeters,
      8,
    );
    expect(result?.maxHeightDeltaMeters).toBeCloseTo(
      fixture.expected.maxHeightDeltaMeters,
      8,
    );
    expect(result?.valid).toBe(fixture.expected.valid);
    expect(result?.samples).toHaveLength(fixture.samples.length);
    result?.samples.forEach((sample, index) => {
      const expected = fixture.samples[index];
      expect(sample.label).toBe(expected.label);
      expect(sample.x).toBeCloseTo(expected.x, 8);
      expect(sample.z).toBeCloseTo(expected.z, 8);
      expect(sample.height).toBeCloseTo(expected.heightMeters, 8);
    });
  });

  test("keeps max height tolerance in map-space metres", () => {
    const result = computeScaledGroundingResult({
      anchorX: fixture.placement.position.x,
      anchorZ: fixture.placement.position.z,
      footprintDepthMeters: fixture.assetVersion.footprint.depthMeters,
      footprintWidthMeters: fixture.assetVersion.footprint.widthMeters,
      maxHeightDeltaMeters: fixture.invalidMaxHeightDeltaMeters,
      placementScale: fixture.placement.scale,
      sampleHeight: (point) => sampleHeight(point.x, point.z),
      yOffsetMeters: fixture.placement.yOffset,
      yawDegrees: fixture.placement.rotation.yaw,
    });

    expect(result?.valid).toBe(fixture.expected.invalidToleranceValid);
  });
});
