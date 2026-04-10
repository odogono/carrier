import type { Archetype, StaticEntity } from 'carrier-contracts/types';

import type {
  ZarchEntityEditState,
  ZarchEntityEditTool
} from './zarch-entity-edit';

type EditorMode = 'terrain' | 'entities';

type ZarchEntityEditHudProps = {
  archetypes: Archetype[];
  editorMode: EditorMode;
  editEnabled: boolean;
  entityEditState: ZarchEntityEditState;
  onCatalogToggle: () => void;
  onDeleteEntity: () => void;
  onRotateEntity: (direction: 'cw' | 'ccw') => void;
  onSetEditorMode: (mode: EditorMode) => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetTool: (tool: ZarchEntityEditTool) => void;
  selectedEntity: StaticEntity | null;
};

const TOOL_LABELS: Record<ZarchEntityEditTool, string> = {
  place: 'Place',
  select: 'Select'
};

export const ZarchEntityEditHud = ({
  archetypes,
  editorMode,
  editEnabled,
  entityEditState,
  onCatalogToggle,
  onDeleteEntity,
  onRotateEntity,
  onSetEditorMode,
  onSetEnabled,
  onSetTool,
  selectedEntity
}: ZarchEntityEditHudProps) => {
  const activeArchetype = entityEditState.activeArchetypeId
    ? archetypes.find(a => a.id === entityEditState.activeArchetypeId) ?? null
    : null;

  const hasSelection = entityEditState.selectedEntityId !== null;
  const isPending = entityEditState.pendingAction !== null;

  return (
    <div className="pointer-events-auto absolute left-3 top-10 z-20 flex max-w-[min(56rem,calc(100vw-1.5rem))] flex-col gap-2 rounded border border-[#c8a000] bg-[#111] px-3 py-2 font-mono text-[12px] text-[#e8d060] shadow-[0_0_0_1px_rgba(0,0,0,0.45)]">
      {/* Row 1: Enable + Mode strip */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded border border-[#c8a000] bg-[#2a2200] px-2 py-1 text-[#ffe58a] transition hover:bg-[#403400]"
          onClick={() => onSetEnabled(!editEnabled)}
          type="button"
        >
          {editEnabled ? 'Exit Edit' : 'Enter Edit'}
        </button>
        <button
          className={`rounded border px-2 py-1 transition ${
            editorMode === 'terrain'
              ? 'border-[#f6d84a] bg-[#4c3f00] text-[#fff0a0]'
              : 'border-[#6d5800] bg-[#1d1800] text-[#d6bf68] hover:bg-[#2a2200]'
          }`}
          onClick={() => onSetEditorMode('terrain')}
          type="button"
        >
          Terrain
        </button>
        <button
          className={`rounded border px-2 py-1 transition ${
            editorMode === 'entities'
              ? 'border-[#f6d84a] bg-[#4c3f00] text-[#fff0a0]'
              : 'border-[#6d5800] bg-[#1d1800] text-[#d6bf68] hover:bg-[#2a2200]'
          }`}
          onClick={() => onSetEditorMode('entities')}
          type="button"
        >
          Entities
        </button>
      </div>

      {editorMode === 'entities' && (
        <>
          {/* Row 2: Entity tools */}
          <div className="flex flex-wrap items-center gap-2">
            {(['place', 'select'] as const).map(tool => (
              <button
                className={`rounded border px-2 py-1 transition ${
                  entityEditState.tool === tool
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
              className={`rounded border px-2 py-1 transition ${
                entityEditState.catalogOpen
                  ? 'border-[#f6d84a] bg-[#4c3f00] text-[#fff0a0]'
                  : 'border-[#6d5800] bg-[#1d1800] text-[#d6bf68] hover:bg-[#2a2200]'
              }`}
              onClick={onCatalogToggle}
              type="button"
            >
              Catalog
            </button>
            <button
              className="rounded border border-[#4e7e9f] bg-[#10212b] px-2 py-1 text-[#9edcff] transition hover:bg-[#173142] disabled:opacity-40"
              disabled={!hasSelection || isPending}
              onClick={() => onRotateEntity('ccw')}
              type="button"
            >
              Rotate -
            </button>
            <button
              className="rounded border border-[#4e7e9f] bg-[#10212b] px-2 py-1 text-[#9edcff] transition hover:bg-[#173142] disabled:opacity-40"
              disabled={!hasSelection || isPending}
              onClick={() => onRotateEntity('cw')}
              type="button"
            >
              Rotate +
            </button>
            <button
              className="rounded border border-[#8c3f3f] bg-[#260d0d] px-2 py-1 text-[#e68e8e] transition hover:bg-[#381414] disabled:opacity-40"
              disabled={!hasSelection || isPending}
              onClick={onDeleteEntity}
              type="button"
            >
              Delete
            </button>
          </div>

          {/* Row 3: Active archetype + selection info */}
          <div className="flex flex-wrap items-center gap-4 text-[#d6bf68]">
            <span>
              Archetype:{' '}
              {activeArchetype ? (
                <span className="text-[#ffe58a]">{activeArchetype.name}</span>
              ) : (
                <span className="text-[#a09050]">None selected</span>
              )}
            </span>
            {selectedEntity && (
              <>
                <span>
                  Selected: <span className="text-[#ffe58a]">{selectedEntity.label ?? selectedEntity.id}</span>
                </span>
                <span>Yaw: {selectedEntity.rotation.yaw}</span>
              </>
            )}
            {isPending && (
              <span className="text-[#9edcff]">{entityEditState.pendingAction}...</span>
            )}
          </div>
        </>
      )}

      {entityEditState.error && (
        <div className="text-[#ff9090]">{entityEditState.error}</div>
      )}
    </div>
  );
};
