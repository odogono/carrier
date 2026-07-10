import { isInfiniteMap, type MapMetadata } from 'carrier-contracts/types';

import type { EditorTool } from '../helpers';
import type { EditorSnapshot } from '../state/history';

export type MapEditorCapabilities = {
  canEditAuthoredGeometry: boolean;
  canEditStaticEntities: boolean;
  canEditTerrain: boolean;
  canInspectStaticEntities: boolean;
  hasOverviewAuthoring: boolean;
};

export type SidebarTab = 'selection' | 'entities' | 'islands' | 'overview';

const GEOMETRY_ONLY_TOOLS = new Set<EditorTool>([
  'draw-polygon',
  'edit-vertices',
  'place-control-point'
]);

export const getMapEditorCapabilities = (
  map: MapMetadata | null | undefined
): MapEditorCapabilities => {
  if (!map) {
    return {
      canEditAuthoredGeometry: false,
      canEditStaticEntities: false,
      canEditTerrain: false,
      canInspectStaticEntities: false,
      hasOverviewAuthoring: false
    };
  }

  const infinite = isInfiniteMap(map);
  const exported =
    map.kind === 'finite-vector-slice' || map.kind === 'wrapped-classic-slice';

  return {
    canEditAuthoredGeometry: infinite,
    canEditStaticEntities: !exported,
    canEditTerrain: !exported,
    canInspectStaticEntities: true,
    hasOverviewAuthoring: infinite
  };
};

export const getAvailableEditorTools = (
  capabilities: MapEditorCapabilities
): EditorTool[] => {
  const tools: EditorTool[] = ['select', 'pan'];

  if (capabilities.canEditTerrain) {
    tools.push('terrain');
  }

  if (capabilities.canEditStaticEntities) {
    tools.push('place-entity');
  }

  if (capabilities.canEditAuthoredGeometry) {
    tools.push('draw-polygon', 'edit-vertices', 'place-control-point');
  }

  return tools;
};

export const getAvailableSidebarTabs = (
  capabilities: MapEditorCapabilities
): SidebarTab[] => {
  const tabs: SidebarTab[] = ['selection'];

  if (capabilities.canInspectStaticEntities) {
    tabs.push('entities');
  }

  if (capabilities.canEditAuthoredGeometry) {
    tabs.push('islands');
  }

  if (capabilities.hasOverviewAuthoring) {
    tabs.push('overview');
  }

  return tabs;
};

export const sanitizeEditorSnapshotForCapabilities = (
  snapshot: EditorSnapshot,
  capabilities: MapEditorCapabilities
): EditorSnapshot => {
  const nextTool =
    GEOMETRY_ONLY_TOOLS.has(snapshot.tool) &&
    !capabilities.canEditAuthoredGeometry
      ? capabilities.canEditTerrain
        ? 'terrain'
        : 'select'
      : snapshot.tool === 'terrain' && !capabilities.canEditTerrain
        ? 'select'
        : snapshot.tool === 'place-entity' &&
            !capabilities.canEditStaticEntities
          ? 'select'
          : snapshot.tool;

  if (capabilities.canEditAuthoredGeometry) {
    if (nextTool === snapshot.tool) {
      return snapshot;
    }

    return {
      ...snapshot,
      tool: nextTool
    };
  }

  return {
    ...snapshot,
    controlPointDraft: null,
    islandDraft: null,
    polygonControlPointDrafts: [],
    polygonDraft: null,
    selectedControlPointId: null,
    selectedIslandId: null,
    selectedPolygonIds: [],
    tool: nextTool
  };
};
