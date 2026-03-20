import type {
  BooleanOperation,
  ControlPoint,
  SourcePolygon
} from 'carrier-contracts/types';
import { atom } from 'jotai';

import type { EditorTool } from '../helpers';
import type {
  ControlPointDraft,
  IslandDraft,
  PolygonDraft
} from '../helpers/types';

export type EditorSnapshot = {
  controlPointDraft: ControlPointDraft | null;
  islandDraft: IslandDraft | null;
  polygonControlPointDrafts: ControlPointDraft[];
  polygonDraft: PolygonDraft | null;
  selectedControlPointId: string | null;
  selectedIslandId: string | null;
  selectedPolygonIds: string[];
  tool: EditorTool;
};

export type PolygonTransition = {
  after: SourcePolygon[];
  afterCurrentIds: string[];
  before: SourcePolygon[];
  beforeCurrentIds: string[];
  kind: 'polygon';
  label: 'boolean' | 'create' | 'delete' | 'save';
  operation?: BooleanOperation;
  side: 'after' | 'before';
};

export type ControlPointTransition = {
  after: ControlPoint[];
  afterCurrentIds: string[];
  before: ControlPoint[];
  beforeCurrentIds: string[];
  kind: 'control-point';
  label: 'create' | 'delete' | 'save';
  side: 'after' | 'before';
};

export type RemoteTransition = PolygonTransition | ControlPointTransition;

export type HistoryEntry = {
  after: EditorSnapshot;
  before: EditorSnapshot;
  remoteTransitions: RemoteTransition[];
};

export type EditorHistoryState = {
  future: HistoryEntry[];
  past: HistoryEntry[];
  snapshot: EditorSnapshot;
};

export const createEmptyEditorSnapshot = (): EditorSnapshot => ({
  controlPointDraft: null,
  islandDraft: null,
  polygonControlPointDrafts: [],
  polygonDraft: null,
  selectedControlPointId: null,
  selectedIslandId: null,
  selectedPolygonIds: [],
  tool: 'select'
});

const initialState = (): EditorHistoryState => ({
  future: [],
  past: [],
  snapshot: createEmptyEditorSnapshot()
});

export const editorHistoryStateAtom = atom<EditorHistoryState>(initialState());

export const editorSnapshotAtom = atom(
  get => get(editorHistoryStateAtom).snapshot,
  (get, set, nextSnapshot: EditorSnapshot) => {
    set(editorHistoryStateAtom, {
      ...get(editorHistoryStateAtom),
      snapshot: nextSnapshot
    });
  }
);

export const canUndoAtom = atom(
  get => get(editorHistoryStateAtom).past.length > 0
);
export const canRedoAtom = atom(
  get => get(editorHistoryStateAtom).future.length > 0
);

export const resetEditorHistoryAtom = atom(
  null,
  (_get, set, snapshot: EditorSnapshot = createEmptyEditorSnapshot()) => {
    set(editorHistoryStateAtom, {
      future: [],
      past: [],
      snapshot
    });
  }
);

const MAX_HISTORY = 50;

export const recordEditorHistoryAtom = atom(
  null,
  (get, set, entry: HistoryEntry) => {
    const past = [...get(editorHistoryStateAtom).past, entry];
    if (past.length > MAX_HISTORY) {
      past.shift();
    }

    set(editorHistoryStateAtom, {
      future: [],
      past,
      snapshot: entry.after
    });
  }
);

export const snapshotsEqual = (left: EditorSnapshot, right: EditorSnapshot) =>
  left.tool === right.tool &&
  left.selectedControlPointId === right.selectedControlPointId &&
  left.selectedIslandId === right.selectedIslandId &&
  left.polygonDraft === right.polygonDraft &&
  left.polygonControlPointDrafts === right.polygonControlPointDrafts &&
  left.controlPointDraft === right.controlPointDraft &&
  left.islandDraft === right.islandDraft &&
  left.selectedPolygonIds === right.selectedPolygonIds;

const remapId = (
  id: string,
  originals: readonly string[],
  replacements: readonly string[]
) => {
  const index = originals.indexOf(id);
  return index >= 0 ? (replacements[index] ?? id) : id;
};

export const remapSnapshotForTransition = (
  snapshot: EditorSnapshot,
  transition: RemoteTransition,
  side: 'after' | 'before'
): EditorSnapshot => {
  if (transition.kind === 'polygon') {
    const originals =
      side === 'before'
        ? transition.before.map(polygon => polygon.id)
        : transition.after.map(polygon => polygon.id);
    const replacements =
      side === 'before'
        ? transition.beforeCurrentIds
        : transition.afterCurrentIds;

    return {
      ...snapshot,
      polygonControlPointDrafts: snapshot.polygonControlPointDrafts,
      polygonDraft: snapshot.polygonDraft?.id
        ? {
            ...snapshot.polygonDraft,
            id: remapId(snapshot.polygonDraft.id, originals, replacements)
          }
        : snapshot.polygonDraft,
      selectedPolygonIds: snapshot.selectedPolygonIds.map(id =>
        remapId(id, originals, replacements)
      )
    };
  }

  const originals =
    side === 'before'
      ? transition.before.map(point => point.id)
      : transition.after.map(point => point.id);
  const replacements =
    side === 'before'
      ? transition.beforeCurrentIds
      : transition.afterCurrentIds;

  return {
    ...snapshot,
    controlPointDraft: snapshot.controlPointDraft?.id
      ? {
          ...snapshot.controlPointDraft,
          id: remapId(snapshot.controlPointDraft.id, originals, replacements)
        }
      : snapshot.controlPointDraft,
    polygonControlPointDrafts: snapshot.polygonControlPointDrafts.map(draft =>
      draft.id
        ? {
            ...draft,
            id: remapId(draft.id, originals, replacements)
          }
        : draft
    ),
    selectedControlPointId: snapshot.selectedControlPointId
      ? remapId(snapshot.selectedControlPointId, originals, replacements)
      : snapshot.selectedControlPointId
  };
};
