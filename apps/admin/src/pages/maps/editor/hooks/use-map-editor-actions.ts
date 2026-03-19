import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { toast } from 'sonner';

import type {
  BooleanOperation,
  MapMetadata,
  WorldBounds,
} from 'carrier-contracts/types';

import { client } from '@/lib/api-client';
import { canSavePolygonDraft, type EditorTool } from '../helpers';
import { boundsFromPolygons, createIslandDraft } from '../helpers/drafts';
import { getErrorCode, toMessage } from '../helpers/errors';
import type {
  ControlPointDraft,
  DeleteTarget,
  IslandDraft,
  PolygonDraft,
} from '../helpers/types';

type UseMapEditorActionsOptions = {
  controlPointDraft: ControlPointDraft | null;
  deleteTarget: DeleteTarget;
  editorRevision: number | null;
  fitToWorldBounds: (
    bounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>,
  ) => void;
  id: string;
  invalidateIslandMetadataQueries: () => Promise<unknown>;
  invalidateTerrainMutation: (
    dirtyBounds: Pick<WorldBounds, 'maxX' | 'maxZ' | 'minX' | 'minZ'>,
  ) => Promise<unknown>;
  islandDraft: IslandDraft | null;
  map: MapMetadata | null | undefined;
  polygonDraft: PolygonDraft | null;
  reloadAll: () => Promise<MapMetadata | null>;
  selectedPolygonIds: string[];
  setControlPointDraft: Dispatch<SetStateAction<ControlPointDraft | null>>;
  setDeleteTarget: Dispatch<SetStateAction<DeleteTarget>>;
  setEditorRevision: Dispatch<SetStateAction<number | null>>;
  setIslandDraft: Dispatch<SetStateAction<IslandDraft | null>>;
  setPolygonDraft: Dispatch<SetStateAction<PolygonDraft | null>>;
  setSelectedControlPointId: Dispatch<SetStateAction<string | null>>;
  setSelectedIslandId: Dispatch<SetStateAction<string | null>>;
  setSelectedPolygonIds: Dispatch<SetStateAction<string[]>>;
  setTool: Dispatch<SetStateAction<EditorTool>>;
};

