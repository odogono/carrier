import type { FocusEvent, KeyboardEvent } from 'react';

import type { Archetype, StaticEntity } from 'carrier-contracts/types';

import type {
  ZarchEntityEditState,
  ZarchEntityEditTool
} from './zarch-entity-edit';

type EditorMode = 'terrain' | 'entities';

type ZarchEntityEditHudProps = {
  archetypes: Archetype[];
  editEnabled: boolean;
  editorMode: EditorMode;
  entityEditState: ZarchEntityEditState;
  onCatalogToggle: () => void;
  onDeleteEntity: () => void;
  onRotateEntity: (direction: 'cw' | 'ccw') => void;
  onSetEditorMode: (mode: EditorMode) => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetEntityYOffset: (yOffset: number) => void;
  onSetTool: (tool: ZarchEntityEditTool) => void;
  selectedEntity: StaticEntity | null;
};

const TOOL_LABELS: Record<ZarchEntityEditTool, string> = {
  place: 'Place',
  select: 'Select'
};

const blurInputOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== 'Enter') {
    return;
  }

  event.currentTarget.blur();
};

export const getCommittedEntityYOffset = ({
  currentYOffset,
  value
}: {
  currentYOffset: number;
  value: string;
}) => {
  if (value.trim() === '') {
    return null;
  }

  const nextYOffset = Number(value);

  if (!Number.isFinite(nextYOffset) || nextYOffset === currentYOffset) {
    return null;
  }

  return nextYOffset;
};

export const ZarchEntityEditHud = ({
  archetypes,
  editEnabled,
  editorMode,
  entityEditState,
  onCatalogToggle,
  onDeleteEntity,
  onRotateEntity,
  onSetEditorMode,
  onSetEnabled,
  onSetEntityYOffset,
  onSetTool,
  selectedEntity
}: ZarchEntityEditHudProps) => {
  const activeArchetype = entityEditState.activeArchetypeId
    ? (archetypes.find(a => a.id === entityEditState.activeArchetypeId) ?? null)
    : null;

  const hasSelection = entityEditState.selectedEntityId !== null;
  const isPending = entityEditState.pendingAction !== null;

  const handleYOffsetBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (!selectedEntity || isPending) {
      return;
    }

    const nextYOffset = getCommittedEntityYOffset({
      currentYOffset: selectedEntity.yOffset,
      value: event.currentTarget.value
    });

    if (nextYOffset === null) {
      event.currentTarget.value = String(selectedEntity.yOffset);
      return;
    }

    onSetEntityYOffset(nextYOffset);
  };

  return (
    <div className="pointer-events-auto absolute top-10 left-3 z-20 flex max-w-[min(56rem,calc(100vw-1.5rem))] flex-col gap-2 rounded border border-[#c8a000] bg-[#111] px-3 py-2 font-mono text-[12px] text-[#e8d060] shadow-[0_0_0_1px_rgba(0,0,0,0.45)]">
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
                  Selected:{' '}
                  <span className="text-[#ffe58a]">
                    {selectedEntity.label ?? selectedEntity.id}
                  </span>
                </span>
                <span>Yaw: {selectedEntity.rotation.yaw}</span>
                <span>Offset: {selectedEntity.yOffset.toFixed(1)}m</span>
              </>
            )}
            {isPending && (
              <span className="text-[#9edcff]">
                {entityEditState.pendingAction}...
              </span>
            )}
          </div>
          {selectedEntity && (
            <label className="flex w-fit items-center gap-2 text-[#d6bf68]">
              <span>Height Offset</span>
              <input
                className="w-20 rounded border border-[#6d5800] bg-[#1d1800] px-2 py-1 text-[#ffe58a] outline-none focus:border-[#c8a000] disabled:opacity-40"
                defaultValue={selectedEntity.yOffset}
                disabled={isPending}
                key={`${selectedEntity.id}:${selectedEntity.yOffset}`}
                onBlur={handleYOffsetBlur}
                onKeyDown={blurInputOnEnter}
                step="0.1"
                type="number"
              />
              <span>m</span>
            </label>
          )}
        </>
      )}

      {entityEditState.error && (
        <div className="text-[#ff9090]">{entityEditState.error}</div>
      )}
    </div>
  );
};
