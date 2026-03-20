import type {
  ControlPoint,
  DerivedIsland,
  SourcePolygon,
  WorldBounds,
  WorldPoint
} from 'carrier-contracts/types';
import { Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { DEFAULT_SOURCE_POLYGON_PARAMS, canSavePolygonDraft } from '../helpers';
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

type EditorSidebarProps = {
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
  overviewBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null;
  overviewClusters: ReadonlyArray<{
    bbox: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>;
    controlPointCount: number;
    derivedIslandCount: number;
    sourcePolygonCount: number;
  }>;
  polygonDirty: boolean;
  polygonDraft: PolygonDraft | null;
  selectedControlPoint: ControlPoint | null;
  selectedIsland: DerivedIsland | null;
  selectedIslandCount: number;
  selectedIslandIds: string[];
  selectedPolygon: SourcePolygon | null;
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

export function EditorSidebar({
  controlPointDraft,
  counts,
  currentControlPointForInspector,
  currentPolygonForInspector,
  derivedIslands,
  islandDraft,
  islandInspectorDraft,
  onRecenter,
  onResetControlPointDraft,
  onResetPolygonDraft,
  onSaveControlPointDraft,
  onSaveIslandDraft,
  onSavePolygonDraft,
  onSelectIsland,
  overviewBounds,
  overviewClusters,
  polygonDirty,
  polygonDraft,
  selectedControlPoint,
  selectedIsland,
  selectedIslandCount,
  selectedIslandIds,
  selectedPolygon,
  setControlPointDraft,
  setDeleteTarget,
  setIslandDraft,
  setPolygonDraft,
  viewportBounds
}: EditorSidebarProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            Click to recenter. Drag the viewport frame to pan the main view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OverviewPane
            bounds={overviewBounds}
            clusters={overviewClusters}
            onRecenter={onRecenter}
            viewportBounds={viewportBounds}
          />
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{counts.sourcePolygons} polygons</span>
            <span>{counts.controlPoints} controls</span>
            <span>{counts.derivedIslands} islands</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Polygon Inspector</CardTitle>
          <CardDescription>
            Edit terrain params and save polygon changes per operation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentPolygonForInspector ? (
            <>
              <PolygonParamInput
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
              <PolygonParamInput
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
                value={currentPolygonForInspector.params.maxDisplacementMeters}
              />
              <PolygonParamInput
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
              <div className="flex flex-wrap gap-2">
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
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button
                  disabled={!polygonDraft}
                  onClick={onResetPolygonDraft}
                  variant="outline"
                >
                  Cancel
                </Button>
                {selectedPolygon && (
                  <Button
                    onClick={() =>
                      setDeleteTarget({
                        id: selectedPolygon.id,
                        kind: 'polygon'
                      })
                    }
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Select a polygon or start drawing one.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control Point Inspector</CardTitle>
          <CardDescription>
            Place, move, and tune local terrain controls before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentControlPointForInspector ? (
            <>
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
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!controlPointDraft}
                  onClick={onSaveControlPointDraft}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button
                  disabled={!controlPointDraft}
                  onClick={onResetControlPointDraft}
                  variant="outline"
                >
                  Cancel
                </Button>
                {selectedControlPoint && (
                  <Button
                    onClick={() =>
                      setDeleteTarget({
                        id: selectedControlPoint.id,
                        kind: 'control-point'
                      })
                    }
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Select a control point or use Add Control Point.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Derived Islands</CardTitle>
          <CardDescription>
            Layer-style island selection. Click to select, Shift-click to build
            a multi-selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-72 space-y-2 overflow-auto rounded-md border bg-muted/20 p-2">
            {derivedIslands.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No derived islands yet.
              </div>
            )}
            {derivedIslands.map(island => (
              <button
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
                  selectedIslandIds.includes(island.id)
                    ? 'border-pink-400/70 bg-pink-500/12 text-foreground'
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
                  <div>
                    {selectedIslandIds.includes(island.id)
                      ? 'Selected'
                      : 'Idle'}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {selectedIslandCount > 1 && (
            <div className="rounded-md border border-pink-300/40 bg-pink-500/8 px-3 py-2 text-sm text-muted-foreground">
              {selectedIslandCount} islands selected. Drag any selected polygon
              to move the group together.
            </div>
          )}
          {islandInspectorDraft && selectedIslandCount === 1 && (
            <div className="space-y-4">
              <TextInput
                id="island-name"
                label="Name"
                onChange={name =>
                  setIslandDraft(draft => (draft ? { ...draft, name } : draft))
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
              <div className="flex gap-2">
                <Button disabled={!islandDraft} onClick={onSaveIslandDraft}>
                  <Save className="mr-2 h-4 w-4" />
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type NumberInputProps = {
  id: string;
  label: string;
  onChange: (value: number) => void;
  step?: string;
  value: number;
};

function NumberInput({ id, label, onChange, step, value }: NumberInputProps) {
  return (
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
}

type TextInputProps = {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

function TextInput({ id, label, onChange, value }: TextInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={event => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

type PolygonParamInputProps = {
  id: string;
  label: string;
  onChange: (value: number) => void;
  step?: string;
  value: number;
};

function PolygonParamInput({
  id,
  label,
  onChange,
  step,
  value
}: PolygonParamInputProps) {
  return (
    <NumberInput
      id={id}
      label={label}
      onChange={onChange}
      step={step}
      value={value}
    />
  );
}