export const useMapEditorActions = ({
  controlPointDraft,
  deleteTarget,
  editorRevision,
  fitToWorldBounds,
  id,
  invalidateIslandMetadataQueries,
  invalidateTerrainMutation,
  islandDraft,
  map,
  polygonDraft,
  reloadAll,
  selectedPolygonIds,
  setControlPointDraft,
  setDeleteTarget,
  setEditorRevision,
  setIslandDraft,
  setPolygonDraft,
  setSelectedControlPointId,
  setSelectedIslandId,
  setSelectedPolygonIds,
  setTool,
}: UseMapEditorActionsOptions) => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const syncRevisionFromServer = useCallback(async () => {
    const freshMap = await reloadAll();
    setEditorRevision(freshMap?.revision ?? null);
  }, [reloadAll, setEditorRevision]);

  const handleConflict = useCallback(
    async (reset: () => void) => {
      reset();
      await syncRevisionFromServer();
      toast.error('The editor was out of date. Reloaded latest map data.');
    },
    [syncRevisionFromServer],
  );

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
    [pendingAction],
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
          const result =
            polygonDraft.kind === 'create'
              ? await client.maps.createSourcePolygon({
                  expectedRevision: editorRevision,
                  mapId: id,
                  params: polygonDraft.params,
                  vertices: polygonDraft.vertices,
                })
              : await client.maps.updateSourcePolygon({
                  expectedRevision: editorRevision,
                  id: polygonDraft.id ?? '',
                  mapId: id,
                  params: polygonDraft.params,
                  vertices: polygonDraft.vertices,
                });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setPolygonDraft(null);
          setTool('select');
          setSelectedPolygonIds([result.polygon.id]);
          setSelectedControlPointId(null);
          setSelectedIslandId(null);
          toast.success(
            polygonDraft.kind === 'create'
              ? 'Polygon created'
              : 'Polygon saved',
          );
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict(() => {
              setPolygonDraft(null);
            });
            return;
          }

          toast.error(toMessage(error, 'Failed to save polygon'));
        }
      },
    );
  }, [
    editorRevision,
    handleConflict,
    id,
    invalidateTerrainMutation,
    map,
    polygonDraft,
    runAction,
    setEditorRevision,
    setPolygonDraft,
    setSelectedControlPointId,
    setSelectedIslandId,
    setSelectedPolygonIds,
    setTool,
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
          const payload = {
            elevationMeters: controlPointDraft.elevationMeters,
            expectedRevision: editorRevision,
            influenceMeters: controlPointDraft.influenceMeters,
            mapId: id,
            strength: controlPointDraft.strength,
            type: controlPointDraft.type,
            x: controlPointDraft.x,
            z: controlPointDraft.z,
          };
          const result =
            controlPointDraft.kind === 'create'
              ? await client.maps.createControlPoint(payload)
              : await client.maps.updateControlPoint({
                  ...payload,
                  id: controlPointDraft.id ?? '',
                });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setControlPointDraft(null);
          setTool('select');
          setSelectedControlPointId(result.controlPoint.id);
          setSelectedPolygonIds([]);
          setSelectedIslandId(null);
          toast.success(
            controlPointDraft.kind === 'create'
              ? 'Control point created'
              : 'Control point saved',
          );
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict(() => {
              setControlPointDraft(null);
            });
            return;
          }

          toast.error(toMessage(error, 'Failed to save control point'));
        }
      },
    );
  }, [
    controlPointDraft,
    editorRevision,
    handleConflict,
    id,
    invalidateTerrainMutation,
    runAction,
    setControlPointDraft,
    setEditorRevision,
    setSelectedControlPointId,
    setSelectedIslandId,
    setSelectedPolygonIds,
    setTool,
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
          name: islandDraft.name.trim() || null,
        });

        setEditorRevision(result.mapRevision);
        await invalidateIslandMetadataQueries();
        setIslandDraft(createIslandDraft(result.island));
        toast.success('Island metadata saved');
      } catch (error) {
        if (getErrorCode(error) === 'CONFLICT') {
          await handleConflict(() => {
            setIslandDraft(null);
          });
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
    setIslandDraft,
  ]);

  const applyBooleanOperation = useCallback(
    async (operation: BooleanOperation) => {
      if (editorRevision === null || selectedPolygonIds.length === 0 || !map) {
        return;
      }

      await runAction(`boolean-${operation}`, async () => {
        try {
          const result = await client.maps.applyBoolean({
            expectedRevision: editorRevision,
            mapId: id,
            operation,
            polygonIds: selectedPolygonIds,
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setSelectedPolygonIds(
            result.createdPolygons.map((polygon) => polygon.id),
          );
          setSelectedControlPointId(null);
          setSelectedIslandId(null);
          setPolygonDraft(null);
          setTool('select');

          const resultBounds = boundsFromPolygons(result.createdPolygons);
          if (resultBounds) {
            fitToWorldBounds(resultBounds);
          }

          toast.success(`Boolean ${operation} applied`);
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            await handleConflict(() => {
              setSelectedPolygonIds([]);
            });
            return;
          }

          toast.error(toMessage(error, `Failed to apply ${operation}`));
        }
      });
    },
    [
      editorRevision,
      fitToWorldBounds,
      handleConflict,
      id,
      invalidateTerrainMutation,
      map,
      runAction,
      selectedPolygonIds,
      setEditorRevision,
      setPolygonDraft,
      setSelectedControlPointId,
      setSelectedIslandId,
      setSelectedPolygonIds,
      setTool,
    ],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || editorRevision === null) {
      return;
    }

    await runAction(`delete-${deleteTarget.kind}`, async () => {
      try {
        if (deleteTarget.kind === 'polygon') {
          const result = await client.maps.deleteSourcePolygon({
            expectedRevision: editorRevision,
            id: deleteTarget.id,
            mapId: id,
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setSelectedPolygonIds([]);
          setPolygonDraft(null);
          setTool('select');
          toast.success('Polygon deleted');
        } else {
          const result = await client.maps.deleteControlPoint({
            expectedRevision: editorRevision,
            id: deleteTarget.id,
            mapId: id,
          });

          setEditorRevision(result.mapRevision);
          await invalidateTerrainMutation(result.dirtyBounds);
          setSelectedControlPointId(null);
          setControlPointDraft(null);
          setTool('select');
          toast.success('Control point deleted');
        }

        setDeleteTarget(null);
      } catch (error) {
        if (getErrorCode(error) === 'CONFLICT') {
          await handleConflict(() => {
            if (deleteTarget.kind === 'polygon') {
              setSelectedPolygonIds([]);
            } else {
              setSelectedControlPointId(null);
            }
            setDeleteTarget(null);
          });
          return;
        }

        toast.error(toMessage(error, 'Delete failed'));
      }
    });
  }, [
    deleteTarget,
    editorRevision,
    handleConflict,
    id,
    invalidateTerrainMutation,
    runAction,
    setControlPointDraft,
    setDeleteTarget,
    setEditorRevision,
    setPolygonDraft,
    setSelectedControlPointId,
    setSelectedPolygonIds,
    setTool,
  ]);

  return {
    applyBooleanOperation,
    confirmDelete,
    pendingAction,
    saveControlPointDraft,
    saveIslandDraft,
    savePolygonDraft,
  };
};
