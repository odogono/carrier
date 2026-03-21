import type {
  ControlPoint,
  DerivedIsland,
  SourcePolygon,
  WorldBounds,
  WorldPoint
} from 'carrier-contracts/types';
import { Compass, Focus, Layers3, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  DEFAULT_SOURCE_POLYGON_PARAMS,
  canSavePolygonDraft,
  type EditorTool
} from '../helpers';
import {
  createControlPointDraft,
  createIslandDraft,
  createPolygonDraft,
  parseNumber
} from '../helpers/drafts';
import type {
  ControlPointDraft,
  IslandDraft,
  PolygonDraft
} from '../helpers/types';
import { OverviewPane } from './overview-pane';

type SidebarTab = 'selection' | 'islands' | 'overview';

type EditorSidebarProps = {
  activeTool: EditorTool;
  activeToolLabel: string;
  controlPointDraft: ControlPointDraft | null;
  counts: {
    controlPoints: number;
    derivedIslands: number;
    sourcePolygons: number;
  };
  currentControlPointForInspector: ControlPointDraft | null;
  currentPolygonForInspector: PolygonDraft | null;
  derivedIslands: DerivedIsland[];
  islandDraft: IslandDraft | null;
  islandInspectorDraft: IslandDraft | null;
  nextActionHint: string;
  onBeginControlPoint: () => void;
  onBeginDrawPolygon: () => void;
  onRecenter: (point: Pick<WorldPoint, 'x' | 'z'>) => void;
  onResetControlPointDraft: () => void;
  onResetPolygonDraft: () => void;
  onSaveControlPointDraft: () => void;
  onSaveIslandDraft: () => void;
  onSavePolygonDraft: () => void;
  onSelectIsland: (
    islandId: string,
    options?: { additive?: boolean; recenter?: boolean }
  ) => void;
  onSelectTool: (tool: EditorTool) => void;
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
  selectedControlPoint: ControlPoint | null;
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
      | null
    >
  >;
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
  viewportBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null;
};

export const EditorSidebar = ({
  activeTool,
  activeToolLabel,
  controlPointDraft,
  counts,
  currentControlPointForInspector,
  currentPolygonForInspector,
  derivedIslands,
  islandDraft,
  islandInspectorDraft,
  nextActionHint,
  onBeginControlPoint,
  onBeginDrawPolygon,
  onRecenter,
  onResetControlPointDraft,
  onResetPolygonDraft,
  onSaveControlPointDraft,
  onSaveIslandDraft,
  onSavePolygonDraft,
  onSelectIsland,
  onSelectTool,
  overviewBounds,
  overviewClusters,
  pendingAction,
  polygonDirty,
  polygonDraft,
  selectedControlPoint,
  selectedIsland,
  selectedIslandCount,
  selectedIslandIds,
  selectedPolygon,
  selectedPolygonCount,
  selectionSummary,
  setControlPointDraft,
  setDeleteTarget,
  setIslandDraft,
  setPolygonDraft,
  viewportBounds
}: EditorSidebarProps) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('selection');

  const multiSelectionMessage = useMemo(() => {
    if (selectedIslandCount > 1) {
      return `${selectedIslandCount} islands selected. Use the canvas to drag them together or use the boolean tools above when the selection order matters.`;
    }

    if (selectedPolygonCount > 1) {
      return `${selectedPolygonCount} polygons selected. Boolean tools are now available in the action bar above the workspace.`;
    }

    return 'Build a multi-selection from the canvas or island list to unlock boolean tools and grouped movement.';
  }, [selectedIslandCount, selectedPolygonCount]);

  return (
    <aside className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b border-border/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Inspector
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              Contextual Controls
            </h3>
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
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-background/60 p-1">
          <TabButton
            active={activeTab === 'selection'}
            icon={Focus}
            label="Selection"
            onClick={() => setActiveTab('selection')}
          />
          <TabButton
            active={activeTab === 'islands'}
            icon={Layers3}
            label="Islands"
            onClick={() => setActiveTab('islands')}
          />
          <TabButton
            active={activeTab === 'overview'}
            icon={Compass}
            label="Overview"
            onClick={() => setActiveTab('overview')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'selection' ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <InspectorCallout
                description={nextActionHint}
                title={activeToolLabel}
              />

              {currentControlPointForInspector ? (
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

              {!currentControlPointForInspector &&
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
                    description="Terrain generation values are saved per polygon mutation."
                    title="Terrain Parameters"
                  >
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

              {!currentControlPointForInspector &&
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

              {!currentControlPointForInspector &&
              !currentPolygonForInspector &&
              !(islandInspectorDraft && selectedIslandCount === 1) &&
              (selectedPolygonCount > 1 || selectedIslandCount > 1) ? (
                <SectionShell
                  description="Boolean actions remain in the top action bar so they stay close to undo and redo."
                  title="Multi-selection"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InspectorStat label="Selection" value={selectionSummary} />
                    <InspectorStat
                      label="Next step"
                      value="Choose boolean tool or drag on canvas"
                    />
                  </div>
                  <div className="rounded-xl border border-violet-400/30 bg-violet-500/8 px-4 py-3 text-sm text-muted-foreground">
                    {multiSelectionMessage}
                  </div>
                </SectionShell>
              ) : null}

              {!currentControlPointForInspector &&
              !currentPolygonForInspector &&
              !(islandInspectorDraft && selectedIslandCount === 1) &&
              !(selectedPolygonCount > 1 || selectedIslandCount > 1) ? (
                <SectionShell
                  description="Start a new edit or switch tools without leaving the workspace."
                  title="Nothing Selected"
                >
                  <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <p className="text-sm text-muted-foreground">
                      {nextActionHint}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={onBeginDrawPolygon}>
                        <Plus className="h-4 w-4" />
                        Draw Polygon
                      </Button>
                      <Button onClick={onBeginControlPoint} variant="outline">
                        <Plus className="h-4 w-4" />
                        Add Control Point
                      </Button>
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

            {currentPolygonForInspector ? (
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

            {currentControlPointForInspector ? (
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

            {!currentControlPointForInspector &&
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
          </div>
        ) : null}

        {activeTab === 'islands' ? (
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

        {activeTab === 'overview' ? (
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
  onChange,
  step,
  value
}: NumberInputProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      onChange={event => onChange(parseNumber(event.target.value, value))}
      step={step}
      type="number"
      value={value}
    />
  </div>
);

const TextInput = ({ id, label, onChange, value }: TextInputProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      onChange={event => onChange(event.target.value)}
      value={value}
    />
  </div>
);

type NumberInputProps = {
  id: string;
  label: string;
  onChange: (value: number) => void;
  step?: string;
  value: number;
};

type TextInputProps = {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};
