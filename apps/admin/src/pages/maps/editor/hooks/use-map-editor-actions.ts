import type {
  BooleanOperation,
  ControlPoint,
  MapMetadata,
  SourcePolygon,
  WorldBounds
} from 'carrier-contracts/types';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { client } from '@/lib/api-client';

import {
  canSavePolygonDraft,
  mergeWorldBounds
} from '../helpers';
import { boundsFromPolygons, createIslandDraft } from '../helpers/drafts';
import { getErrorCode, toMessage } from '../helpers/errors';
import type {
  ControlPointDraft,
  DeleteTarget,
  IslandDraft,
  PolygonDraft
} from '../helpers/types';
import {
  createEmptyEditorSnapshot,
  remapSnapshotForTransition,
  type ControlPointTransition,
  type EditorHistoryState,
  type EditorSnapshot,
  type HistoryEntry,
  type PolygonTransition,
  type RemoteTransition
} from '../state/history';

type SnapshotUpdater<T> = (value: T | ((current: T) => T), record?: boolean) => void;

type UseMapEditorActionsOptions = {
  controlPointDraft: ControlPointDraft | null;
  controlPoints: ControlPoint[];
  deleteTarget: DeleteTarget;
  editorRevision: number | null;
  fitToWorldBounds: (
    bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
  ) => void;
  getHistoryState: () => EditorHistoryState;
  historySnapshot: EditorSnapshot;
  id: string;
  invalidateIslandMetadataQueries: () => Promise<unknown>;
  invalidateTerrainMutation: (
    dirtyBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>
  ) => Promise<unknown>;
  islandDraft: IslandDraft | null;
  map: MapMetadata | null | undefined;
  polygonDraft: PolygonDraft | null;
  polygonControlPointDrafts: ControlPointDraft[];
  polygons: SourcePolygon[];
  recordHistory: (entry: HistoryEntry) => void;
  reloadAll: () => Promise<MapMetadata | null>;
  selectedControlPoint: ControlPoint | null;
  selectedPolygon: SourcePolygon | null;
  selectedPolygonIds: string[];
  setDeleteTarget: (value: DeleteTarget) => void;
  setEditorRevision: (value: number | null | ((current: number | null) => number | null)) => void;
  setHistoryState: (state: EditorHistoryState) => void;
  setIslandDraft: SnapshotUpdater<IslandDraft | null>;
  setSnapshot: (snapshot: EditorSnapshot) => void;
};

const toControlPointCreateInput = (
  point: Pick<
    ControlPoint,
    | 'elevationMeters'
    | 'influenceMeters'
    | 'strength'
    | 'type'
    | 'x'
    | 'z'
  >,
  expectedRevision: number,
  mapId: string
) => ({
  ...point,
  expectedRevision,
  mapId
});

const toPolygonTransition = (
  label: PolygonTransition['label'],
  before: SourcePolygon[],
  after: SourcePolygon[],
  side: 'after' | 'before' = 'after',
  operation?: BooleanOperation
): PolygonTransition => ({
  after,
  afterCurrentIds: after.map(polygon => polygon.id),
  before,
  beforeCurrentIds: before.map(polygon => polygon.id),
  kind: 'polygon',
  label,
  operation,
  side
});

const toControlPointTransition = (
  label: ControlPointTransition['label'],
  before: ControlPoint[],
  after: ControlPoint[],
  side: 'after' | 'before' = 'after'
): ControlPointTransition => ({
  after,
  afterCurrentIds: after.map(point => point.id),
  before,
  beforeCurrentIds: before.map(point => point.id),
  kind: 'control-point',
  label,
  side
});

