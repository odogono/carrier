import { useMemo } from 'react';

import type {
  Archetype,
  ArchetypeCategory,
  AssetVersion
} from 'carrier-contracts/types';

type ZarchEntityCatalogProps = {
  activeArchetypeId: string | null;
  archetypes: Archetype[];
  assetVersionsById: Map<string, AssetVersion>;
  category: ArchetypeCategory | null;
  onClose: () => void;
  onSelectArchetype: (archetypeId: string) => void;
  onSetCategory: (category: ArchetypeCategory | null) => void;
  onSetSearch: (search: string) => void;
  referencedArchetypeIds: Set<string>;
  search: string;
};

const CATEGORIES: Array<{ label: string; value: ArchetypeCategory | null }> = [
  { label: 'All', value: null },
  { label: 'Building', value: 'building' },
  { label: 'Landmark', value: 'landmark' },
  { label: 'Industrial', value: 'industrial' },
  { label: 'Prop', value: 'natural-prop' }
];

export const ZarchEntityCatalog = ({
  activeArchetypeId,
  archetypes,
  assetVersionsById,
  category,
  onClose,
  onSelectArchetype,
  onSetCategory,
  onSetSearch,
  referencedArchetypeIds,
  search
}: ZarchEntityCatalogProps) => {
  const filtered = useMemo(() => {
    let result = archetypes;

    if (category) {
      result = result.filter(a => a.category === category);
    }

    if (search.trim()) {
      const lower = search.trim().toLowerCase();
      result = result.filter(
        a =>
          a.name.toLowerCase().includes(lower) ||
          a.category.toLowerCase().includes(lower) ||
          a.tags.some(t => t.toLowerCase().includes(lower))
      );
    }

    return result;
  }, [archetypes, category, search]);

  return (
    <div className="pointer-events-auto absolute right-3 top-10 z-20 flex h-[min(36rem,calc(100vh-6rem))] w-64 flex-col rounded border border-[#c8a000] bg-[#111] font-mono text-[12px] text-[#e8d060] shadow-[0_0_0_1px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <span className="text-[#ffe58a]">Archetype Catalog</span>
        <button
          className="rounded border border-[#6d5800] bg-[#1d1800] px-2 py-0.5 text-[#d6bf68] transition hover:bg-[#2a2200]"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-[#333] px-3 py-2">
        <input
          autoFocus
          className="w-full rounded border border-[#6d5800] bg-[#1d1800] px-2 py-1 text-[#ffe58a] placeholder-[#6d5800] outline-none focus:border-[#c8a000]"
          onChange={event => onSetSearch(event.currentTarget.value)}
          placeholder="Search..."
          type="text"
          value={search}
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-1 border-b border-[#333] px-3 py-2">
        {CATEGORIES.map(cat => (
          <button
            className={`rounded border px-2 py-0.5 transition ${
              category === cat.value
                ? 'border-[#f6d84a] bg-[#4c3f00] text-[#fff0a0]'
                : 'border-[#6d5800] bg-[#1d1800] text-[#d6bf68] hover:bg-[#2a2200]'
            }`}
            key={cat.label}
            onClick={() => onSetCategory(cat.value)}
            type="button"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Archetype list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[#6d5800]">
            No archetypes found.
          </div>
        ) : (
          filtered.map(archetype => {
            const assetVersion = assetVersionsById.get(
              archetype.assetVersionId
            );
            const isActive = archetype.id === activeArchetypeId;
            const isReferenced = referencedArchetypeIds.has(archetype.id);

            return (
              <button
                className={`flex w-full flex-col gap-0.5 border-b border-[#222] px-3 py-2 text-left transition ${
                  isActive
                    ? 'bg-[#4c3f00]'
                    : 'hover:bg-[#1d1800]'
                }`}
                key={archetype.id}
                onClick={() => onSelectArchetype(archetype.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className={isActive ? 'text-[#fff0a0]' : 'text-[#ffe58a]'}>
                    {archetype.name}
                  </span>
                  {isReferenced && (
                    <span className="rounded bg-[#2a2200] px-1 text-[10px] text-[#a09050]">
                      on map
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[#a09050]">
                  <span>{archetype.category}</span>
                  {assetVersion && (
                    <span>
                      {assetVersion.footprint.widthMeters.toFixed(0)}x
                      {assetVersion.footprint.depthMeters.toFixed(0)}m
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
