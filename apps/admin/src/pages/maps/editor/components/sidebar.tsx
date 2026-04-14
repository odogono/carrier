import type {
  Archetype,
  AssetVersion,
  ControlPoint,
  DerivedIsland,
  SourcePolygon,
  StaticEntity,
  StaticEntityListItem,
  WorldBounds,
  WorldPoint
} from 'carrier-contracts/types';
import type { ZarchTileEditState, ZarchTileState } from 'carrier-terrain-edit';
import {
  Compass,
  Focus,
  Layers3,
  Package,
  Plus,
  Save,
  Trash2
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { type TerrainRenderLayer } from '@/lib/terrain-render';
import { cn } from '@/lib/utils';

import {
  DEFAULT_SOURCE_POLYGON_PARAMS,
  canSavePolygonDraft,
  nextOrderedSelection,
  type EditorTool,
  type StaticEntityGroundingDiagnostics
} from '../helpers';
import type {
  MapEditorCapabilities,
  SidebarTab
} from '../helpers/capabilities';
import {
  createControlPointDraft,
  createIslandDraft,
  createPolygonDraft,
  parseNumber
} from '../helpers/drafts';
import type {
  ControlPointDraft,
  IslandDraft,
  PolygonDraft,
  StaticEntityDraft
} from '../helpers/types';
import { OverviewPane } from './overview-pane';

type StaticEntitySidebarItem = StaticEntityListItem & {
  assetVersion: AssetVersion | null;
  diagnostics: StaticEntityGroundingDiagnostics;
};

type EditorSidebarProps = {
  activeCatalogArchetypeId: string | null;
  activeCatalogCategory: StaticEntityListItem['archetype']['category'] | 'all';
  activeCatalogSearch: string;
  activeOutlinerArchetypeId: string | 'all';
  activeOutlinerCategory: StaticEntityListItem['archetype']['category'] | 'all';
  activeOutlinerSearch: string;
  activeTool: EditorTool;
  activeToolLabel: string;
  availableTabs: SidebarTab[];
  bulkScaleDraft: string;
  bulkStateDraft: StaticEntity['state'];
  capabilities: MapEditorCapabilities;
  catalogArchetypes: Archetype[];
  controlPointDraft: ControlPointDraft | null;
  counts: {
    controlPoints: number;
    derivedIslands: number;
    sourcePolygons: number;
    staticEntities: number;
  };
  currentControlPointForInspector: ControlPointDraft | null;
  currentEntityForInspector: StaticEntityDraft | null;
  currentPolygonForInspector: PolygonDraft | null;
  derivedIslands: DerivedIsland[];
  entityDirty: boolean;
  islandDraft: IslandDraft | null;
  islandInspectorDraft: IslandDraft | null;
  nextActionHint: string;
  onApplyBulkEntityEdit: (draft: {
    scale?: number;
    state?: StaticEntity['state'];
  }) => void;
  onBeginControlPoint: () => void;
  onBeginDrawPolygon: () => void;
  onBeginPlaceEntity: () => void;
  onBeginTerrain: () => void;
  onDuplicateStaticEntities: () => void;
  onJumpToEntity: (entity: StaticEntitySidebarItem) => void;
  onPickCatalogArchetype: (archetypeId: string) => void;
  onRecenter: (point: Pick<WorldPoint, 'x' | 'z'>) => void;
  onResetControlPointDraft: () => void;
  onResetEntityDraft: () => void;
  onResetPolygonDraft: () => void;
  onSaveControlPointDraft: () => void;
  onSaveEntityDraft: () => void;
  onSaveIslandDraft: () => void;
  onSavePolygonDraft: () => void;
  onSelectIsland: (
    islandId: string,
    options?: { additive?: boolean; recenter?: boolean }
  ) => void;
  onSelectStaticEntities: (entityIds: string[], record?: boolean) => void;
  onSelectTool: (tool: EditorTool) => void;
  onSetBulkScaleDraft: (value: string) => void;
  onSetBulkStateDraft: (value: StaticEntity['state']) => void;
  onSetCatalogCategory: (
    value: StaticEntityListItem['archetype']['category'] | 'all'
  ) => void;
  onSetCatalogSearch: (value: string) => void;
  onSetOutlinerArchetypeId: (value: string | 'all') => void;
  onSetOutlinerCategory: (
    value: StaticEntityListItem['archetype']['category'] | 'all'
  ) => void;
  onSetOutlinerSearch: (value: string) => void;
  overviewBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null;
  overviewClusters: ReadonlyArray<{
    bbox: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>;
    controlPointCount: number;
    derivedIslandCount: number;
    sourcePolygonCount: number;
  }>;
  pendingAction: boolean;
  polygonDirty: boolean;
  polygonDraft: PolygonDraft | null;
  referencedArchetypeIds: Set<string>;
  selectedControlPoint: ControlPoint | null;
  selectedEntity: StaticEntitySidebarItem | null;
  selectedEntityCount: number;
  selectedEntityIds: string[];
  selectedIsland: DerivedIsland | null;
  selectedIslandCount: number;
  selectedIslandIds: string[];
  selectedPolygon: SourcePolygon | null;
  selectedPolygonCount: number;
  selectionSummary: string;
  setControlPointDraft: (
    value:
      | ControlPointDraft
      | null
      | ((current: ControlPointDraft | null) => ControlPointDraft | null),
    record?: boolean
  ) => void;
  setDeleteTarget: React.Dispatch<
    React.SetStateAction<
      | { id: string; kind: 'control-point' }
      | { id: string; kind: 'polygon' }
      | { ids: string[]; kind: 'static-entity' }
      | null
    >
  >;
  setEntityDraft: (
    value:
      | StaticEntityDraft
      | null
      | ((current: StaticEntityDraft | null) => StaticEntityDraft | null),
    record?: boolean
  ) => void;
  setIslandDraft: (
    value:
      | IslandDraft
      | null
      | ((current: IslandDraft | null) => IslandDraft | null),
    record?: boolean
  ) => void;
  setPolygonDraft: (
    value:
      | PolygonDraft
      | null
      | ((current: PolygonDraft | null) => PolygonDraft | null),
    record?: boolean
  ) => void;
  staticEntityItems: StaticEntitySidebarItem[];
  terrainDirtyCount: number;
  terrainInspectedTile: ZarchTileState | null;
  terrainLayer: TerrainRenderLayer;
  terrainPreviewHaloCount: number;
  terrainSelectedHeightTileCount: number;
  terrainState: ZarchTileEditState;
  viewportBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null;
};

export const EditorSidebar = ({
  activeCatalogArchetypeId,
  activeCatalogCategory,
  activeCatalogSearch,
  activeOutlinerArchetypeId,
  activeOutlinerCategory,
  activeOutlinerSearch,
  activeTool,
  activeToolLabel,
  availableTabs,
  bulkScaleDraft,
  bulkStateDraft,
  capabilities,
  catalogArchetypes,
  controlPointDraft,
  counts,
  currentControlPointForInspector,
  currentEntityForInspector,
  currentPolygonForInspector,
  derivedIslands,
  entityDirty,
  islandDraft,
  islandInspectorDraft,
  nextActionHint,
  onApplyBulkEntityEdit,
  onBeginControlPoint,
  onBeginDrawPolygon,
  onBeginPlaceEntity,
  onBeginTerrain,
  onDuplicateStaticEntities,
  onJumpToEntity,
  onPickCatalogArchetype,
  onRecenter,
  onResetControlPointDraft,
  onResetEntityDraft,
  onResetPolygonDraft,
  onSaveControlPointDraft,
  onSaveEntityDraft,
  onSaveIslandDraft,
  onSavePolygonDraft,
  onSelectIsland,
  onSelectStaticEntities,
  onSelectTool,
  onSetBulkScaleDraft,
  onSetBulkStateDraft,
  onSetCatalogCategory,
  onSetCatalogSearch,
  onSetOutlinerArchetypeId,
  onSetOutlinerCategory,
  onSetOutlinerSearch,
  overviewBounds,
  overviewClusters,
  pendingAction,
  polygonDirty,
  polygonDraft,
  referencedArchetypeIds,
  selectedControlPoint,
  selectedEntity,
  selectedEntityCount,
  selectedEntityIds,
  selectedIsland,
  selectedIslandCount,
  selectedIslandIds,
  selectedPolygon,
  selectedPolygonCount,
  selectionSummary,
  setControlPointDraft,
  setDeleteTarget,
  setEntityDraft,
  setIslandDraft,
  setPolygonDraft,
  staticEntityItems,
  terrainDirtyCount,
  terrainInspectedTile,
  terrainLayer,
  terrainPreviewHaloCount,
  terrainSelectedHeightTileCount,
  terrainState,
  viewportBounds
}: EditorSidebarProps) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    availableTabs[0] ?? 'selection'
  );
  const canEditAuthoredGeometry = capabilities.canEditAuthoredGeometry;
  const hasOverviewAuthoring = capabilities.hasOverviewAuthoring;
  const resolvedActiveTab = availableTabs.includes(activeTab)
    ? activeTab
    : (availableTabs[0] ?? 'selection');

  const multiSelectionMessage = useMemo(() => {
    if (selectedEntityCount > 1) {
      return `${selectedEntityCount} entities selected. Apply bulk state or scale changes here, or duplicate and delete the selection.`;
    }

    if (selectedIslandCount > 1) {
      return `${selectedIslandCount} islands selected. Use the canvas to drag them together or use the boolean tools above when the selection order matters.`;
    }

    if (selectedPolygonCount > 1) {
      return `${selectedPolygonCount} polygons selected. Boolean tools are now available in the action bar above the workspace.`;
    }

    return canEditAuthoredGeometry
      ? 'Build a multi-selection from the canvas or island list to unlock boolean tools and grouped movement.'
      : 'Select terrain or entities from the canvas to inspect and edit them.';
  }, [
    canEditAuthoredGeometry,
    selectedEntityCount,
    selectedIslandCount,
    selectedPolygonCount
  ]);

  const catalogSections = useMemo(
    () =>
      [
        'building',
        'landmark',
        'industrial',
        'natural-prop'
      ] as const satisfies Array<StaticEntityListItem['archetype']['category']>,
    []
  );
  const activeModeIsEntityPlacement = activeTool === 'place-entity';

  return (
    <aside className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b border-border/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Selection
            </div>
            <h3 className="text-xl font-semibold tracking-tight">Inspector</h3>
            <p className="text-sm text-muted-foreground">{selectionSummary}</p>
          </div>
          <Badge
            className={cn(
              'rounded-md px-3 py-1',
              pendingAction
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                : undefined
            )}
            variant={pendingAction ? 'outline' : 'secondary'}
          >
            {pendingAction ? 'Saving changes…' : 'Ready'}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl border border-border/70 bg-background/60 p-1">
          {availableTabs.includes('selection') ? (
            <TabButton
              active={resolvedActiveTab === 'selection'}
              icon={Focus}
              label="Selection"
              onClick={() => setActiveTab('selection')}
            />
          ) : null}
          {availableTabs.includes('entities') ? (
            <TabButton
              active={resolvedActiveTab === 'entities'}
              icon={Package}
              label="Entities"
              onClick={() => setActiveTab('entities')}
            />
          ) : null}
          {availableTabs.includes('islands') ? (
            <TabButton
              active={resolvedActiveTab === 'islands'}
              icon={Layers3}
              label="Islands"
              onClick={() => setActiveTab('islands')}
            />
          ) : null}
          {availableTabs.includes('overview') ? (
            <TabButton
              active={resolvedActiveTab === 'overview'}
              icon={Compass}
              label="Overview"
              onClick={() => setActiveTab('overview')}
            />
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {resolvedActiveTab === 'selection' ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <InspectorCallout
                description={nextActionHint}
                title={activeToolLabel}
              />

              {activeTool === 'terrain' ? (
                <SectionShell
                  description="Terrain actions are on the canvas dock. Use this panel for the selected tile and draft details."
                  title="Terrain Details"
                >
                  <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                    <div className="text-sm font-medium text-foreground">
                      {terrainSelectedHeightTileCount > 0
                        ? `${terrainSelectedHeightTileCount} tiles selected`
                        : 'No terrain tiles selected'}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Drag on the canvas to select tiles, then use the canvas
                      dock to change height, type, color, or save the draft.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InspectorStat
                      label="Pending"
                      value={`${terrainDirtyCount}`}
                    />
                    <InspectorStat
                      label="Layer"
                      value={formatTerrainRenderLayer(terrainLayer)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InspectorStat
                      label="Tile"
                      value={
                        terrainInspectedTile
                          ? `${terrainInspectedTile.tileX}, ${terrainInspectedTile.tileZ}`
                          : '—'
                      }
                    />
                    <InspectorStat
                      label="Type"
                      value={terrainInspectedTile?.typeId ?? '—'}
                    />
                  </div>
                  <details className="rounded-lg border border-border/70 bg-background/50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      Terrain diagnostics
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <InspectorStat
                        label="Height Steps"
                        value={
                          terrainInspectedTile
                            ? `${terrainInspectedTile.heightSteps}`
                            : '—'
                        }
                      />
                      <InspectorStat
                        label="Color"
                        value={
                          terrainInspectedTile?.colorIndex === null
                            ? 'Auto'
                            : `${terrainInspectedTile?.colorIndex ?? '—'}`
                        }
                      />
                      <InspectorStat
                        label="Halo"
                        value={`${terrainPreviewHaloCount}`}
                      />
                      <InspectorStat
                        label="Plane"
                        value={
                          terrainState.lastSolvedPlaneHeight === null
                            ? '—'
                            : `${terrainState.lastSolvedPlaneHeight.toFixed(1)}m`
                        }
                      />
                    </div>
                  </details>
                </SectionShell>
              ) : null}

              {activeTool !== 'terrain' && currentEntityForInspector ? (
                <SectionShell
                  description="Adjust the selected placement and apply changes explicitly."
                  title="Static Entity"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InspectorStat
                      label="Entity ID"
                      value={currentEntityForInspector.id}
                    />
                    <InspectorStat
                      label="Diagnostics"
                      value={
                        selectedEntity?.diagnostics.status === 'pending'
                          ? 'Pending'
                          : selectedEntity?.diagnostics.status === 'warning'
                            ? 'Warning'
                            : 'Valid'
                      }
                    />
                  </div>
                  <TextInput
                    id="entity-label"
                    label="Label"
                    onChange={label =>
                      setEntityDraft(
                        draft => (draft ? { ...draft, label } : draft),
                        true
                      )
                    }
                    placeholder="Leave blank for automatic label"
                    value={currentEntityForInspector.label}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="entity-archetype">Archetype</Label>
                    <Select
                      id="entity-archetype"
                      onChange={event =>
                        setEntityDraft(
                          draft =>
                            draft
                              ? {
                                  ...draft,
                                  archetypeId: event.target.value
                                }
                              : draft,
                          true
                        )
                      }
                      value={currentEntityForInspector.archetypeId}
                    >
                      {selectedEntity &&
                      !catalogArchetypes.some(
                        archetype =>
                          archetype.id === selectedEntity.entity.archetypeId
                      ) ? (
                        <option value={selectedEntity.entity.archetypeId}>
                          {selectedEntity.archetype.name} (
                          {selectedEntity.archetype.status})
                        </option>
                      ) : null}
                      {catalogArchetypes.map(archetype => (
                        <option key={archetype.id} value={archetype.id}>
                          {archetype.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumberInput
                      id="entity-x"
                      label="X"
                      onChange={x =>
                        setEntityDraft(
                          draft => (draft ? { ...draft, x } : draft),
                          true
                        )
                      }
                      value={currentEntityForInspector.x}
                    />
                    <NumberInput
                      id="entity-z"
                      label="Z"
                      onChange={z =>
                        setEntityDraft(
                          draft => (draft ? { ...draft, z } : draft),
                          true
                        )
                      }
                      value={currentEntityForInspector.z}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumberInput
                      id="entity-yaw"
                      label="Yaw"
                      onChange={yaw =>
                        setEntityDraft(
                          draft => (draft ? { ...draft, yaw } : draft),
                          true
                        )
                      }
                      value={currentEntityForInspector.yaw}
                    />
                    <NumberInput
                      id="entity-scale"
                      label="Scale"
                      min="0.1"
                      onChange={scale =>
                        setEntityDraft(
                          draft => (draft ? { ...draft, scale } : draft),
                          true
                        )
                      }
                      step="0.1"
                      value={currentEntityForInspector.scale}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumberInput
                      id="entity-y-offset"
                      label="Y Offset"
                      onChange={yOffset =>
                        setEntityDraft(
                          draft => (draft ? { ...draft, yOffset } : draft),
                          true
                        )
                      }
                      step="0.1"
                      value={currentEntityForInspector.yOffset}
                    />
                    <div className="space-y-2">
                      <Label htmlFor="entity-state">State</Label>
                      <Select
                        id="entity-state"
                        onChange={event =>
                          setEntityDraft(
                            draft =>
                              draft
                                ? {
                                    ...draft,
                                    state: event.target
                                      .value as StaticEntity['state']
                                  }
                                : draft,
                            true
                          )
                        }
                        value={currentEntityForInspector.state}
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </Select>
                    </div>
                  </div>
                  {selectedEntity ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InspectorStat
                        label="Grounding"
                        value={
                          selectedEntity.diagnostics.status === 'pending'
                            ? 'Pending terrain'
                            : `${selectedEntity.diagnostics.maxHeightDelta.toFixed(2)}m delta`
                        }
                      />
                      <InspectorStat
                        label="Catalog"
                        value={
                          referencedArchetypeIds.has(
                            selectedEntity.archetype.id
                          )
                            ? 'Referenced'
                            : 'Global only'
                        }
                      />
                    </div>
                  ) : null}
                </SectionShell>
              ) : null}

              {activeTool !== 'terrain' && currentControlPointForInspector ? (
                <>
                  <SectionShell
                    description="Tune the local terrain effect and its position."
                    title="Control Point"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="control-type">Type</Label>
                        <Select
                          id="control-type"
                          onChange={event =>
                            setControlPointDraft(
                              draft => ({
                                ...(draft ??
                                  createControlPointDraft(
                                    selectedControlPoint ?? undefined
                                  )),
                                type: event.target.value as ControlPoint['type']
                              }),
                              true
                            )
                          }
                          value={currentControlPointForInspector.type}
                        >
                          <option value="plain">Plain</option>
                          <option value="peak">Peak</option>
                          <option value="valley">Valley</option>
                        </Select>
                      </div>
                      <NumberInput
                        id="control-strength"
                        label="Strength"
                        onChange={strength =>
                          setControlPointDraft(
                            draft => ({
                              ...(draft ??
                                createControlPointDraft(
                                  selectedControlPoint ?? undefined
                                )),
                              strength
                            }),
                            true
                          )
                        }
                        step="0.1"
                        value={currentControlPointForInspector.strength}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <NumberInput
                        id="control-elevation"
                        label="Elevation"
                        onChange={elevationMeters =>
                          setControlPointDraft(
                            draft => ({
                              ...(draft ??
                                createControlPointDraft(
                                  selectedControlPoint ?? undefined
                                )),
                              elevationMeters
                            }),
                            true
                          )
                        }
                        value={currentControlPointForInspector.elevationMeters}
                      />
                      <NumberInput
                        id="control-influence"
                        label="Influence Radius"
                        onChange={influenceMeters =>
                          setControlPointDraft(
                            draft => ({
                              ...(draft ??
                                createControlPointDraft(
                                  selectedControlPoint ?? undefined
                                )),
                              influenceMeters
                            }),
                            true
                          )
                        }
                        value={currentControlPointForInspector.influenceMeters}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <NumberInput
                        id="control-x"
                        label="X"
                        onChange={x =>
                          setControlPointDraft(
                            draft => ({
                              ...(draft ??
                                createControlPointDraft(
                                  selectedControlPoint ?? undefined
                                )),
                              x
                            }),
                            true
                          )
                        }
                        value={currentControlPointForInspector.x}
                      />
                      <NumberInput
                        id="control-z"
                        label="Z"
                        onChange={z =>
                          setControlPointDraft(
                            draft => ({
                              ...(draft ??
                                createControlPointDraft(
                                  selectedControlPoint ?? undefined
                                )),
                              z
                            }),
                            true
                          )
                        }
                        value={currentControlPointForInspector.z}
                      />
                    </div>
                  </SectionShell>
                </>
              ) : null}

              {activeTool !== 'terrain' &&
              !currentEntityForInspector &&
              !currentControlPointForInspector &&
              currentPolygonForInspector ? (
                <>
                  <SectionShell
                    description="Adjust terrain parameters or continue reshaping the boundary."
                    title="Polygon"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InspectorStat
                        label="Vertices"
                        value={`${currentPolygonForInspector.vertices.length}`}
                      />
                      <InspectorStat
                        label="Mode"
                        value={
                          currentPolygonForInspector.kind === 'create'
                            ? 'New polygon'
                            : 'Existing polygon'
                        }
                      />
                    </div>
                  </SectionShell>
                  <SectionShell
                    description="Terrain generation values are saved per polygon mutation. Higher Interior Fill makes land occupy more of the polygon."
                    title="Terrain Parameters"
                  >
                    <NumberInput
                      id="polygon-interior-fill"
                      label="Interior Fill"
                      min="0.25"
                      onChange={interiorFill => {
                        setPolygonDraft(
                          draft => ({
                            ...(draft ??
                              createPolygonDraft(selectedPolygon ?? undefined)),
                            params: {
                              ...(draft?.params ??
                                selectedPolygon?.params ??
                                DEFAULT_SOURCE_POLYGON_PARAMS),
                              interiorFill
                            }
                          }),
                          true
                        );
                      }}
                      step="0.05"
                      value={currentPolygonForInspector.params.interiorFill}
                    />
                    <NumberInput
                      id="polygon-noise-scale"
                      label="Noise Scale"
                      onChange={noiseScaleMeters => {
                        setPolygonDraft(
                          draft => ({
                            ...(draft ??
                              createPolygonDraft(selectedPolygon ?? undefined)),
                            params: {
                              ...(draft?.params ??
                                selectedPolygon?.params ??
                                DEFAULT_SOURCE_POLYGON_PARAMS),
                              noiseScaleMeters
                            }
                          }),
                          true
                        );
                      }}
                      value={currentPolygonForInspector.params.noiseScaleMeters}
                    />
                    <NumberInput
                      id="polygon-displacement"
                      label="Max Displacement"
                      onChange={maxDisplacementMeters => {
                        setPolygonDraft(
                          draft => ({
                            ...(draft ??
                              createPolygonDraft(selectedPolygon ?? undefined)),
                            params: {
                              ...(draft?.params ??
                                selectedPolygon?.params ??
                                DEFAULT_SOURCE_POLYGON_PARAMS),
                              maxDisplacementMeters
                            }
                          }),
                          true
                        );
                      }}
                      value={
                        currentPolygonForInspector.params.maxDisplacementMeters
                      }
                    />
                    <NumberInput
                      id="polygon-roughness"
                      label="Roughness"
                      onChange={roughness => {
                        setPolygonDraft(
                          draft => ({
                            ...(draft ??
                              createPolygonDraft(selectedPolygon ?? undefined)),
                            params: {
                              ...(draft?.params ??
                                selectedPolygon?.params ??
                                DEFAULT_SOURCE_POLYGON_PARAMS),
                              roughness
                            }
                          }),
                          true
                        );
                      }}
                      step="0.05"
                      value={currentPolygonForInspector.params.roughness}
                    />
                  </SectionShell>
                </>
              ) : null}

              {activeTool !== 'terrain' &&
              !currentEntityForInspector &&
              !currentControlPointForInspector &&
              !currentPolygonForInspector &&
              islandInspectorDraft &&
              selectedIslandCount === 1 ? (
                <SectionShell
                  description="Update island metadata for the currently selected island."
                  title="Island Metadata"
                >
                  {selectedIsland ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InspectorStat
                        label="Area"
                        value={`${Math.round(selectedIsland.areaMeters2)}m²`}
                      />
                      <InspectorStat
                        label="Source Polygons"
                        value={`${selectedIsland.sourcePolygonIds.length}`}
                      />
                    </div>
                  ) : null}
                  <TextInput
                    id="island-name"
                    label="Name"
                    onChange={name =>
                      setIslandDraft(draft =>
                        draft ? { ...draft, name } : draft
                      )
                    }
                    value={islandInspectorDraft.name}
                  />
                  <TextInput
                    id="island-owner"
                    label="Default Owner"
                    onChange={defaultOwner =>
                      setIslandDraft(draft =>
                        draft ? { ...draft, defaultOwner } : draft
                      )
                    }
                    value={islandInspectorDraft.defaultOwner}
                  />
                  <TextInput
                    id="island-faction"
                    label="Default Faction"
                    onChange={defaultFaction =>
                      setIslandDraft(draft =>
                        draft ? { ...draft, defaultFaction } : draft
                      )
                    }
                    value={islandInspectorDraft.defaultFaction}
                  />
                </SectionShell>
              ) : null}

              {activeTool !== 'terrain' &&
              !currentEntityForInspector &&
              !currentControlPointForInspector &&
              !currentPolygonForInspector &&
              !(islandInspectorDraft && selectedIslandCount === 1) &&
              (selectedEntityCount > 1 ||
                selectedPolygonCount > 1 ||
                selectedIslandCount > 1) ? (
                <SectionShell
                  description="Boolean actions remain in the top action bar so they stay close to undo and redo."
                  title="Multi-selection"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InspectorStat label="Selection" value={selectionSummary} />
                    <InspectorStat
                      label="Next step"
                      value={
                        selectedEntityCount > 1
                          ? 'Apply scale/state, duplicate, or delete'
                          : 'Choose boolean tool or drag on canvas'
                      }
                    />
                  </div>
                  {selectedEntityCount > 1 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <NumberInput
                        id="bulk-entity-scale"
                        label="Scale"
                        min="0.1"
                        onChange={value => onSetBulkScaleDraft(String(value))}
                        step="0.1"
                        value={parseNumber(bulkScaleDraft, 1)}
                      />
                      <div className="space-y-2">
                        <Label htmlFor="bulk-entity-state">State</Label>
                        <Select
                          id="bulk-entity-state"
                          onChange={event =>
                            onSetBulkStateDraft(
                              event.target.value as StaticEntity['state']
                            )
                          }
                          value={bulkStateDraft}
                        >
                          <option value="active">Active</option>
                          <option value="disabled">Disabled</option>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-violet-400/30 bg-violet-500/8 px-4 py-3 text-sm text-muted-foreground">
                    {multiSelectionMessage}
                  </div>
                </SectionShell>
              ) : null}

              {activeTool !== 'terrain' &&
              !currentEntityForInspector &&
              !currentControlPointForInspector &&
              !currentPolygonForInspector &&
              !(islandInspectorDraft && selectedIslandCount === 1) &&
              !(
                selectedEntityCount > 1 ||
                selectedPolygonCount > 1 ||
                selectedIslandCount > 1
              ) ? (
                <SectionShell
                  description="Start a new edit or switch tools without leaving the workspace."
                  title="Nothing Selected"
                >
                  <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <p className="text-sm text-muted-foreground">
                      {activeModeIsEntityPlacement
                        ? 'Click on the map to place the selected archetype, or switch tools to inspect other authored content.'
                        : nextActionHint}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={onBeginPlaceEntity}>
                        <Package className="h-4 w-4" />
                        Place Entity
                      </Button>
                      <Button onClick={onBeginTerrain} variant="outline">
                        <Layers3 className="h-4 w-4" />
                        Terrain
                      </Button>
                      {canEditAuthoredGeometry ? (
                        <Button onClick={onBeginDrawPolygon}>
                          <Plus className="h-4 w-4" />
                          Draw Polygon
                        </Button>
                      ) : null}
                      {canEditAuthoredGeometry ? (
                        <Button onClick={onBeginControlPoint} variant="outline">
                          <Plus className="h-4 w-4" />
                          Add Control Point
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => onSelectTool('pan')}
                        variant="outline"
                      >
                        Pan View
                      </Button>
                    </div>
                  </div>
                </SectionShell>
              ) : null}
            </div>

            {activeTool !== 'terrain' && currentEntityForInspector ? (
              <ActionBar>
                <Button disabled={!entityDirty} onClick={onSaveEntityDraft}>
                  <Save className="h-4 w-4" />
                  Apply
                </Button>
                <Button
                  disabled={!entityDirty}
                  onClick={onResetEntityDraft}
                  variant="outline"
                >
                  Reset
                </Button>
                <Button
                  disabled={selectedEntityCount === 0}
                  onClick={onDuplicateStaticEntities}
                  variant="outline"
                >
                  Duplicate
                </Button>
                <Button
                  onClick={() =>
                    setDeleteTarget({
                      ids:
                        selectedEntityIds.length > 0
                          ? selectedEntityIds
                          : currentEntityForInspector
                            ? [currentEntityForInspector.id]
                            : [],
                      kind: 'static-entity'
                    })
                  }
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </ActionBar>
            ) : null}

            {canEditAuthoredGeometry &&
            activeTool !== 'terrain' &&
            !currentEntityForInspector &&
            currentPolygonForInspector ? (
              <ActionBar>
                <Button
                  disabled={
                    !polygonDraft ||
                    !canSavePolygonDraft(
                      currentPolygonForInspector.vertices,
                      currentPolygonForInspector.params
                    ) ||
                    !polygonDirty
                  }
                  onClick={onSavePolygonDraft}
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  disabled={!polygonDraft}
                  onClick={onResetPolygonDraft}
                  variant="outline"
                >
                  Cancel
                </Button>
                {selectedPolygon ? (
                  <Button
                    onClick={() =>
                      setDeleteTarget({
                        id: selectedPolygon.id,
                        kind: 'polygon'
                      })
                    }
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </ActionBar>
            ) : null}

            {canEditAuthoredGeometry &&
            activeTool !== 'terrain' &&
            currentControlPointForInspector ? (
              <ActionBar>
                <Button
                  disabled={!controlPointDraft}
                  onClick={onSaveControlPointDraft}
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  disabled={!controlPointDraft}
                  onClick={onResetControlPointDraft}
                  variant="outline"
                >
                  Cancel
                </Button>
                {selectedControlPoint ? (
                  <Button
                    onClick={() =>
                      setDeleteTarget({
                        id: selectedControlPoint.id,
                        kind: 'control-point'
                      })
                    }
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </ActionBar>
            ) : null}

            {canEditAuthoredGeometry &&
            activeTool !== 'terrain' &&
            !currentEntityForInspector &&
            !currentControlPointForInspector &&
            !currentPolygonForInspector &&
            islandInspectorDraft &&
            selectedIslandCount === 1 ? (
              <ActionBar>
                <Button disabled={!islandDraft} onClick={onSaveIslandDraft}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  disabled={!islandDraft}
                  onClick={() =>
                    setIslandDraft(
                      selectedIsland ? createIslandDraft(selectedIsland) : null
                    )
                  }
                  variant="outline"
                >
                  Cancel
                </Button>
              </ActionBar>
            ) : null}

            {activeTool !== 'terrain' &&
            !currentEntityForInspector &&
            !currentControlPointForInspector &&
            !currentPolygonForInspector &&
            !(islandInspectorDraft && selectedIslandCount === 1) &&
            selectedEntityCount > 1 ? (
              <ActionBar>
                <Button
                  onClick={() =>
                    onApplyBulkEntityEdit({
                      scale: parseNumber(bulkScaleDraft, 1),
                      state: bulkStateDraft
                    })
                  }
                >
                  <Save className="h-4 w-4" />
                  Apply Bulk
                </Button>
                <Button onClick={onDuplicateStaticEntities} variant="outline">
                  Duplicate
                </Button>
                <Button
                  onClick={() =>
                    setDeleteTarget({
                      ids: selectedEntityIds,
                      kind: 'static-entity'
                    })
                  }
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </ActionBar>
            ) : null}
          </div>
        ) : null}

        {resolvedActiveTab === 'entities' ? (
          <div className="h-full overflow-y-auto p-4">
            <SectionShell
              description="Choose the active archetype for placement and inspect the map-wide entity list."
              title="Catalog"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <InspectorStat
                  label="Active"
                  value={activeCatalogArchetypeId ?? 'None'}
                />
                <InspectorStat
                  label="Catalog"
                  value={`${catalogArchetypes.length}`}
                />
                <InspectorStat
                  label="Placed"
                  value={`${counts.staticEntities}`}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="catalog-category">Category</Label>
                  <Select
                    id="catalog-category"
                    onChange={event =>
                      onSetCatalogCategory(
                        event.target.value as
                          | StaticEntityListItem['archetype']['category']
                          | 'all'
                      )
                    }
                    value={activeCatalogCategory}
                  >
                    <option value="all">All</option>
                    {catalogSections.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </div>
                <TextInput
                  id="catalog-search"
                  label="Search"
                  onChange={onSetCatalogSearch}
                  placeholder="Search archetypes"
                  value={activeCatalogSearch}
                />
              </div>
              <div className="mt-4 space-y-3">
                {catalogSections.map(category => {
                  const items = catalogArchetypes.filter(archetype =>
                    activeCatalogCategory === 'all'
                      ? archetype.category === category
                      : archetype.category === activeCatalogCategory &&
                        archetype.category === category
                  );

                  if (items.length === 0) {
                    return null;
                  }

                  return (
                    <div className="space-y-2" key={category}>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {category}
                      </div>
                      <div className="space-y-2">
                        {items
                          .filter(archetype =>
                            activeCatalogSearch.trim()
                              ? [
                                  archetype.id,
                                  archetype.name,
                                  ...archetype.tags
                                ]
                                  .map(value => value.toLowerCase())
                                  .some(value =>
                                    value.includes(
                                      activeCatalogSearch.trim().toLowerCase()
                                    )
                                  )
                              : true
                          )
                          .map(archetype => (
                            <button
                              className={cn(
                                'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                                archetype.id === activeCatalogArchetypeId
                                  ? 'border-emerald-400/60 bg-emerald-500/10'
                                  : 'border-border bg-background hover:bg-accent/40'
                              )}
                              key={archetype.id}
                              onClick={() =>
                                onPickCatalogArchetype(archetype.id)
                              }
                              type="button"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {archetype.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {archetype.id}
                                </div>
                              </div>
                              <Badge variant="outline">
                                {referencedArchetypeIds.has(archetype.id)
                                  ? 'In map'
                                  : 'Global'}
                              </Badge>
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={onBeginPlaceEntity}>
                  <Package className="h-4 w-4" />
                  Place Selected Archetype
                </Button>
                <Button
                  onClick={() => onSelectTool('select')}
                  variant="outline"
                >
                  Selection Tool
                </Button>
              </div>
            </SectionShell>

            <SectionShell
              description="Search, filter, select, and jump to placed entities."
              title="Outliner"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput
                  id="outliner-search"
                  label="Search"
                  onChange={onSetOutlinerSearch}
                  placeholder="ID, label, or archetype"
                  value={activeOutlinerSearch}
                />
                <div className="space-y-2">
                  <Label htmlFor="outliner-category">Category</Label>
                  <Select
                    id="outliner-category"
                    onChange={event =>
                      onSetOutlinerCategory(
                        event.target.value as
                          | StaticEntityListItem['archetype']['category']
                          | 'all'
                      )
                    }
                    value={activeOutlinerCategory}
                  >
                    <option value="all">All</option>
                    {catalogSections.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="outliner-archetype">Archetype</Label>
                <Select
                  id="outliner-archetype"
                  onChange={event =>
                    onSetOutlinerArchetypeId(
                      event.target.value as string | 'all'
                    )
                  }
                  value={activeOutlinerArchetypeId}
                >
                  <option value="all">All archetypes</option>
                  {catalogArchetypes.map(archetype => (
                    <option key={archetype.id} value={archetype.id}>
                      {archetype.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-background/40 p-2">
                {staticEntityItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    No static entities placed yet.
                  </div>
                ) : null}
                {staticEntityItems.map(item => {
                  const isSelected = selectedEntityIds.includes(item.entity.id);
                  return (
                    <button
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-emerald-400/60 bg-emerald-500/10 text-foreground'
                          : 'border-border bg-background hover:border-emerald-300/50 hover:bg-accent/40'
                      )}
                      key={item.entity.id}
                      onClick={event =>
                        onSelectStaticEntities(
                          nextOrderedSelection(
                            selectedEntityIds,
                            item.entity.id,
                            event.shiftKey
                          )
                        )
                      }
                      type="button"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {item.entity.label ?? item.entity.id}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.archetype.name}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.entity.state === 'disabled' ? (
                          <Badge variant="outline">Disabled</Badge>
                        ) : null}
                        {item.diagnostics.status === 'warning' ? (
                          <Badge variant="outline">Warning</Badge>
                        ) : item.diagnostics.status === 'pending' ? (
                          <Badge variant="outline">Pending</Badge>
                        ) : null}
                        <Button
                          onClick={event => {
                            event.stopPropagation();
                            onJumpToEntity(item);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Jump
                        </Button>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionShell>
          </div>
        ) : null}

        {canEditAuthoredGeometry && resolvedActiveTab === 'islands' ? (
          <div className="h-full overflow-y-auto p-4">
            <SectionShell
              description="Select an island to sync the canvas selection. Shift-click adds to the current set."
              title="Derived Islands"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <InspectorStat
                  label="Islands"
                  value={`${counts.derivedIslands}`}
                />
                <InspectorStat
                  label="Polygons"
                  value={`${counts.sourcePolygons}`}
                />
                <InspectorStat
                  label="Controls"
                  value={`${counts.controlPoints}`}
                />
              </div>
            </SectionShell>

            <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-background/40 p-2">
              {derivedIslands.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No derived islands yet.
                </div>
              ) : null}
              {derivedIslands.map(island => {
                const isSelected = selectedIslandIds.includes(island.id);
                return (
                  <button
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-pink-400/60 bg-pink-500/10 text-foreground'
                        : 'border-border bg-background hover:border-pink-300/50 hover:bg-accent/40'
                    )}
                    data-testid={`derived-island-row-${island.id}`}
                    key={island.id}
                    onClick={event => {
                      onSelectIsland(island.id, {
                        additive: event.shiftKey,
                        recenter: !event.shiftKey
                      });
                    }}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {island.name ?? island.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {island.sourcePolygonIds.length} polygons
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{Math.round(island.areaMeters2)}m²</div>
                      <div>{isSelected ? 'Selected' : 'Idle'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {hasOverviewAuthoring && resolvedActiveTab === 'overview' ? (
          <div className="h-full overflow-y-auto p-4">
            <SectionShell
              description="Use the minimap to recenter the main view and understand the current spread of geometry."
              title="Overview"
            >
              <OverviewPane
                bounds={overviewBounds}
                clusters={overviewClusters}
                onRecenter={onRecenter}
                viewportBounds={viewportBounds}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <InspectorStat
                  label="Polygons"
                  value={`${counts.sourcePolygons}`}
                />
                <InspectorStat
                  label="Controls"
                  value={`${counts.controlPoints}`}
                />
                <InspectorStat
                  label="Islands"
                  value={`${counts.derivedIslands}`}
                />
              </div>
            </SectionShell>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

const TabButton = ({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof Focus;
  label: string;
  onClick: () => void;
}) => (
  <button
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
    )}
    onClick={onClick}
    type="button"
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const formatTerrainRenderLayer = (layer: TerrainRenderLayer) =>
  layer
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const InspectorCallout = ({
  description,
  title
}: {
  description: string;
  title: string;
}) => (
  <div className="rounded-xl border border-sky-400/30 bg-sky-500/8 px-4 py-3">
    <div className="text-sm font-medium text-foreground">{title}</div>
    <div className="mt-1 text-sm text-muted-foreground">{description}</div>
  </div>
);

const SectionShell = ({
  children,
  description,
  title
}: {
  children: ReactNode;
  description: string;
  title: string;
}) => (
  <section className="rounded-xl border border-border/70 bg-background/40 p-4">
    <div className="mb-4">
      <h4 className="text-base font-semibold text-foreground">{title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const ActionBar = ({ children }: { children: ReactNode }) => (
  <div className="border-t border-border/70 bg-card/95 p-4 backdrop-blur">
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const InspectorStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </div>
    <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
  </div>
);

const NumberInput = ({
  id,
  label,
  min,
  onChange,
  step,
  value
}: NumberInputProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      min={min}
      onChange={event => onChange(parseNumber(event.target.value, value))}
      step={step}
      type="number"
      value={value}
    />
  </div>
);

const TextInput = ({
  id,
  label,
  onChange,
  placeholder,
  value
}: TextInputProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  </div>
);

type NumberInputProps = {
  id: string;
  label: string;
  min?: string;
  onChange: (value: number) => void;
  step?: string;
  value: number;
};

type TextInputProps = {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};
