import type { BooleanOperation } from 'carrier-contracts/types';

import { Button } from '@/components/ui/button';

import type { EditorTool } from '../helpers';

type EditorToolbarProps = {
  canApplyDifference: boolean;
  canApplyUnionLike: boolean;
  onApplyBoolean: (operation: BooleanOperation) => void;
  onBeginControlPoint: () => void;
  onBeginDrawPolygon: () => void;
  onBeginVertexEdit: () => void;
  onSelectTool: (tool: EditorTool) => void;
  selectedPolygon: boolean;
  tool: EditorTool;
};

export function EditorToolbar({
  canApplyDifference,
  canApplyUnionLike,
  onApplyBoolean,
  onBeginControlPoint,
  onBeginDrawPolygon,
  onBeginVertexEdit,
  onSelectTool,
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
