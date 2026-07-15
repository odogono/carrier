import {
  MotionType,
  box,
  createWorld,
  createWorldSettings,
  cylinder,
  layers,
  registerShapes,
  rigidBody,
  sphere,
  triangleMesh,
  type BodyId,
  type Shape,
  type World
} from 'crashcat';

type StaticOwnerKind =
  | 'obstacle'
  | 'shoreline'
  | 'stream-boundary'
  | 'terrain'
  | 'vegetation'
  | 'water-surface';

export type ZarchPhysicsOwner = {
  id: string;
  kind: StaticOwnerKind | 'shell' | 'tank';
};

export type ZarchPhysicsLayers = Record<
  | 'obstacle'
  | 'shell'
  | 'shoreline'
  | 'streamBoundary'
  | 'tank'
  | 'terrain'
  | 'vegetation'
  | 'waterSurface',
  number
>;

type TriangleGeometry = {
  indices: number[];
  positions: number[];
};

let registered = false;

const registerZarchShapes = () => {
  if (registered) {
    return;
  }
  registerShapes([box.def, cylinder.def, sphere.def, triangleMesh.def]);
  registered = true;
};

const ownerKey = (owner: ZarchPhysicsOwner) => `${owner.kind}:${owner.id}`;

const createLayers = (worldLayers: ReturnType<typeof layers.create>) => {
  const notMoving = layers.addBroadphaseLayer(worldLayers);
  const moving = layers.addBroadphaseLayer(worldLayers);
  const result: ZarchPhysicsLayers = {
    obstacle: layers.addObjectLayer(worldLayers, notMoving),
    shell: layers.addObjectLayer(worldLayers, moving),
    shoreline: layers.addObjectLayer(worldLayers, notMoving),
    streamBoundary: layers.addObjectLayer(worldLayers, notMoving),
    tank: layers.addObjectLayer(worldLayers, moving),
    terrain: layers.addObjectLayer(worldLayers, notMoving),
    vegetation: layers.addObjectLayer(worldLayers, notMoving),
    waterSurface: layers.addObjectLayer(worldLayers, notMoving)
  };

  for (const staticLayer of [
    result.terrain,
    result.shoreline,
    result.obstacle,
    result.vegetation,
    result.streamBoundary
  ]) {
    layers.enableCollision(worldLayers, result.tank, staticLayer);
  }
  for (const staticLayer of [
    result.terrain,
    result.waterSurface,
    result.obstacle,
    result.vegetation
  ]) {
    layers.enableCollision(worldLayers, result.shell, staticLayer);
  }

  return result;
};

const objectLayerForOwner = (
  owner: ZarchPhysicsOwner,
  physicsLayers: ZarchPhysicsLayers
) => {
  switch (owner.kind) {
    case 'obstacle':
      return physicsLayers.obstacle;
    case 'shoreline':
      return physicsLayers.shoreline;
    case 'stream-boundary':
      return physicsLayers.streamBoundary;
    case 'terrain':
      return physicsLayers.terrain;
    case 'vegetation':
      return physicsLayers.vegetation;
    case 'water-surface':
      return physicsLayers.waterSurface;
    case 'shell':
      return physicsLayers.shell;
    case 'tank':
      return physicsLayers.tank;
  }
};

export type ZarchPhysicsWorld = {
  layers: ZarchPhysicsLayers;
  removeOwner: (owner: ZarchPhysicsOwner) => boolean;
  replaceStaticBoxBody: (
    owner: ZarchPhysicsOwner,
    settings: {
      center: [number, number, number];
      halfExtents: [number, number, number];
      yawRadians: number;
    }
  ) => BodyId;
  replaceStaticCylinderBody: (
    owner: ZarchPhysicsOwner,
    settings: {
      center: [number, number, number];
      halfHeight: number;
      radius: number;
    }
  ) => BodyId;
  replaceStaticTriangleBody: (
    owner: ZarchPhysicsOwner,
    geometry: TriangleGeometry,
    offset?: { x: number; z: number }
  ) => BodyId;
  world: World;
};

