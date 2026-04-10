import type { BooleanOperation } from 'carrier-contracts/types';
import {
  Combine,
  GitBranchPlus,
  Hand,
  Layers3,
  MapPinPlus,
  Move,
  PackagePlus,
  Redo2,
  ScanSearch,
  Undo2
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { EditorTool } from '../helpers';

type EditorToolbarProps = {
  availableTools: EditorTool[];
  booleanActionsVisible: boolean;
  canApplyDifference: boolean;
  canApplyUnionLike: boolean;
  canRedo: boolean;
  canUndo: boolean;
  onApplyBoolean: (operation: BooleanOperation) => void;
  onBeginControlPoint: () => void;
  onBeginDrawPolygon: () => void;
  onBeginPlaceEntity: () => void;
  onBeginVertexEdit: () => void;
  onRedo: () => void;
  onSelectTool: (tool: EditorTool) => void;
  onUndo: () => void;
  pendingAction: boolean;
  selectedPolygon: boolean;
  tool: EditorTool;
};

const toolOptions: Array<{
  icon: typeof ScanSearch;
  label: string;
  tool: EditorTool;
}> = [
  { icon: ScanSearch, label: 'Select', tool: 'select' },
  { icon: Hand, label: 'Pan', tool: 'pan' },
  { icon: Layers3, label: 'Terrain', tool: 'terrain' as EditorTool },
  { icon: PackagePlus, label: 'Place Entity', tool: 'place-entity' },
  { icon: GitBranchPlus, label: 'Draw Polygon', tool: 'draw-polygon' },
  { icon: Move, label: 'Edit Vertices', tool: 'edit-vertices' },
  { icon: MapPinPlus, label: 'Add Control Point', tool: 'place-control-point' }
];

export const EditorToolbar = ({
  availableTools,
  booleanActionsVisible,
  canApplyDifference,
  canApplyUnionLike,
  canRedo,
  canUndo,
  onApplyBoolean,
  onBeginControlPoint,
  onBeginDrawPolygon,
  onBeginPlaceEntity,
  onBeginVertexEdit,
  onRedo,
  onSelectTool,
  onUndo,
  pendingAction,
  selectedPolygon,
  tool
}: EditorToolbarProps) => (
  <div className="rounded-2xl border bg-card/80 p-3 shadow-sm">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <ToolbarSection eyebrow="Mode" title="Choose the active editing mode">
        <div className="flex flex-wrap gap-2">
          {toolOptions
            .filter(option => availableTools.includes(option.tool))
            .map(option => {
            const isActive = tool === option.tool;
            const Icon = option.icon;
            const commonProps = {
              className: cn(
                'justify-start rounded-xl px-3',
                isActive
                  ? 'border-transparent shadow-sm'
                  : 'border-border/70 bg-background/70'
              ),
              variant: isActive ? ('default' as const) : ('outline' as const)
            };

            if (option.tool === 'draw-polygon') {
              return (
                <Button
                  {...commonProps}
                  key={option.tool}
                  onClick={onBeginDrawPolygon}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </Button>
              );
            }

            if (option.tool === 'place-entity') {
              return (
                <Button
                  {...commonProps}
                  key={option.tool}
                  onClick={onBeginPlaceEntity}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </Button>
              );
            }

            if (option.tool === 'edit-vertices') {
              return (
                <Button
                  {...commonProps}
                  disabled={!selectedPolygon}
                  key={option.tool}
                  onClick={onBeginVertexEdit}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </Button>
              );
            }

            if (option.tool === 'place-control-point') {
              return (
                <Button
                  {...commonProps}
                  key={option.tool}
                  onClick={onBeginControlPoint}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </Button>
              );
            }

            return (
              <Button
                {...commonProps}
                key={option.tool}
                onClick={() => onSelectTool(option.tool)}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </Button>
            );
            })}
        </div>
      </ToolbarSection>

      <div className="flex flex-col gap-3 xl:min-w-[360px] xl:max-w-[420px] xl:items-stretch">
        <ToolbarSection
          eyebrow="History"
          title="Keyboard shortcuts stay unchanged"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canUndo || pendingAction}
              onClick={onUndo}
              title="Undo (Ctrl/Cmd+Z)"
              variant="outline"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
            <Button
              disabled={!canRedo || pendingAction}
              onClick={onRedo}
              title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              variant="outline"
            >
              <Redo2 className="h-4 w-4" />
              Redo
            </Button>
          </div>
        </ToolbarSection>

        {booleanActionsVisible ? (
          <ToolbarSection
            eyebrow="Boolean Tools"
            title="Available for ordered multi-selection"
          >
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canApplyUnionLike}
                onClick={() => onApplyBoolean('union')}
                variant="outline"
              >
                <Combine className="h-4 w-4" />
                Union
              </Button>
              <Button
                disabled={!canApplyDifference}
                onClick={() => onApplyBoolean('difference')}
                variant="outline"
              >
                Difference
              </Button>
              <Button
                disabled={!canApplyUnionLike}
                onClick={() => onApplyBoolean('intersection')}
                variant="outline"
              >
                Intersection
              </Button>
              <Button
                disabled={!canApplyUnionLike}
                onClick={() => onApplyBoolean('xor')}
                variant="outline"
              >
                XOR
              </Button>
            </div>
          </ToolbarSection>
        ) : null}
      </div>
    </div>
  </div>
);

const ToolbarSection = ({
  children,
  eyebrow,
  title
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) => (
  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
    <div className="mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {eyebrow}
      </div>
      <div className="text-sm text-foreground">{title}</div>
    </div>
    {children}
  </div>
);
