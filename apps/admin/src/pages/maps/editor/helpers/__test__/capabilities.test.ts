import { describe, expect, test } from 'bun:test';
import type { MapMetadata } from 'carrier-contracts/types';

import { createEmptyEditorSnapshot } from '../../state/history';
import {
  getAvailableEditorTools,
  getAvailableSidebarTabs,
  getMapEditorCapabilities,
  sanitizeEditorSnapshotForCapabilities
} from '../capabilities';

const wrappedClassicMap: MapMetadata = {
  createdAt: new Date().toISOString(),
  extent: {
    heightMeters: 1280,
    heightTiles: 128,
    kind: 'finite',
    widthMeters: 1280,
    widthTiles: 128,
    wrapX: true,
    wrapZ: true
  },
  generator: 'diamond-square',
  id: 'wrapped-1',
  kind: 'wrapped-classic',
  name: 'Wrapped',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 3,
  seed: 'seed',
  updatedAt: new Date().toISOString()
};

const infiniteVectorMap: MapMetadata = {
  createdAt: new Date().toISOString(),
  extent: { kind: 'infinite' },
  id: 'vector-1',
  kind: 'infinite-vector',
  name: 'Infinite',
  resolution: {
    chunkSizeTiles: 32,
    metersPerTile: 10
  },
  revision: 4,
  seed: 'seed',
  updatedAt: new Date().toISOString()
};

describe('map editor capabilities', () => {
  test('enables terrain and entity editing for wrapped-classic maps', () => {
    const capabilities = getMapEditorCapabilities(wrappedClassicMap);

    expect(capabilities).toEqual({
      canEditAuthoredGeometry: false,
      canEditStaticEntities: true,
      canEditTerrain: true,
      canInspectStaticEntities: true,
      hasOverviewAuthoring: false
    });
    expect(getAvailableEditorTools(capabilities)).toEqual([
      'select',
      'pan',
      'terrain',
      'place-entity'
    ]);
    expect(getAvailableSidebarTabs(capabilities)).toEqual([
      'selection',
      'entities'
    ]);
  });

  test('retains full editor capabilities for infinite-vector maps', () => {
    const capabilities = getMapEditorCapabilities(infiniteVectorMap);

    expect(capabilities).toEqual({
      canEditAuthoredGeometry: true,
      canEditStaticEntities: true,
      canEditTerrain: true,
      canInspectStaticEntities: true,
      hasOverviewAuthoring: true
    });
    expect(getAvailableEditorTools(capabilities)).toEqual([
      'select',
      'pan',
      'terrain',
      'place-entity',
      'draw-polygon',
      'edit-vertices',
      'place-control-point'
    ]);
    expect(getAvailableSidebarTabs(capabilities)).toEqual([
      'selection',
      'entities',
      'islands',
      'overview'
    ]);
  });

  test('strips geometry-only snapshot state when wrapped-classic capabilities apply', () => {
    const snapshot = {
      ...createEmptyEditorSnapshot(),
      controlPointDraft: {
        elevationMeters: 10,
        id: 'control-1',
        influenceMeters: 50,
        kind: 'edit' as const,
        strength: 1,
        type: 'plain' as const,
        x: 10,
        z: 20
      },
      islandDraft: {
        defaultFaction: '',
        defaultOwner: '',
        id: 'island-1',
        name: 'Island'
      },
      polygonControlPointDrafts: [
        {
          elevationMeters: 2,
          id: 'control-2',
          influenceMeters: 25,
          kind: 'edit' as const,
          strength: 0.5,
          type: 'plain' as const,
          x: 5,
          z: 6
        }
      ],
      polygonDraft: {
        id: 'polygon-1',
        kind: 'edit' as const,
        params: {
          interiorFill: 0.8,
          maxDisplacementMeters: 10,
          noiseScaleMeters: 100,
          roughness: 0.5
        },
        selectedVertexIndex: 0,
        vertices: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 0, z: 10 }
        ]
      },
      selectedControlPointId: 'control-1',
      selectedIslandId: 'island-1',
      selectedPolygonIds: ['polygon-1'],
      tool: 'draw-polygon' as const
    };

    expect(
      sanitizeEditorSnapshotForCapabilities(
        snapshot,
        getMapEditorCapabilities(wrappedClassicMap)
      )
    ).toEqual({
      ...createEmptyEditorSnapshot(),
      tool: 'terrain'
    });
  });

  test('keeps exported maps inspectable while disabling terrain and entity editing', () => {
    const exportedMap: MapMetadata = {
      ...wrappedClassicMap,
      export: {
        bounds: {
          maxX: 320,
          maxZ: 320,
          minX: 0,
          minZ: 0
        },
        exportedAt: new Date().toISOString(),
        sourceMapId: 'source-1',
        sourceRevision: 2
      },
      id: 'export-1',
      kind: 'finite-vector-slice',
      name: 'Exported Map'
    };
    const capabilities = getMapEditorCapabilities(exportedMap);

    expect(capabilities).toEqual({
      canEditAuthoredGeometry: false,
      canEditStaticEntities: false,
      canEditTerrain: false,
      canInspectStaticEntities: true,
      hasOverviewAuthoring: false
    });
    expect(getAvailableEditorTools(capabilities)).toEqual(['select', 'pan']);
    expect(getAvailableSidebarTabs(capabilities)).toEqual([
      'selection',
      'entities'
    ]);
    expect(
      sanitizeEditorSnapshotForCapabilities(
        {
          ...createEmptyEditorSnapshot(),
          selectedEntityIds: ['entity-1'],
          tool: 'place-entity'
        },
        capabilities
      )
    ).toEqual({
      ...createEmptyEditorSnapshot(),
      selectedEntityIds: ['entity-1'],
      tool: 'select'
    });
  });
});
