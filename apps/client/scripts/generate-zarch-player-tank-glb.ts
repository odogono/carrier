import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D
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
        queueMicrotask(() =>
          this.onloadend?.({ target: this } as ProgressEvent<FileReader>)
        );
      })
      .catch(error => {
        this.error =
          error instanceof DOMException
            ? error
            : new DOMException(String(error), 'ReadError');
        this.readyState = 2;
        queueMicrotask(() =>
          this.onerror?.({ target: this } as ProgressEvent<FileReader>)
        );
      });
  }
}

globalThis.FileReader = BunFileReader as typeof FileReader;

const OUTPUT_PATHS = [
  resolve(import.meta.dir, '../../../test-assets/low-poly-tank.glb'),
  resolve(import.meta.dir, '../../../assets/zarch/zarch-player-tank.glb')
];

const createMesh = (
  name: string,
  geometry: BoxGeometry | CylinderGeometry,
  material: MeshStandardMaterial
) => {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
};

const buildTank = () => {
  const root = new Group();
  root.name = 'ZarchPlayerTank';
  const hull = new Group();
  hull.name = 'Hull';
  root.add(hull);

  const green = new MeshStandardMaterial({
    color: 0x4f_73_42,
    flatShading: true
  });
  const darkGreen = new MeshStandardMaterial({
    color: 0x35_4f_31,
    flatShading: true
  });
  const track = new MeshStandardMaterial({
    color: 0x25_27_24,
    flatShading: true
  });
  const barrel = new MeshStandardMaterial({
    color: 0x2f_38_2c,
    flatShading: true
  });

  const chassis = createMesh('Chassis', new BoxGeometry(4.2, 1.2, 6.2), green);
  chassis.position.y = 1.15;
  hull.add(chassis);

  for (const side of [-1, 1]) {
    const trackMesh = createMesh(
      side < 0 ? 'TrackLeft' : 'TrackRight',
      new BoxGeometry(0.75, 1, 6.8),
      track
    );
    trackMesh.position.set(side * 2.15, 0.7, 0);
    hull.add(trackMesh);
  }

  const turret = new Group();
  turret.name = 'TurretPivot';
  turret.position.y = 1.8;
  hull.add(turret);
  const turretMesh = createMesh(
    'Turret',
    new CylinderGeometry(1.45, 1.7, 0.85, 8),
    darkGreen
  );
  turretMesh.position.y = 0.45;
  turret.add(turretMesh);

  const cannon = new Group();
  cannon.name = 'CannonPivot';
  cannon.position.set(0, 0.55, -0.6);
  cannon.rotation.x = (6 * Math.PI) / 180;
  turret.add(cannon);
  const cannonMesh = createMesh(
    'Cannon',
    new BoxGeometry(0.28, 0.28, 4.8),
    barrel
  );
  cannonMesh.position.z = -2.4;
  cannon.add(cannonMesh);

  const muzzle = new Object3D();
  muzzle.name = 'Muzzle';
  muzzle.position.z = -4.8;
  cannon.add(muzzle);

  return { materials: [green, darkGreen, track, barrel], root };
};

const exportBinaryGlb = (input: Group) =>
  new Promise<ArrayBuffer>((resolveExport, reject) => {
    new GLTFExporter().parse(
      input,
      gltf => {
        if (gltf instanceof ArrayBuffer) {
          resolveExport(gltf);
        } else {
          reject(new Error('Expected GLTFExporter to produce a binary GLB'));
        }
      },
      reject,
      { binary: true, onlyVisible: true }
    );
  });

const { materials, root } = buildTank();
const bytes = new Uint8Array(await exportBinaryGlb(root));

for (const outputPath of OUTPUT_PATHS) {
  mkdirSync(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, bytes);
  console.log(`Wrote ${outputPath} (${bytes.byteLength} bytes)`);
}

root.traverse(object => {
  if (object instanceof Mesh) {
    object.geometry.dispose();
  }
});
materials.forEach(material => material.dispose());
