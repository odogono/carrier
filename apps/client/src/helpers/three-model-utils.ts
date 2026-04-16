import { Box3, Group, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type NormalizedModel = {
  object: Group;
  size: Vector3;
};

const gltfLoader = new GLTFLoader();

export const isMeshObject = (object: Object3D): object is Mesh =>
  (object as Mesh & { isMesh?: boolean }).isMesh === true;

export const setModelShadowProps = (object: Object3D) => {
  object.traverse(child => {
    if (!isMeshObject(child)) {
      return;
    }

    child.castShadow = true;
    child.frustumCulled = false;
    child.receiveShadow = true;
  });
};

export const createNormalizedModel = (source: Object3D): NormalizedModel => {
  const clone = source.clone(true);
  const group = new Group();
  group.add(clone);

  const bounds = new Box3().setFromObject(group);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());

  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= bounds.min.y;

  return {
    object: group,
    size
  };
};

export const fetchAndParseGltf = async (url: string, errorLabel: string) => {
  const response = await fetch(url, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${errorLabel}`);
  }

  return gltfLoader.parseAsync(await response.arrayBuffer(), url);
};
