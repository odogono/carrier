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

import { DEFAULT_SOURCE_POLYGON_PARAMS, canSavePolygonDraft } from '../helpers';
import {
  createControlPointDraft,
  createIslandDraft,
  createPolygonDraft,
  getBoundsCenter,
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
  selectedIslandId: string | null;
  selectedPolygon: SourcePolygon | null;
  setControlPointDraft: React.Dispatch<
    React.SetStateAction<ControlPointDraft | null>
  >;
  setDeleteTarget: React.Dispatch<
    React.SetStateAction<
      | { id: string; kind: 'control-point' }
      | { id: string; kind: 'polygon' }
      | null
    >
  >;
  setIslandDraft: React.Dispatch<React.SetStateAction<IslandDraft | null>>;
  setSelectedControlPointId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setSelectedIslandId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedPolygonIds: React.Dispatch<React.SetStateAction<string[]>>;
  setPolygonDraft: React.Dispatch<React.SetStateAction<PolygonDraft | null>>;
  onRecenter: (point: Pick<WorldPoint, 'x' | 'z'>) => void;
  onResetControlPointDraft: () => void;
  onResetPolygonDraft: () => void;
  onSaveControlPointDraft: () => void;
  onSaveIslandDraft: () => void;
  onSavePolygonDraft: () => void;
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
  overviewBounds,
  overviewClusters,
  polygonDirty,
  polygonDraft,
  selectedControlPoint,
  selectedIsland,
  selectedIslandId,
  selectedPolygon,
  setControlPointDraft,
  setDeleteTarget,
  setIslandDraft,
  setSelectedControlPointId,
  setSelectedIslandId,
  setSelectedPolygonIds,
  setPolygonDraft,
  onRecenter,
  onResetControlPointDraft,
  onResetPolygonDraft,
  onSaveControlPointDraft,
  onSaveIslandDraft,
  onSavePolygonDraft,
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
                value={currentPolygonForInspector.params.noiseScaleMeters}
                onChange={noiseScaleMeters => {
                  setPolygonDraft(draft => ({
                    ...(draft ??
                      createPolygonDraft(selectedPolygon ?? undefined)),
                    params: {
                      ...(draft?.params ??
                        selectedPolygon?.params ??
                        DEFAULT_SOURCE_POLYGON_PARAMS),
                      noiseScaleMeters
                    }
                  }));
                }}
              />
              <PolygonParamInput
                id="polygon-displacement"
                label="Max Displacement"
                value={currentPolygonForInspector.params.maxDisplacementMeters}
                onChange={maxDisplacementMeters => {
                  setPolygonDraft(draft => ({
                    ...(draft ??
                      createPolygonDraft(selectedPolygon ?? undefined)),
                    params: {
                      ...(draft?.params ??
                        selectedPolygon?.params ??
                        DEFAULT_SOURCE_POLYGON_PARAMS),
                      maxDisplacementMeters
                    }
                  }));
                }}
              />
              <PolygonParamInput
                id="polygon-roughness"
                label="Roughness"
                step="0.05"
                value={currentPolygonForInspector.params.roughness}
                onChange={roughness => {
                  setPolygonDraft(draft => ({
                    ...(draft ??
                      createPolygonDraft(selectedPolygon ?? undefined)),
                    params: {
                      ...(draft?.params ??
                        selectedPolygon?.params ??
                        DEFAULT_SOURCE_POLYGON_PARAMS),
                      roughness
                    }
                  }));
                }}
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
                    value={currentControlPointForInspector.type}
                    onChange={event =>
                      setControlPointDraft(draft => ({
                        ...(draft ??
                          createControlPointDraft(
                            selectedControlPoint ?? undefined
                          )),
                        type: event.target.value as ControlPoint['type']
                      }))
                    }
                  >
                    <option value="plain">Plain</option>
                    <option value="peak">Peak</option>
                    <option value="valley">Valley</option>
                  </Select>
                </div>
                <NumberInput
                  id="control-strength"
                  label="Strength"
                  step="0.1"
                  value={currentControlPointForInspector.strength}
                  onChange={strength =>
                    setControlPointDraft(draft => ({
                      ...(draft ??
                        createControlPointDraft(
                          selectedControlPoint ?? undefined
                        )),
                      strength
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <NumberInput
                  id="control-elevation"
                  label="Elevation"
                  value={currentControlPointForInspector.elevationMeters}
                  onChange={elevationMeters =>
                    setControlPointDraft(draft => ({
                      ...(draft ??
                        createControlPointDraft(
                          selectedControlPoint ?? undefined
                        )),
                      elevationMeters
                    }))
                  }
                />
                <NumberInput
                  id="control-influence"
                  label="Influence Radius"
                  value={currentControlPointForInspector.influenceMeters}
                  onChange={influenceMeters =>
                    setControlPointDraft(draft => ({
                      ...(draft ??
                        createControlPointDraft(
                          selectedControlPoint ?? undefined
                        )),
                      influenceMeters
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <NumberInput
                  id="control-x"
                  label="X"
                  value={currentControlPointForInspector.x}
                  onChange={x =>
                    setControlPointDraft(draft => ({
                      ...(draft ??
                        createControlPointDraft(
                          selectedControlPoint ?? undefined
                        )),
                      x
                    }))
                  }
                />
                <NumberInput
                  id="control-z"
                  label="Z"
                  value={currentControlPointForInspector.z}
                  onChange={z =>
                    setControlPointDraft(draft => ({
                      ...(draft ??
                        createControlPointDraft(
                          selectedControlPoint ?? undefined
                        )),
                      z
                    }))
                  }
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
            Selecting an island recenters the view and highlights its source
            polygons.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-56 space-y-2 overflow-auto">
            {derivedIslands.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No derived islands yet.
              </div>
            )}
            {derivedIslands.map(island => (
              <Button
                className="w-full justify-between"
                key={island.id}
                onClick={() => {
                  setSelectedIslandId(island.id);
                  setIslandDraft(createIslandDraft(island));
                  setSelectedControlPointId(null);
                  setSelectedPolygonIds([]);
                  onRecenter(getBoundsCenter(island.bbox));
                }}
                variant={selectedIslandId === island.id ? 'default' : 'outline'}
              >
                <span className="truncate">{island.name ?? island.id}</span>
                <span className="text-xs">
                  {Math.round(island.areaMeters2)}m²
                </span>
              </Button>
            ))}
          </div>
          {islandInspectorDraft && (
            <div className="space-y-4">
              <TextInput
                id="island-name"
                label="Name"
                value={islandInspectorDraft.name}
                onChange={name =>
                  setIslandDraft(draft => (draft ? { ...draft, name } : draft))
                }
              />
              <TextInput
                id="island-owner"
                label="Default Owner"
                value={islandInspectorDraft.defaultOwner}
                onChange={defaultOwner =>
                  setIslandDraft(draft =>
                    draft ? { ...draft, defaultOwner } : draft
                  )
                }
              />
              <TextInput
                id="island-faction"
                label="Default Faction"
                value={islandInspectorDraft.defaultFaction}
                onChange={defaultFaction =>
                  setIslandDraft(draft =>
                    draft ? { ...draft, defaultFaction } : draft
                  )
                }
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
        step={step}
        type="number"
        value={value}
        onChange={event => onChange(parseNumber(event.target.value, value))}
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
        value={value}
        onChange={event => onChange(event.target.value)}
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
