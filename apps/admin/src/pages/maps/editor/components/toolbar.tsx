import type { BooleanOperation } from 'carrier-contracts/types';
import { Redo2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { EditorTool } from '../helpers';

type EditorToolbarProps = {
  canApplyDifference: boolean;
  canApplyUnionLike: boolean;
  canRedo: boolean;
  canUndo: boolean;
  onApplyBoolean: (operation: BooleanOperation) => void;
  onBeginControlPoint: () => void;
  onBeginDrawPolygon: () => void;
  onBeginVertexEdit: () => void;
  onRedo: () => void;
  onSelectTool: (tool: EditorTool) => void;
  onUndo: () => void;
  pendingAction: boolean;
  selectedPolygon: boolean;
  tool: EditorTool;
};

export function EditorToolbar({
  canApplyDifference,
  canApplyUnionLike,
  canRedo,
  canUndo,
  onApplyBoolean,
  onBeginControlPoint,
  onBeginDrawPolygon,
  onBeginVertexEdit,
  onRedo,
  onSelectTool,
  onUndo,
  pendingAction,
  selectedPolygon,
  tool
}: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={tool === 'select' ? 'default' : 'outline'}
        onClick={() => onSelectTool('select')}
      >
        Select
      </Button>
      <Button
        variant={tool === 'pan' ? 'default' : 'outline'}
        onClick={() => onSelectTool('pan')}
      >
        Pan
      </Button>
      <Button
        variant={tool === 'draw-polygon' ? 'default' : 'outline'}
        onClick={onBeginDrawPolygon}
      >
        Draw Polygon
      </Button>
      <Button
        variant={tool === 'edit-vertices' ? 'default' : 'outline'}
        disabled={!selectedPolygon}
        onClick={onBeginVertexEdit}
      >
        Edit Vertices
      </Button>
      <Button
        variant={tool === 'place-control-point' ? 'default' : 'outline'}
        onClick={onBeginControlPoint}
      >
        Add Control Point
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          disabled={!canUndo || pendingAction}
          onClick={onUndo}
          title="Undo (Ctrl/Cmd+Z)"
          variant="outline"
        >
          <Undo2 className="mr-2 h-4 w-4" />
          Undo
        </Button>
        <Button
          disabled={!canRedo || pendingAction}
          onClick={onRedo}
          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
          variant="outline"
        >
          <Redo2 className="mr-2 h-4 w-4" />
          Redo
        </Button>
        <Button
          variant="outline"
          disabled={!canApplyUnionLike}
          onClick={() => onApplyBoolean('union')}
        >
          Union
        </Button>
        <Button
          variant="outline"
          disabled={!canApplyDifference}
          onClick={() => onApplyBoolean('difference')}
        >
          Difference
        </Button>
        <Button
          variant="outline"
          disabled={!canApplyUnionLike}
          onClick={() => onApplyBoolean('intersection')}
        >
          Intersection
        </Button>
        <Button
          variant="outline"
          disabled={!canApplyUnionLike}
          onClick={() => onApplyBoolean('xor')}
        >
          XOR
        </Button>
      </div>
    </div>
  );
}
