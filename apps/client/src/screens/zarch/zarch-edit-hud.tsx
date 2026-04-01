import type { ZarchTileEditConfig } from 'carrier-contracts/types';

import type {
  ZarchTileEditState,
  ZarchTileEditTool,
  ZarchTileState
} from './zarch-tile-edit';

type ZarchEditHudProps = {
  editConfig: ZarchTileEditConfig;
  editState: ZarchTileEditState;
  haloTileCount: number;
  inspectedTile: ZarchTileState | null;
  isSaving: boolean;
  onCancel: () => void;
  onClearSelection: () => void;
  onFlattenSelection: () => void;
  onLowerSelection: () => void;
  onRedo: () => void;
  onRaiseSelection: () => void;
  onSave: () => void;
  onSetColorIndex: (colorIndex: number | null) => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetTool: (tool: ZarchTileEditTool) => void;
  onSetTypeId: (typeId: string) => void;
  onUndo: () => void;
};

const TOOL_LABELS: Record<ZarchTileEditTool, string> = {
  height: 'Height',
  'set-color': 'Color',
  'set-type': 'Type'
};

export const ZarchEditHud = ({
  editConfig,
  editState,
  haloTileCount,
  inspectedTile,
  isSaving,
  onCancel,
  onClearSelection,
  onFlattenSelection,
  onLowerSelection,
  onRedo,
  onRaiseSelection,
  onSave,
  onSetColorIndex,
  onSetEnabled,
  onSetTool,
  onSetTypeId,
  onUndo
}: ZarchEditHudProps) => {
  const dirtyCount = Object.keys(editState.edits).length;
  const selectionCount = Object.keys(editState.heightSelection).length;

  return (
    <div className="pointer-events-auto absolute left-3 top-10 z-20 flex max-w-[min(56rem,calc(100vw-1.5rem))] flex-col gap-2 rounded border border-[#c8a000] bg-[#111] px-3 py-2 font-mono text-[12px] text-[#e8d060] shadow-[0_0_0_1px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded border border-[#c8a000] bg-[#2a2200] px-2 py-1 text-[#ffe58a] transition hover:bg-[#403400]"
          onClick={() => onSetEnabled(!editState.enabled)}
          type="button"
        >
          {editState.enabled ? 'Exit Edit' : 'Enter Edit'}
        </button>
        {(['height', 'set-color', 'set-type'] as const).map(tool => (
          <button
            className={`rounded border px-2 py-1 transition ${
              editState.tool === tool
                ? 'border-[#f6d84a] bg-[#4c3f00] text-[#fff0a0]'
                : 'border-[#6d5800] bg-[#1d1800] text-[#d6bf68] hover:bg-[#2a2200]'
            }`}
            key={tool}
            onClick={() => onSetTool(tool)}
            type="button"
          >
            {TOOL_LABELS[tool]}
          </button>
        ))}
        <button
          className="rounded border border-[#6d5800] bg-[#1d1800] px-2 py-1 text-[#d6bf68] transition hover:bg-[#2a2200] disabled:opacity-40"
          disabled={!editState.canUndo}
          onClick={onUndo}
          type="button"
        >
          Undo
        </button>
        <button
          className="rounded border border-[#6d5800] bg-[#1d1800] px-2 py-1 text-[#d6bf68] transition hover:bg-[#2a2200] disabled:opacity-40"
          disabled={!editState.canRedo}
          onClick={onRedo}
          type="button"
        >
          Redo
        </button>
        {editState.tool === 'height' ? (
          <>
            <button
              className="rounded border border-[#4e7e9f] bg-[#10212b] px-2 py-1 text-[#9edcff] transition hover:bg-[#173142] disabled:opacity-40"
              disabled={selectionCount === 0}
              onClick={onFlattenSelection}
              type="button"
            >
              Flatten
            </button>
            <button
              className="rounded border border-[#4e7e9f] bg-[#10212b] px-2 py-1 text-[#9edcff] transition hover:bg-[#173142] disabled:opacity-40"
              disabled={selectionCount === 0}
              onClick={onRaiseSelection}
              type="button"
            >
              Raise
            </button>
            <button
              className="rounded border border-[#4e7e9f] bg-[#10212b] px-2 py-1 text-[#9edcff] transition hover:bg-[#173142] disabled:opacity-40"
              disabled={selectionCount === 0}
              onClick={onLowerSelection}
              type="button"
            >
              Lower
            </button>
            <button
              className="rounded border border-[#6d5800] bg-[#1d1800] px-2 py-1 text-[#d6bf68] transition hover:bg-[#2a2200] disabled:opacity-40"
              disabled={selectionCount === 0}
              onClick={onClearSelection}
              type="button"
            >
              Clear Selection
            </button>
          </>
        ) : null}
        <button
          className="rounded border border-[#3f8c4a] bg-[#0d2612] px-2 py-1 text-[#8ee69b] transition hover:bg-[#14381b] disabled:opacity-40"
          disabled={dirtyCount === 0 || isSaving}
          onClick={onSave}
          type="button"
        >
          {isSaving ? 'Saving...' : `Save (${dirtyCount})`}
        </button>
        <button
          className="rounded border border-[#8c5a3f] bg-[#26160d] px-2 py-1 text-[#e6b58e] transition hover:bg-[#382114] disabled:opacity-40"
          disabled={dirtyCount === 0 || isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span>Type:</span>
        <select
          className="rounded border border-[#6d5800] bg-[#1d1800] px-2 py-1 text-[#ffe58a]"
          onChange={event => onSetTypeId(event.currentTarget.value)}
          value={editState.selectedTypeId}
        >
          {editConfig.tileTypes.map(tileType => (
            <option key={tileType.id} value={tileType.id}>
              {tileType.label}
            </option>
          ))}
        </select>
        <span>Palette:</span>
        <button
          className={`rounded border px-2 py-1 transition ${
            editState.selectedColorIndex === null
              ? 'border-[#f6d84a] bg-[#4c3f00] text-[#fff0a0]'
              : 'border-[#6d5800] bg-[#1d1800] text-[#d6bf68] hover:bg-[#2a2200]'
          }`}
          onClick={() => onSetColorIndex(null)}
          type="button"
        >
          Auto
        </button>
        {editConfig.palette.map((entry, index) => (
          <button
            className={`flex items-center gap-2 rounded border px-2 py-1 transition ${
              editState.selectedColorIndex === index
                ? 'border-[#f6d84a] bg-[#4c3f00]'
                : 'border-[#6d5800] bg-[#1d1800] hover:bg-[#2a2200]'
            }`}
            key={entry.id}
            onClick={() => onSetColorIndex(index)}
            type="button"
          >
            <span
              className="inline-block h-3 w-3 rounded-sm border border-black/60"
              style={{ backgroundColor: entry.hex }}
            />
            <span>{entry.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[#d6bf68]">
        <span>Dirty: {dirtyCount}</span>
        {editState.tool === 'height' ? (
          <>
            <span>Selection: {selectionCount}</span>
            <span>Halo: {haloTileCount}</span>
          </>
        ) : null}
        {inspectedTile ? (
          <>
            <span>
              Tile: {inspectedTile.tileX}, {inspectedTile.tileZ}
            </span>
            <span>Type: {inspectedTile.typeId}</span>
            <span>Height Steps: {inspectedTile.heightSteps}</span>
            <span>
              Color:{' '}
              {inspectedTile.colorIndex === null
                ? 'Auto'
                : editConfig.palette[inspectedTile.colorIndex]?.label ?? 'Custom'}
            </span>
          </>
        ) : (
          <span>Move the pointer over terrain to inspect a tile.</span>
        )}
      </div>

      {editState.tool === 'height' ? (
        <div className="text-[#a09050]">
          Drag to paint a height selection, then flatten, raise, or lower the selected area. Exact flattening may also edit a one-tile halo.
        </div>
      ) : null}

      {editState.saveError ? (
        <div className="text-[#ff9090]">{editState.saveError}</div>
      ) : null}
    </div>
  );
};
