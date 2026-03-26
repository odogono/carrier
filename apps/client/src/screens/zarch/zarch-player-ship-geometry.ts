import { BufferGeometry, Float32BufferAttribute } from 'three';

type PlayerShipFace = {
  color: number;
  vertices: [number, number, number];
};

const FIXED_24_SHIFT = 16_777_216;
export const PLAYER_SHIP_LENGTH = 18;

const fromFixed24 = (valueHex: string) => {
  const value = Number.parseInt(valueHex, 16);
  const signed = value > 2_147_483_647 ? value - 4_294_967_296 : value;
  return signed / FIXED_24_SHIFT;
};

const rotateIntoSceneFrame = ({
  x,
  y,
  z
}: {
  x: number;
  y: number;
  z: number;
}) => ({
  x,
  y,
  z: -z
});

const FACE_COLORS = {
  '040': Number.parseInt('55cc88', 16),
  '044': Number.parseInt('888888', 16),
  '080': Number.parseInt('88ff88', 16),
  '088': Number.parseInt('66ccff', 16),
  c80: Number.parseInt('ffaa44', 16)
} as const;

export const PLAYER_SHIP_BLUEPRINT_VERTICES = [
  ['01000000', '00500000', '00800000'],
  ['01000000', '00500000', 'ff800000'],
  ['00000000', '000a0000', 'fecccccd'],
  ['ff19999a', '00500000', '00000000'],
  ['00000000', '000a0000', '01333333'],
  ['ffe66667', 'ff880000', '00000000'],
  ['00555555', '00500000', '00400000'],
  ['00555555', '00500000', 'ffc00000'],
  ['ffcccccd', '00500000', '00000000']
] as const;

export const PLAYER_SHIP_BLUEPRINT_FACES: readonly PlayerShipFace[] = [
  { color: FACE_COLORS['080'], vertices: [0, 1, 5] },
  { color: FACE_COLORS['040'], vertices: [1, 2, 5] },
  { color: FACE_COLORS['040'], vertices: [0, 5, 4] },
  { color: FACE_COLORS['040'], vertices: [2, 3, 5] },
  { color: FACE_COLORS['040'], vertices: [3, 4, 5] },
  { color: FACE_COLORS['088'], vertices: [1, 2, 3] },
  { color: FACE_COLORS['088'], vertices: [0, 3, 4] },
  { color: FACE_COLORS['044'], vertices: [0, 1, 3] },
  { color: FACE_COLORS.c80, vertices: [6, 7, 8] }
] as const;

export const PLAYER_SHIP_BLUEPRINT = {
  faces: PLAYER_SHIP_BLUEPRINT_FACES,
  vertices: PLAYER_SHIP_BLUEPRINT_VERTICES.map(([x, y, z]) =>
    rotateIntoSceneFrame({
      x: fromFixed24(x),
      y: fromFixed24(y),
      z: fromFixed24(z)
    })
  )
} as const;

const toColorComponents = (color: number) => [
  ((color >> 16) & 0xff) / 255,
  ((color >> 8) & 0xff) / 255,
  (color & 0xff) / 255
];

export const createPlayerShipGeometry = (targetLength = PLAYER_SHIP_LENGTH) => {
  const minX = Math.min(...PLAYER_SHIP_BLUEPRINT.vertices.map(vertex => vertex.x));
  const maxX = Math.max(...PLAYER_SHIP_BLUEPRINT.vertices.map(vertex => vertex.x));
  const scale = targetLength / Math.max(maxX - minX, 0.001);
  const positions: number[] = [];
  const colors: number[] = [];

  for (const face of PLAYER_SHIP_BLUEPRINT.faces) {
    const [r, g, b] = toColorComponents(face.color);

    for (const index of face.vertices) {
      const vertex = PLAYER_SHIP_BLUEPRINT.vertices[index];
      positions.push(vertex.x * scale, vertex.y * scale, vertex.z * scale);
      colors.push(r, g, b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};
