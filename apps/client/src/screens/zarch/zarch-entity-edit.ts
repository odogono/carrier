import type { ArchetypeCategory } from 'carrier-contracts/types';

export type ZarchEntityEditTool = 'place' | 'select';

export type ZarchEntityEditState = {
  activeArchetypeId: string | null;
  catalogCategory: ArchetypeCategory | null;
  catalogOpen: boolean;
  catalogSearch: string;
  enabled: boolean;
  error: string | null;
  hoveredEntityId: string | null;
  pendingAction: string | null;
  selectedEntityId: string | null;
  tool: ZarchEntityEditTool;
};

export type ZarchEntityEditAction =
  | { type: 'set-enabled'; enabled: boolean }
  | { type: 'set-tool'; tool: ZarchEntityEditTool }
  | { type: 'set-active-archetype'; archetypeId: string }
  | { type: 'select-entity'; entityId: string | null }
  | { type: 'hover-entity'; entityId: string | null }
  | { type: 'clear-selection' }
  | { type: 'set-catalog-open'; open: boolean }
  | { type: 'set-catalog-search'; search: string }
  | { type: 'set-catalog-category'; category: ArchetypeCategory | null }
  | { type: 'set-pending'; action: string | null }
  | { type: 'set-error'; error: string | null };

export const createZarchEntityEditState = (): ZarchEntityEditState => ({
  activeArchetypeId: null,
  catalogCategory: null,
  catalogOpen: false,
  catalogSearch: '',
  enabled: false,
  error: null,
  hoveredEntityId: null,
  pendingAction: null,
  selectedEntityId: null,
  tool: 'place'
});

export const reduceZarchEntityEditState = (
  state: ZarchEntityEditState,
  action: ZarchEntityEditAction
): ZarchEntityEditState => {
  switch (action.type) {
    case 'set-enabled':
      return {
        ...state,
        enabled: action.enabled,
        error: null,
        hoveredEntityId: null,
        pendingAction: null,
        selectedEntityId: action.enabled ? state.selectedEntityId : null
      };
    case 'set-tool':
      return {
        ...state,
        error: null,
        hoveredEntityId: null,
        tool: action.tool
      };
    case 'set-active-archetype':
      return {
        ...state,
        activeArchetypeId: action.archetypeId,
        error: null,
        tool: 'place'
      };
    case 'select-entity':
      return {
        ...state,
        error: null,
        selectedEntityId: action.entityId
      };
    case 'hover-entity':
      return {
        ...state,
        hoveredEntityId: action.entityId
      };
    case 'clear-selection':
      return {
        ...state,
        error: null,
        selectedEntityId: null
      };
    case 'set-catalog-open':
      return {
        ...state,
        catalogOpen: action.open
      };
    case 'set-catalog-search':
      return {
        ...state,
        catalogSearch: action.search
      };
    case 'set-catalog-category':
      return {
        ...state,
        catalogCategory: action.category
      };
    case 'set-pending':
      return {
        ...state,
        pendingAction: action.action
      };
    case 'set-error':
      return {
        ...state,
        error: action.error
      };
    default:
      return state;
  }
};
