import {
  getSurfaceMaterialColorRgb,
  resolveSurfaceMaterial,
  type MapSurfaceMaterial,
  type RgbTuple
} from 'carrier-contracts';

/**
 * Compute the RGB color for a tile at (gx, gz) with the given average elevation
 * and an optional explicit material override.
 */
export const tileColorRgb = (
  gx: number,
  gz: number,
  elevation: number,
  material?: MapSurfaceMaterial | null
): RgbTuple =>
  getSurfaceMaterialColorRgb(
    resolveSurfaceMaterial(gx, gz, elevation, material),
    gx,
    gz
  );