export type ZarchStaticCollider =
  | {
      center: [number, number, number];
      halfExtents: [number, number, number];
      owner: ZarchPhysicsOwner;
      shape: 'box';
      yawRadians: number;
    }
  | {
      center: [number, number, number];
      halfHeight: number;
      owner: ZarchPhysicsOwner;
      radius: number;
      shape: 'cylinder';
    }
  | {
      geometry: TriangleGeometry;
      offset?: { x: number; z: number };
      owner: ZarchPhysicsOwner;
      shape: 'triangle';
    };

export const createZarchPhysicsWorld = (): ZarchPhysicsWorld => {
  registerZarchShapes();
  const settings = createWorldSettings();
  const physicsLayers = createLayers(settings.layers);
  const world = createWorld(settings);
  const bodiesByOwner = new Map<string, BodyId>();

  const removeOwner = (owner: ZarchPhysicsOwner) => {
    const key = ownerKey(owner);
    const bodyId = bodiesByOwner.get(key);
    if (bodyId === undefined) {
      return false;
    }

    bodiesByOwner.delete(key);
    const body = rigidBody.get(world, bodyId);
    return body ? rigidBody.remove(world, body) : false;
  };

  const replaceStaticBody = ({
    owner,
    position,
    quaternion,
    shape
  }: {
    owner: ZarchPhysicsOwner;
    position: [number, number, number];
    quaternion?: [number, number, number, number];
    shape: Shape;
  }) => {
    removeOwner(owner);
    const body = rigidBody.create(world, {
      enhancedInternalEdgeRemoval: true,
      motionType: MotionType.STATIC,
      objectLayer: objectLayerForOwner(owner, physicsLayers),
      position,
      quaternion,
      shape,
      userData: owner
    });
    bodiesByOwner.set(ownerKey(owner), body.id);
    return body.id;
  };

  const replaceStaticTriangleBody = (
    owner: ZarchPhysicsOwner,
    geometry: TriangleGeometry,
    offset = { x: 0, z: 0 }
  ) =>
    replaceStaticBody({
      owner,
      position: [offset.x, 0, offset.z],
      shape: triangleMesh.create(geometry)
    });

  return {
    layers: physicsLayers,
    removeOwner,
    replaceStaticBoxBody: (owner, settings) =>
      replaceStaticBody({
        owner,
        position: settings.center,
        quaternion: [
          0,
          Math.sin(settings.yawRadians * 0.5),
          0,
          Math.cos(settings.yawRadians * 0.5)
        ],
        shape: box.create({ halfExtents: settings.halfExtents })
      }),
    replaceStaticCylinderBody: (owner, settings) =>
      replaceStaticBody({
        owner,
        position: settings.center,
        shape: cylinder.create({
          halfHeight: settings.halfHeight,
          radius: settings.radius
        })
      }),
    replaceStaticTriangleBody,
    world
  };
};

export const createZarchStaticColliderBridge = (physics: ZarchPhysicsWorld) => {
  const activeOwners = new Map<
    string,
    { owner: ZarchPhysicsOwner; signature: string }
  >();

  const clear = () => {
    for (const { owner } of activeOwners.values()) {
      physics.removeOwner(owner);
    }
    activeOwners.clear();
  };

  const sync = (colliders: ZarchStaticCollider[]) => {
    const desired = new Map(
      colliders.map(collider => [ownerKey(collider.owner), collider])
    );

    for (const [key, { owner }] of activeOwners) {
      if (!desired.has(key)) {
        physics.removeOwner(owner);
        activeOwners.delete(key);
      }
    }

    for (const [key, collider] of desired) {
      const signature = JSON.stringify(collider);
      if (activeOwners.get(key)?.signature === signature) {
        continue;
      }
      switch (collider.shape) {
        case 'box':
          physics.replaceStaticBoxBody(collider.owner, collider);
          break;
        case 'cylinder':
          physics.replaceStaticCylinderBody(collider.owner, collider);
          break;
        case 'triangle':
          physics.replaceStaticTriangleBody(
            collider.owner,
            collider.geometry,
            collider.offset
          );
          break;
      }
      activeOwners.set(key, { owner: collider.owner, signature });
    }
  };

  return { clear, sync };
};
