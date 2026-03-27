import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class BunFileReader {
  error: DOMException | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onloadend: ((event: ProgressEvent<FileReader>) => void) | null = null;
  readyState = 0;
  result: ArrayBuffer | string | null = null;

  readAsArrayBuffer(blob: Blob) {
    this.readyState = 1;
    blob
      .arrayBuffer()
      .then(result => {
        this.result = result;
        this.readyState = 2;
        queueMicrotask(() => {
          this.onloadend?.({ target: this } as ProgressEvent<FileReader>);
        });
      })
      .catch(error => {
        this.error =
          error instanceof DOMException
            ? error
            : new DOMException(String(error), 'ReadError');
        this.readyState = 2;
        queueMicrotask(() => {
          this.onerror?.({ target: this } as ProgressEvent<FileReader>);
        });
      });
  }
}

globalThis.FileReader = BunFileReader as typeof FileReader;

type PlayerShipFace = {
  color: number;
  vertices: [number, number, number];
};

const OUTPUT_PATH = resolve(import.meta.dir, '../../../assets/zarch/zarch-player-ship.glb');
const FIXED_24_SHIFT = 16_777_216;
const PLAYER_SHIP_LENGTH = 18;

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

const PLAYER_SHIP_BLUEPRINT_VERTICES = [
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

const PLAYER_SHIP_BLUEPRINT_FACES: readonly PlayerShipFace[] = [
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

const PLAYER_SHIP_BLUEPRINT = {
  faces: PLAYER_SHIP_BLUEPRINT_FACES,
  vertices: PLAYER_SHIP_BLUEPRINT_VERTICES.map(([x, y, z]) =>
    rotateIntoSceneFrame({
      x: fromFixed24(x),
      y: fromFixed24(y),
      z: fromFixed24(z)
    })
  )
} as const;

const createScaledBlueprintVertices = (targetLength = PLAYER_SHIP_LENGTH) => {
  const minX = Math.min(...PLAYER_SHIP_BLUEPRINT.vertices.map(vertex => vertex.x));
  const maxX = Math.max(...PLAYER_SHIP_BLUEPRINT.vertices.map(vertex => vertex.x));
  const scale = targetLength / Math.max(maxX - minX, 0.001);
  return PLAYER_SHIP_BLUEPRINT.vertices.map(vertex => ({
    x: vertex.x * scale,
    y: vertex.y * scale,
    z: vertex.z * scale
  }));
};

const exportBinaryGlb = (input: Group) =>
  new Promise<ArrayBuffer>((resolveExport, reject) => {
    new GLTFExporter().parse(
      input,
      gltf => {
        if (gltf instanceof ArrayBuffer) {
          resolveExport(gltf);
          return;
        }

        reject(new Error('Expected GLTFExporter to produce a binary GLB'));
      },
      reject,
      {
        binary: true,
        onlyVisible: true
      }
    );
  });

const run = async () => {
  const group = new Group();
  const scaledVertices = createScaledBlueprintVertices();
  const facesByColor = new Map<number, PlayerShipFace[]>();

  for (const face of PLAYER_SHIP_BLUEPRINT.faces) {
    const bucket = facesByColor.get(face.color) ?? [];
    bucket.push(face);
    facesByColor.set(face.color, bucket);
  }

  const geometries: BufferGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];

  for (const [color, faces] of facesByColor) {
    const positions: number[] = [];

    for (const face of faces) {
      for (const index of face.vertices) {
        const vertex = scaledVertices[index]!;
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const material = new MeshStandardMaterial({
      color,
      flatShading: true,
      side: DoubleSide
    });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.set(0, -Math.PI * 0.5, Math.PI);

    geometries.push(geometry);
    materials.push(material);
    group.add(mesh);
  }

  const bytes = new Uint8Array(await exportBinaryGlb(group));
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  await Bun.write(OUTPUT_PATH, bytes);

  for (const geometry of geometries) {
    geometry.dispose();
  }

  for (const material of materials) {
    material.dispose();
  }

  console.log(`Wrote ${OUTPUT_PATH} (${bytes.byteLength} bytes)`);
};

await run();
