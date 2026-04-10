import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three';
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

const OUTPUT_PATH = resolve(import.meta.dir, '../../../test-assets/test-cube.glb');
const CUBE_SIZE_METERS = 2;

const exportBinaryGlb = (input: Scene) =>
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
  const scene = new Scene();
  const geometry = new BoxGeometry(CUBE_SIZE_METERS, CUBE_SIZE_METERS, CUBE_SIZE_METERS);
  const material = new MeshStandardMaterial({
    color: Number.parseInt('ff7a00', 16),
    flatShading: true
  });
  const cube = new Mesh(geometry, material);

  // Keep the origin at the bottom-center so placement rests on the ground plane.
  cube.position.y = CUBE_SIZE_METERS * 0.5;
  cube.name = 'test-cube';
  scene.add(cube);

  const bytes = new Uint8Array(await exportBinaryGlb(scene));
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  await Bun.write(OUTPUT_PATH, bytes);

  geometry.dispose();
  material.dispose();

  console.log(`Wrote ${OUTPUT_PATH} (${bytes.byteLength} bytes)`);
};

await run();
