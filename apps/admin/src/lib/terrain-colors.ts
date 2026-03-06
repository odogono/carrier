const WATER_LEVEL = -10;
const BASE_WATER_COLOR = 0x18_58_a0;
const HIGH_ROCK_COLOR = 0x8c_7a_58;
const UPPER_GRASS_COLOR = 0x7a_98_48;
const MID_GRASS_COLOR = 0x6a_aa_38;
const LOW_GRASS_COLOR = 0x88_b8_50;
const SHORE_COLOR = 0xc8_b8_78;

export type RgbTuple = [r: number, g: number, b: number];

const hexToRgb = (hex: number): RgbTuple => [
  (hex >> 16) & 0xff,
  (hex >> 8) & 0xff,
  hex & 0xff
];

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Deterministic per-tile hash matching the client's tileHash
 * (apps/client/src/helpers/zarch-terrain.ts:83-86)
 */
export const tileHash = (gx: number, gz: number) => {
  const value = Math.sin(gx * 127.1 + gz * 311.7) * 43_758.5453;
  return value - Math.floor(value);
};

const rgbToHsl = (r: number, g: number, b: number): [h: number, s: number, l: number] => {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;

  if (max === rf) {
    h = (gf - bf) / d + (gf < bf ? 6 : 0);
  } else if (max === gf) {
    h = (bf - rf) / d + 2;
  } else {
    h = (rf - gf) / d + 4;
  }

  return [h / 6, s, l];
};

const hue2rgb = (p: number, q: number, t: number) => {
  const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;

  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

const hslToRgb = (h: number, s: number, l: number): RgbTuple => {
  if (s === 0) {
    const v = clamp255(l * 255);
    return [v, v, v];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    clamp255(hue2rgb(p, q, h + 1 / 3) * 255),
    clamp255(hue2rgb(p, q, h) * 255),
    clamp255(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
};

/**
 * Compute the RGB color for a tile at (gx, gz) with the given average elevation.
 * Matches the client's applyTileColor (apps/client/src/helpers/zarch-terrain.ts:96-123).
 */
export const tileColorRgb = (gx: number, gz: number, elevation: number): RgbTuple => {
  if (elevation < WATER_LEVEL) {
    const depthVariation = tileHash(gx, gz) * 0.08;
    const [r, g, b] = hexToRgb(BASE_WATER_COLOR);
    const [h, s, l] = rgbToHsl(r, g, b);
    return hslToRgb(h, s, Math.max(0, Math.min(1, l + depthVariation - 0.04)));
  }

  const jitteredElevation = elevation + (tileHash(gx, gz) - 0.5) * 6;

  let baseColor: number;

  if (jitteredElevation > 18) {
    baseColor = HIGH_ROCK_COLOR;
  } else if (jitteredElevation > 10) {
    baseColor = UPPER_GRASS_COLOR;
  } else if (jitteredElevation > 2) {
    baseColor = MID_GRASS_COLOR;
  } else if (jitteredElevation > -4) {
    baseColor = LOW_GRASS_COLOR;
  } else {
    baseColor = SHORE_COLOR;
  }

  const [r, g, b] = hexToRgb(baseColor);
  const brightnessVariation = 0.88 + tileHash(gz * 3 + 5, gx * 7 + 3) * 0.24;

  return [
    clamp255(r * brightnessVariation),
    clamp255(g * brightnessVariation),
    clamp255(b * brightnessVariation)
  ];
};
