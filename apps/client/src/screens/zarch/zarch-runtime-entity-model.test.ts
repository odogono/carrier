/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

import {
  createNormalizedModel,
  setModelShadowProps
} from '@/helpers/three-model-utils';

import { getZarchRuntimeEntityModelUrl } from './zarch-runtime-entity-model';

describe('zarch runtime entity model helpers', () => {
  test('normalizes imported models onto a centered grounded origin', () => {
    const mesh = new Mesh(new BoxGeometry(18, 4, 8), new MeshBasicMaterial());
    mesh.position.set(5, 6, -3);

    const source = new Group();
    source.add(mesh);

    const normalized = createNormalizedModel(source);

    expect(normalized.size.x).toBeCloseTo(18, 5);
    expect(normalized.size.y).toBeCloseTo(4, 5);
    expect(normalized.size.z).toBeCloseTo(8, 5);
    expect(normalized.object.position.y).toBe(0);

    const normalizedMesh = normalized.object.children[0] as Group;
    expect(normalizedMesh.position.x).toBeCloseTo(-5, 5);
    expect(normalizedMesh.position.y).toBeCloseTo(-4, 5);
    expect(normalizedMesh.position.z).toBeCloseTo(3, 5);
  });

  test('enables stable shadow flags on imported meshes', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const source = new Group();
    source.add(mesh);

    setModelShadowProps(source);

    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.frustumCulled).toBe(false);
  });

  test('builds the zarch runtime model endpoint URL from the stable id', () => {
    expect(getZarchRuntimeEntityModelUrl('zarch-player-ship')).toContain(
      '/zarch/runtime-entities/zarch-player-ship/model'
    );
  });
});
