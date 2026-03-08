export const MAP_SURFACE_MATERIALS = [
  'default',
  'water',
  'shore',
  'grass-low',
  'grass-mid',
  'grass-high',
  'rock',
  'road',
  'damage'
] as const;

export type MapSurfaceMaterial = (typeof MAP_SURFACE_MATERIALS)[number];

const WATER_LEVEL = -10;

const BASE_WATER_COLOR: readonly [number, number, number] = [0x18, 0x58, 0xa0];
const SHORE_COLOR: readonly [number, number, number] = [0xc8, 0xb8, 0x78];
const LOW_GRASS_COLOR: readonly [number, number, number] = [0x88, 0xb8, 0x50];
const MID_GRASS_COLOR: readonly [number, number, number] = [0x6a, 0xaa, 0x38];
const HIGH_GRASS_COLOR: readonly [number, number, number] = [0x7a, 0x98, 0x48];
const ROCK_COLOR: readonly [number, number, number] = [0x8c, 0x7a, 0x58];
const ROAD_COLOR: readonly [number, number, number] = [0x60, 0x5a, 0x54];
const DAMAGE_COLOR: readonly [number, number, number] = [0xa2, 0x4d, 0x2c];

export type RgbTuple = [r: number, g: number, b: number];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp255 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const tileHash = (gx: number, gz: number) => {
  const value = Math.sin(gx * 127.1 + gz * 311.7) * 43_758.5453;
  return value - Math.floor(value);
};

const rgbToHsl = (
  r: number,
  g: number,
  b: number
): [h: number, s: number, l: number] => {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) * 0.5;

  if (max === min) {
    return [0, 0, l];
  }

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h = 0;

  if (max === rf) {
    h = (gf - bf) / delta + (gf < bf ? 6 : 0);
  } else if (max === gf) {
    h = (bf - rf) / delta + 2;
  } else {
    h = (rf - gf) / delta + 4;
  }

  return [h / 6, s, l];
};

const hue2rgb = (p: number, q: number, t: number) => {
  const normalized = t < 0 ? t + 1 : t > 1 ? t - 1 : t;

  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
};

const hslToRgb = (h: number, s: number, l: number): RgbTuple => {
  if (s === 0) {
    const value = clamp255(l * 255);
    return [value, value, value];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    clamp255(hue2rgb(p, q, h + 1 / 3) * 255),
    clamp255(hue2rgb(p, q, h) * 255),
    clamp255(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
};

const scaleRgb = ([r, g, b]: readonly [number, number, number], amount: number): RgbTuple => [
  clamp255(r * amount),
  clamp255(g * amount),
  clamp255(b * amount)
];

export const classifySurfaceMaterialFromElevation = (
  gx: number,
  gz: number,
  elevation: number
): MapSurfaceMaterial => {
  if (elevation < WATER_LEVEL) {
    return 'water';
  }

  const jitteredElevation = elevation + (tileHash(gx, gz) - 0.5) * 6;

  if (jitteredElevation > 18) {
    return 'rock';
  }
  if (jitteredElevation > 10) {
    return 'grass-high';
  }
  if (jitteredElevation > 2) {
    return 'grass-mid';
  }
  if (jitteredElevation > -4) {
    return 'grass-low';
  }

  return 'shore';
};

export const getSurfaceMaterialColorRgb = (
  material: MapSurfaceMaterial,
  gx: number,
  gz: number
): RgbTuple => {
  if (material === 'water') {
    const depthVariation = tileHash(gx, gz) * 0.08;
    const [h, s, l] = rgbToHsl(
      BASE_WATER_COLOR[0],
      BASE_WATER_COLOR[1],
      BASE_WATER_COLOR[2]
    );
    return hslToRgb(h, s, clamp01(l + depthVariation - 0.04));
  }

  const brightnessVariation = 0.88 + tileHash(gz * 3 + 5, gx * 7 + 3) * 0.24;

  if (material === 'shore') {
    return scaleRgb(SHORE_COLOR, brightnessVariation);
  }
  if (material === 'grass-low') {
    return scaleRgb(LOW_GRASS_COLOR, brightnessVariation);
  }
  if (material === 'grass-mid') {
    return scaleRgb(MID_GRASS_COLOR, brightnessVariation);
  }
  if (material === 'grass-high') {
    return scaleRgb(HIGH_GRASS_COLOR, brightnessVariation);
  }
  if (material === 'rock') {
    return scaleRgb(ROCK_COLOR, brightnessVariation);
  }
  if (material === 'road') {
    return scaleRgb(ROAD_COLOR, brightnessVariation);
  }
  if (material === 'damage') {
    return scaleRgb(DAMAGE_COLOR, brightnessVariation);
  }

  return scaleRgb(MID_GRASS_COLOR, brightnessVariation);
};

export const resolveSurfaceMaterial = (
  gx: number,
  gz: number,
  elevation: number,
  material?: MapSurfaceMaterial | null
) => material ?? classifySurfaceMaterialFromElevation(gx, gz, elevation);
