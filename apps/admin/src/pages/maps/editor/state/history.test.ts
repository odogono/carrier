import { describe, expect, test } from 'bun:test';
import { createStore } from 'jotai';

import { createPolygonDraft, createStaticEntityDraft } from '../helpers/drafts';
import {
  canRedoAtom,
  canUndoAtom,
  createEmptyEditorSnapshot,
  editorSnapshotAtom,
  recordEditorHistoryAtom,
  remapSnapshotForTransition,
  resetEditorHistoryAtom,
  snapshotsEqual
} from './history';

describe('editor history state', () => {
  test('records snapshots and clears redo on new history', () => {
    const store = createStore();
    const initial = createEmptyEditorSnapshot();
    const draft = createPolygonDraft();

    store.set(resetEditorHistoryAtom, initial);
    store.set(recordEditorHistoryAtom, {
      after: {
        ...initial,
        polygonControlPointDrafts: [],
        polygonDraft: {
          ...draft,
          vertices: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 10 }
          ]
        },
        tool: 'draw-polygon'
      },
      before: initial,
      remoteTransitions: []
    });

    expect(store.get(editorSnapshotAtom).polygonDraft?.vertices).toHaveLength(
      3
    );
    expect(store.get(canUndoAtom)).toBe(true);
    expect(store.get(canRedoAtom)).toBe(false);
  });

  test('remaps recreated polygon ids in selection and drafts', () => {
    const snapshot = {
      ...createEmptyEditorSnapshot(),
      polygonControlPointDrafts: [],
      polygonDraft: {
        ...createPolygonDraft({
          id: 'polygon-1',
          params: {
            maxDisplacementMeters: 12,
            noiseScaleMeters: 64,
            roughness: 0.5
          },
          vertices: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 10 }
          ]
        }),
        id: 'polygon-1'
      },
      selectedPolygonIds: ['polygon-1']
    };

    const remapped = remapSnapshotForTransition(
      snapshot,
      {
        after: [],
        afterCurrentIds: [],
        before: [
          {
            bbox: { maxX: 10, maxZ: 10, minX: 0, minZ: 0 },
            createdAt: '',
            id: 'polygon-1',
            mapId: 'map-1',
            params: {
              maxDisplacementMeters: 12,
              noiseScaleMeters: 64,
              roughness: 0.5
            },
            retiredAt: null,
            status: 'active',
            updatedAt: '',
            vertices: [
              { x: 0, z: 0 },
              { x: 10, z: 0 },
              { x: 10, z: 10 }
            ]
          }
        ],
        beforeCurrentIds: ['polygon-42'],
        kind: 'polygon',
        label: 'delete',
        side: 'before'
      },
      'before'
    );

    expect(remapped.selectedPolygonIds).toEqual(['polygon-42']);
    expect(remapped.polygonDraft?.id).toBe('polygon-42');
  });

  test('tracks entity selection and draft state in editor snapshots', () => {
    const snapshot = {
      ...createEmptyEditorSnapshot(),
      entityDraft: createStaticEntityDraft({
        archetypeId: 'watchtower',
        id: 'watchtower-1',
        label: 'North Tower',
        position: { x: 10, z: 20 },
        rotation: { yaw: 35 },
        scale: 1.25,
        state: 'active',
        yOffset: 0.5
      }),
      selectedEntityIds: ['watchtower-1'],
      tool: 'place-entity' as const
    };

    expect(
      snapshotsEqual(createEmptyEditorSnapshot(), snapshot)
    ).toBe(false);
    expect(snapshot.entityDraft?.label).toBe('North Tower');
    expect(snapshot.selectedEntityIds).toEqual(['watchtower-1']);
    expect(snapshot.tool).toBe('place-entity');
  });
});