export const useMapEditorActions = ({
  controlPointDraft,
  controlPoints,
  deleteTarget,
  editorRevision,
  fitToWorldBounds,
  getHistoryState,
  historySnapshot,
  id,
  invalidateIslandMetadataQueries,
  invalidateTerrainMutation,
  islandDraft,
  map,
  polygonDraft,
  polygonControlPointDrafts,
  polygons,
  recordHistory,
  reloadAll,
  selectedControlPoint,
  selectedPolygon,
  selectedPolygonIds,
  setDeleteTarget,
  setEditorRevision,
  setHistoryState,
  setIslandDraft,
  setSnapshot
}: UseMapEditorActionsOptions) => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const syncRevisionFromServer = useCallback(async () => {
    const freshMap = await reloadAll();
    setEditorRevision(freshMap?.revision ?? null);
  }, [reloadAll, setEditorRevision]);

  const resetHistoryToServer = useCallback(() => {
    setHistoryState({
      future: [],
      past: [],
      snapshot: createEmptyEditorSnapshot()
    });
    setDeleteTarget(null);
  }, [setDeleteTarget, setHistoryState]);

  const handleConflict = useCallback(async () => {
    resetHistoryToServer();
    await syncRevisionFromServer();
    toast.error('The editor was out of date. Reloaded latest map data.');
  }, [resetHistoryToServer, syncRevisionFromServer]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (pendingAction) {
        return;
      }

      setPendingAction(label);

      try {
        await action();
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction]
  );

  const commitHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      recordHistory(entry);
    },
    [recordHistory]
  );

  const executeRemoteTransition = useCallback(
    async (
      transition: RemoteTransition,
      targetSide: 'after' | 'before',
      startingRevision: number
    ) => {
      let revision = startingRevision;
      let dirtyBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'> | null =
        null;

      if (transition.kind === 'polygon') {
        const activeIds =
          transition.side === 'before'
            ? transition.beforeCurrentIds
            : transition.afterCurrentIds;
        const targetPolygons =
          targetSide === 'before' ? transition.before : transition.after;

        if (
          transition.label === 'save' &&
          transition.before.length === 1 &&
          transition.after.length === 1 &&
          activeIds.length === 1 &&
          targetPolygons.length === 1
        ) {
          const result = await client.maps.updateSourcePolygon({
            expectedRevision: revision,
            id: activeIds[0] ?? '',
            mapId: id,
            params: targetPolygons[0]!.params,
            vertices: targetPolygons[0]!.vertices
          });

          revision = result.mapRevision;
          dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);

          return {
            dirtyBounds,
            revision,
            transition: {
              ...transition,
              afterCurrentIds:
                targetSide === 'after'
                  ? [result.polygon.id]
                  : transition.afterCurrentIds,
              beforeCurrentIds:
                targetSide === 'before'
                  ? [result.polygon.id]
                  : transition.beforeCurrentIds,
              side: targetSide
            } satisfies PolygonTransition
          };
        }

        for (const polygonId of activeIds) {
          const result = await client.maps.deleteSourcePolygon({
            expectedRevision: revision,
            id: polygonId,
            mapId: id
          });

          revision = result.mapRevision;
          dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);
        }

        const nextIds: string[] = [];
        for (const polygon of targetPolygons) {
          const result = await client.maps.createSourcePolygon({
            expectedRevision: revision,
            mapId: id,
            params: polygon.params,
            vertices: polygon.vertices
          });

          revision = result.mapRevision;
          dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);
          nextIds.push(result.polygon.id);
        }

        return {
          dirtyBounds,
          revision,
          transition: {
            ...transition,
            afterCurrentIds:
              targetSide === 'after' ? nextIds : transition.afterCurrentIds,
            beforeCurrentIds:
              targetSide === 'before' ? nextIds : transition.beforeCurrentIds,
            side: targetSide
          } satisfies PolygonTransition
        };
      }

      const activeIds =
        transition.side === 'before'
          ? transition.beforeCurrentIds
          : transition.afterCurrentIds;
      const targetPoints =
        targetSide === 'before' ? transition.before : transition.after;

      if (
        transition.label === 'save' &&
        transition.before.length === 1 &&
        transition.after.length === 1 &&
        activeIds.length === 1 &&
        targetPoints.length === 1
      ) {
        const targetPoint = targetPoints[0]!;
        const result = await client.maps.updateControlPoint({
          ...toControlPointCreateInput(targetPoint, revision, id),
          id: activeIds[0] ?? ''
        });

        revision = result.mapRevision;
        dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);

        return {
          dirtyBounds,
          revision,
          transition: {
            ...transition,
            afterCurrentIds:
              targetSide === 'after'
                ? [result.controlPoint.id]
                : transition.afterCurrentIds,
            beforeCurrentIds:
              targetSide === 'before'
                ? [result.controlPoint.id]
                : transition.beforeCurrentIds,
            side: targetSide
          } satisfies ControlPointTransition
        };
      }

      for (const controlPointId of activeIds) {
        const result = await client.maps.deleteControlPoint({
          expectedRevision: revision,
          id: controlPointId,
          mapId: id
        });

        revision = result.mapRevision;
        dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);
      }

      const nextIds: string[] = [];
      for (const point of targetPoints) {
        const result = await client.maps.createControlPoint(
          toControlPointCreateInput(point, revision, id)
        );

        revision = result.mapRevision;
        dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);
        nextIds.push(result.controlPoint.id);
      }

      return {
        dirtyBounds,
        revision,
        transition: {
          ...transition,
          afterCurrentIds:
            targetSide === 'after' ? nextIds : transition.afterCurrentIds,
          beforeCurrentIds:
            targetSide === 'before' ? nextIds : transition.beforeCurrentIds,
          side: targetSide
        } satisfies ControlPointTransition
      };
    },
    [id]
  );

  const moveHistoryPointer = useCallback(
    async (direction: 'redo' | 'undo') => {
      const { future, past } = getHistoryState();
      const source = direction === 'undo' ? past : future;
      const entry = source.at(-1);

      if (!entry || editorRevision === null) {
        return;
      }

      await runAction(direction, async () => {
        try {
          const targetSide = direction === 'undo' ? 'before' : 'after';
          let nextEntry = entry;
          let nextSnapshot = direction === 'undo' ? entry.before : entry.after;
          let nextRevision = editorRevision;

          if (entry.remoteTransitions.length > 0) {
            const remappedTransitions: RemoteTransition[] = [];
            let combinedDirtyBounds: WorldBounds | null = null;

            for (const transition of entry.remoteTransitions) {
              const result = await executeRemoteTransition(
                transition,
                targetSide,
                nextRevision
              );

              nextRevision = result.revision;
              remappedTransitions.push(result.transition);
              nextSnapshot = remapSnapshotForTransition(
                nextSnapshot,
                result.transition,
                targetSide
              );
              combinedDirtyBounds = mergeWorldBounds(
                combinedDirtyBounds,
                result.dirtyBounds
              );

              if (result.transition.kind === 'polygon') {
                const focusBounds = boundsFromPolygons(
                  targetSide === 'before'
                    ? result.transition.before
                    : result.transition.after
                );
                if (focusBounds) {
                  fitToWorldBounds(focusBounds);
                }
              }
            }

            nextEntry = {
              ...entry,
              remoteTransitions: remappedTransitions
            };

            if (combinedDirtyBounds) {
              await invalidateTerrainMutation(combinedDirtyBounds);
            }
          }

          setEditorRevision(nextRevision);
          setHistoryState({
            future:
              direction === 'undo'
                ? [...future, nextEntry]
                : future.slice(0, -1),
            past:
              direction === 'undo'
                ? past.slice(0, -1)
                : [...past, nextEntry],
            snapshot: nextSnapshot
          });
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict();
            return;
          }

          toast.error(
            toMessage(
              error,
              direction === 'undo' ? 'Undo failed' : 'Redo failed'
            )
          );
        }
      });
    },
    [
      editorRevision,
      executeRemoteTransition,
      fitToWorldBounds,
      getHistoryState,
      handleConflict,
      invalidateTerrainMutation,
      runAction,
      setHistoryState,
      setEditorRevision
    ]
  );

  const savePolygonDraft = useCallback(async () => {
    if (
      !polygonDraft ||
      !map ||
      editorRevision === null ||
      !canSavePolygonDraft(polygonDraft.vertices, polygonDraft.params)
    ) {
      return;
    }

    await runAction(
      polygonDraft.kind === 'create' ? 'create-polygon' : 'save-polygon',
      async () => {
        try {
          let nextRevision = editorRevision;
          const remoteTransitions: RemoteTransition[] = [];
          const polygonResult =
            polygonDraft.kind === 'create'
              ? await client.maps.createSourcePolygon({
                  expectedRevision: nextRevision,
                  mapId: id,
                  params: polygonDraft.params,
                  vertices: polygonDraft.vertices
                })
              : await client.maps.updateSourcePolygon({
                  expectedRevision: nextRevision,
                  id: polygonDraft.id ?? '',
                  mapId: id,
                  params: polygonDraft.params,
                  vertices: polygonDraft.vertices
                });

          nextRevision = polygonResult.mapRevision;
          let dirtyBounds: Pick<
            WorldBounds,
            'maxX' | 'maxZ' | 'minX' | 'minZ'
          > | null = polygonResult.dirtyBounds;

          const polygonTransition =
            polygonDraft.kind === 'create'
              ? toPolygonTransition('create', [], [polygonResult.polygon])
              : selectedPolygon
                ? toPolygonTransition('save', [selectedPolygon], [polygonResult.polygon])
                : null;

          if (polygonTransition) {
            remoteTransitions.push(polygonTransition);
          }

          for (const controlPointDraft of polygonControlPointDrafts) {
            if (!controlPointDraft.id) {
              continue;
            }

            const beforeControlPoint =
              controlPoints.find(
                point => point.id === controlPointDraft.id
              ) ?? null;

            const result = await client.maps.updateControlPoint({
              ...toControlPointCreateInput(controlPointDraft, nextRevision, id),
              id: controlPointDraft.id
            });

            nextRevision = result.mapRevision;
            dirtyBounds = mergeWorldBounds(dirtyBounds, result.dirtyBounds);

            if (beforeControlPoint) {
              remoteTransitions.push(
                toControlPointTransition(
                  'save',
                  [beforeControlPoint as ControlPoint],
                  [result.controlPoint]
                )
              );
            }
          }

          setEditorRevision(nextRevision);
          if (dirtyBounds) {
            await invalidateTerrainMutation(dirtyBounds);
          }

          const nextSnapshot: EditorSnapshot = {
            ...historySnapshot,
            polygonDraft: null,
            polygonControlPointDrafts: [],
            selectedControlPointId: null,
            selectedIslandId: null,
            selectedPolygonIds: [polygonResult.polygon.id],
            tool: 'select'
          };

          if (remoteTransitions.length > 0) {
            commitHistoryEntry({
              after: nextSnapshot,
              before: historySnapshot,
              remoteTransitions
            });
          } else {
            setSnapshot(nextSnapshot);
          }

          toast.success(
            polygonDraft.kind === 'create' ? 'Polygon created' : 'Polygon saved'
          );
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict();
            return;
          }

          toast.error(toMessage(error, 'Failed to save polygon'));
        }
      }
    );
  }, [
    commitHistoryEntry,
    controlPoints,
    editorRevision,
    handleConflict,
    historySnapshot,
    id,
    invalidateTerrainMutation,
    map,
    polygonDraft,
    polygonControlPointDrafts,
    runAction,
    selectedPolygon,
    setEditorRevision,
    setSnapshot
  ]);

  const saveControlPointDraft = useCallback(async () => {
    if (!controlPointDraft || editorRevision === null) {
      return;
    }

    await runAction(
      controlPointDraft.kind === 'create'
        ? 'create-control-point'
        : 'save-control-point',
      async () => {
        try {
          const payload = toControlPointCreateInput(
            controlPointDraft,
            editorRevision,
            id
          );
          const result =
            controlPointDraft.kind === 'create'
              ? await client.maps.createControlPoint(payload)
              : await client.maps.updateControlPoint({
                  ...payload,
                  id: controlPointDraft.id ?? ''
                });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);

          const nextSnapshot: EditorSnapshot = {
            ...historySnapshot,
            controlPointDraft: null,
            polygonControlPointDrafts: [],
            selectedControlPointId: result.controlPoint.id,
            selectedIslandId: null,
            selectedPolygonIds: [],
            tool: 'select'
          };

          const remoteTransition =
            controlPointDraft.kind === 'create'
              ? toControlPointTransition('create', [], [result.controlPoint])
              : selectedControlPoint
                ? toControlPointTransition(
                    'save',
                    [selectedControlPoint],
                    [result.controlPoint]
                  )
                : null;

          if (remoteTransition) {
            commitHistoryEntry({
              after: nextSnapshot,
              before: historySnapshot,
              remoteTransitions: [remoteTransition]
            });
          } else {
            setSnapshot(nextSnapshot);
          }

          toast.success(
            controlPointDraft.kind === 'create'
              ? 'Control point created'
              : 'Control point saved'
          );
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict();
            return;
          }

          toast.error(toMessage(error, 'Failed to save control point'));
        }
      }
    );
  }, [
    commitHistoryEntry,
    controlPointDraft,
    editorRevision,
    handleConflict,
    historySnapshot,
    id,
    invalidateTerrainMutation,
    runAction,
    selectedControlPoint,
    setEditorRevision,
    setSnapshot
  ]);

  const saveIslandDraft = useCallback(async () => {
    if (!islandDraft || editorRevision === null) {
      return;
    }

    await runAction('save-island', async () => {
      try {
        const result = await client.maps.updateDerivedIsland({
          defaultFaction: islandDraft.defaultFaction.trim() || null,
          defaultOwner: islandDraft.defaultOwner.trim() || null,
          expectedRevision: editorRevision,
          id: islandDraft.id,
          mapId: id,
          name: islandDraft.name.trim() || null
        });

        setEditorRevision(result.mapRevision);
        await invalidateIslandMetadataQueries();
        setIslandDraft(createIslandDraft(result.island));
        toast.success('Island metadata saved');
      } catch (error) {
        if (getErrorCode(error) === 'CONFLICT') {
          await handleConflict();
          return;
        }

        toast.error(toMessage(error, 'Failed to save island metadata'));
      }
    });
  }, [
    editorRevision,
    handleConflict,
    id,
    invalidateIslandMetadataQueries,
    islandDraft,
    runAction,
    setEditorRevision,
    setIslandDraft
  ]);

  const applyBooleanOperation = useCallback(
    async (operation: BooleanOperation) => {
      if (
        editorRevision === null ||
        selectedPolygonIds.length === 0 ||
        !map
      ) {
        return;
      }

      await runAction(`boolean-${operation}`, async () => {
        try {
          const operands = selectedPolygonIds
            .map(polygonId => polygons.find(polygon => polygon.id === polygonId))
            .filter((polygon): polygon is SourcePolygon => polygon !== undefined);

          if (operands.length !== selectedPolygonIds.length) {
            return;
          }

          const result = await client.maps.applyBoolean({
            expectedRevision: editorRevision,
            mapId: id,
            operation,
            polygonIds: selectedPolygonIds
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);

          const nextSnapshot: EditorSnapshot = {
            ...historySnapshot,
            polygonDraft: null,
            polygonControlPointDrafts: [],
            selectedControlPointId: null,
            selectedIslandId: null,
            selectedPolygonIds: result.createdPolygons.map(polygon => polygon.id),
            tool: 'select'
          };

          commitHistoryEntry({
            after: nextSnapshot,
            before: historySnapshot,
            remoteTransitions: [
              toPolygonTransition(
                'boolean',
                operands,
                result.createdPolygons,
                'after',
                operation
              )
            ]
          });

          const resultBounds = boundsFromPolygons(result.createdPolygons);
          if (resultBounds) {
            fitToWorldBounds(resultBounds);
          }

          toast.success(`Boolean ${operation} applied`);
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict();
            return;
          }

          toast.error(toMessage(error, `Failed to apply ${operation}`));
        }
      });
    },
    [
      commitHistoryEntry,
      editorRevision,
      fitToWorldBounds,
      handleConflict,
      historySnapshot,
      id,
      invalidateTerrainMutation,
      map,
      polygons,
      runAction,
      selectedPolygonIds,
      setEditorRevision
    ]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || editorRevision === null) {
      return;
    }

    await runAction(`delete-${deleteTarget.kind}`, async () => {
      try {
        if (deleteTarget.kind === 'polygon') {
          const target = selectedPolygon;
          if (!target) {
            return;
          }

          const result = await client.maps.deleteSourcePolygon({
            expectedRevision: editorRevision,
            id: deleteTarget.id,
            mapId: id
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);

          commitHistoryEntry({
            after: {
              ...historySnapshot,
              polygonDraft: null,
              polygonControlPointDrafts: [],
              selectedPolygonIds: [],
              tool: 'select'
            },
            before: historySnapshot,
            remoteTransitions: [toPolygonTransition('delete', [target], [])]
          });
          toast.success('Polygon deleted');
        } else {
          const target = selectedControlPoint;
          if (!target) {
            return;
          }

          const result = await client.maps.deleteControlPoint({
            expectedRevision: editorRevision,
            id: deleteTarget.id,
            mapId: id
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);

          commitHistoryEntry({
            after: {
              ...historySnapshot,
              controlPointDraft: null,
              polygonControlPointDrafts: [],
              selectedControlPointId: null,
              tool: 'select'
            },
            before: historySnapshot,
            remoteTransitions: [toControlPointTransition('delete', [target], [])]
          });
          toast.success('Control point deleted');
        }

        setDeleteTarget(null);
      } catch (error) {
        if (getErrorCode(error) === 'CONFLICT') {
          await handleConflict();
          return;
        }

        toast.error(toMessage(error, 'Delete failed'));
      }
    });
  }, [
    commitHistoryEntry,
    deleteTarget,
    editorRevision,
    handleConflict,
    historySnapshot,
    id,
    invalidateTerrainMutation,
    runAction,
    selectedControlPoint,
    selectedPolygon,
    setDeleteTarget,
    setEditorRevision
  ]);

  return {
    applyBooleanOperation,
    confirmDelete,
    pendingAction,
    redo: () => moveHistoryPointer('redo'),
    saveControlPointDraft,
    saveIslandDraft,
    savePolygonDraft,
    undo: () => moveHistoryPointer('undo')
  };
};
