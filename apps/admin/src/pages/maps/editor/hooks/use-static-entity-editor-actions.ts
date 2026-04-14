import type {
  MapMetadata,
  StaticEntity,
  StaticEntityListItem,
  WorldPoint
} from 'carrier-contracts/types';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { client } from '@/lib/api-client';

import { buildDuplicateStaticEntityLabel } from '../helpers';
import { toMessage, getErrorCode } from '../helpers/errors';
import { createStaticEntityDraft } from '../helpers/drafts';
import type { StaticEntityDraft } from '../helpers/types';

type BulkUpdateInput = {
  scale?: number;
  state?: StaticEntity['state'];
};

type UseStaticEntityEditorActionsOptions = {
  activeArchetypeId: string | null;
  editorRevision: number | null;
  entityDraft: StaticEntityDraft | null;
  map: MapMetadata | null | undefined;
  mapId: string;
  onSelectEntities: (entityIds: string[], record?: boolean) => void;
  onSetEntityDraft: (
    value:
      | StaticEntityDraft
      | null
      | ((current: StaticEntityDraft | null) => StaticEntityDraft | null),
    record?: boolean
  ) => void;
  reloadAll: () => Promise<MapMetadata | null>;
  selectedEntityIds: string[];
  staticEntityItems: StaticEntityListItem[];
  setEditorRevision: (
    value: number | null | ((current: number | null) => number | null)
  ) => void;
};

type MutationOutcome<T> = {
  conflicted: boolean;
  failures: string[];
  revision: number;
  successes: T[];
};

export const useStaticEntityEditorActions = ({
  activeArchetypeId,
  editorRevision,
  entityDraft,
  map,
  mapId,
  onSelectEntities,
  onSetEntityDraft,
  reloadAll,
  selectedEntityIds,
  setEditorRevision,
  staticEntityItems
}: UseStaticEntityEditorActionsOptions) => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const staticEntityItemsById = useMemo(
    () => new Map(staticEntityItems.map(item => [item.entity.id, item])),
    [staticEntityItems]
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
    [pendingAction]
  );

  const refreshAfterMutation = useCallback(
    async (revision: number) => {
      setEditorRevision(revision);
      const nextMap = await reloadAll();
      return nextMap?.revision ?? revision;
    },
    [reloadAll, setEditorRevision]
  );

  const applySequentialMutations = useCallback(
    async <T,>(
      items: T[],
      mutate: (
        item: T,
        revision: number
      ) => Promise<{ entity: StaticEntity; mapRevision: number }>
    ): Promise<MutationOutcome<StaticEntity>> => {
      let revision = editorRevision ?? 0;
      const successes: StaticEntity[] = [];
      const failures: string[] = [];

      for (const item of items) {
        try {
          const result = await mutate(item, revision);
          revision = result.mapRevision;
          successes.push(result.entity);
        } catch (error) {
          if (getErrorCode(error) === 'CONFLICT') {
            return {
              conflicted: true,
              failures,
              revision,
              successes
            };
          }

          failures.push(toMessage(error, 'Mutation failed'));
        }
      }

      return {
        conflicted: false,
        failures,
        revision,
        successes
      };
    },
    [editorRevision]
  );

  const placeEntity = useCallback(
    async (position: WorldPoint) => {
      if (!activeArchetypeId || editorRevision === null) {
        return;
      }

      await runAction('place-static-entity', async () => {
        try {
          const result = await client.maps.createStaticEntity({
            archetypeId: activeArchetypeId,
            expectedRevision: editorRevision,
            label: null,
            mapId,
            position,
            rotation: { yaw: 0 },
            scale: 1,
            state: 'active',
            yOffset: 0
          });

          const nextRevision = await refreshAfterMutation(result.mapRevision);
          setEditorRevision(nextRevision);
          onSelectEntities([result.entity.id]);
          onSetEntityDraft(createStaticEntityDraft(result.entity));
          toast.success('Entity placed');
        } catch (error) {
          toast.error(toMessage(error, 'Failed to place entity'));
        }
      });
    },
    [
      activeArchetypeId,
      editorRevision,
      mapId,
      onSelectEntities,
      onSetEntityDraft,
      refreshAfterMutation,
      runAction,
      setEditorRevision
    ]
  );

  const saveDraggedEntities = useCallback(
    async (entities: StaticEntity[]) => {
      if (editorRevision === null || entities.length === 0) {
        return;
      }

      await runAction('move-static-entities', async () => {
        const outcome = await applySequentialMutations(
          entities,
          (entity, revision) =>
            client.maps.updateStaticEntity({
              expectedRevision: revision,
              id: entity.id,
              mapId,
              position: entity.position
            })
        );

        if (outcome.successes.length > 0) {
          const nextRevision = await refreshAfterMutation(outcome.revision);
          setEditorRevision(nextRevision);
          onSelectEntities(outcome.successes.map(entity => entity.id));
          if (outcome.successes.length === 1) {
            onSetEntityDraft(createStaticEntityDraft(outcome.successes[0]!));
          } else {
            onSetEntityDraft(null);
          }
        }

        if (outcome.conflicted) {
          toast.error('Entity move stopped because the editor was out of date.');
          return;
        }

        if (outcome.failures.length > 0 && outcome.successes.length > 0) {
          toast.error(
            `Moved ${outcome.successes.length} entities with ${outcome.failures.length} failures`
          );
          return;
        }

        if (outcome.failures.length > 0) {
          toast.error(outcome.failures[0] ?? 'Failed to move entities');
          return;
        }

        toast.success(
          outcome.successes.length === 1
            ? 'Entity moved'
            : `${outcome.successes.length} entities moved`
        );
      });
    },
    [
      applySequentialMutations,
      editorRevision,
      mapId,
      onSelectEntities,
      onSetEntityDraft,
      refreshAfterMutation,
      runAction,
      setEditorRevision
    ]
  );

  const saveRotatedEntity = useCallback(
    async (
      entityId: string,
      transform: { scale?: number; yaw: number }
    ) => {
      if (editorRevision === null) {
        return;
      }

      const scaleChanged = transform.scale !== undefined;
      await runAction('rotate-static-entity', async () => {
        try {
          const result = await client.maps.updateStaticEntity({
            expectedRevision: editorRevision,
            id: entityId,
            mapId,
            rotation: { yaw: transform.yaw },
            ...(scaleChanged ? { scale: transform.scale } : {})
          });

          const nextRevision = await refreshAfterMutation(result.mapRevision);
          setEditorRevision(nextRevision);
          onSelectEntities([result.entity.id]);
          onSetEntityDraft(createStaticEntityDraft(result.entity));
          toast.success(
            scaleChanged ? 'Entity transform saved' : 'Entity rotation saved'
          );
        } catch (error) {
          toast.error(toMessage(error, 'Failed to rotate entity'));
        }
      });
    },
    [
      editorRevision,
      mapId,
      onSelectEntities,
      onSetEntityDraft,
      refreshAfterMutation,
      runAction,
      setEditorRevision
    ]
  );

  const applyEntityDraft = useCallback(async () => {
    if (!entityDraft || editorRevision === null) {
      return;
    }

    await runAction('save-static-entity', async () => {
      try {
        const result = await client.maps.updateStaticEntity({
          archetypeId: entityDraft.archetypeId,
          expectedRevision: editorRevision,
          id: entityDraft.id,
          label: entityDraft.label.trim() ? entityDraft.label.trim() : null,
          mapId,
          position: {
            x: entityDraft.x,
            z: entityDraft.z
          },
          rotation: { yaw: entityDraft.yaw },
          scale: entityDraft.scale,
          state: entityDraft.state,
          yOffset: entityDraft.yOffset
        });

        const nextRevision = await refreshAfterMutation(result.mapRevision);
        setEditorRevision(nextRevision);
        onSelectEntities([result.entity.id]);
        onSetEntityDraft(createStaticEntityDraft(result.entity));
        toast.success('Entity saved');
      } catch (error) {
        toast.error(toMessage(error, 'Failed to save entity'));
      }
    });
  }, [
    editorRevision,
    entityDraft,
    mapId,
    onSelectEntities,
    onSetEntityDraft,
    refreshAfterMutation,
    runAction,
    setEditorRevision
  ]);

  const applyBulkEntityEdit = useCallback(
    async ({ scale, state }: BulkUpdateInput) => {
      if (editorRevision === null || selectedEntityIds.length === 0) {
        return;
      }

      const targets = selectedEntityIds
        .map(id => staticEntityItemsById.get(id)?.entity ?? null)
        .filter((entity): entity is StaticEntity => entity !== null);

      if (targets.length === 0) {
        return;
      }

      await runAction('bulk-update-static-entities', async () => {
        const outcome = await applySequentialMutations(
          targets,
          (entity, revision) =>
            client.maps.updateStaticEntity({
              expectedRevision: revision,
              id: entity.id,
              mapId,
              scale,
              state
            })
        );

        if (outcome.successes.length > 0) {
          const nextRevision = await refreshAfterMutation(outcome.revision);
          setEditorRevision(nextRevision);
          onSelectEntities(outcome.successes.map(entity => entity.id));
          onSetEntityDraft(null);
        }

        if (outcome.conflicted) {
          toast.error(
            'Bulk entity update stopped because the editor was out of date.'
          );
          return;
        }

        if (outcome.failures.length > 0 && outcome.successes.length > 0) {
          toast.error(
            `Updated ${outcome.successes.length} entities with ${outcome.failures.length} failures`
          );
          return;
        }

        if (outcome.failures.length > 0) {
          toast.error(outcome.failures[0] ?? 'Failed to update entities');
          return;
        }

        toast.success(
          outcome.successes.length === 1
            ? 'Entity updated'
            : `${outcome.successes.length} entities updated`
        );
      });
    },
    [
      applySequentialMutations,
      editorRevision,
      mapId,
      onSelectEntities,
      onSetEntityDraft,
      refreshAfterMutation,
      runAction,
      selectedEntityIds,
      setEditorRevision,
      staticEntityItemsById
    ]
  );

  const duplicateSelectedEntities = useCallback(async () => {
    if (editorRevision === null || !map || selectedEntityIds.length === 0) {
      return;
    }

    const existingItems = selectedEntityIds
      .map(id => staticEntityItemsById.get(id)?.entity ?? null)
      .filter((entity): entity is StaticEntity => entity !== null);

    if (existingItems.length === 0) {
      return;
    }

    const offset = map.resolution.metersPerTile;
    const duplicateLabels = new Set(
      staticEntityItems
        .map(item => item.entity.label?.trim())
        .filter((label): label is string => Boolean(label))
    );

    await runAction('duplicate-static-entities', async () => {
      const outcome = await applySequentialMutations(
        existingItems,
        (entity, revision) => {
          const label = buildDuplicateStaticEntityLabel(
            entity.label,
            duplicateLabels
          );
          if (label) {
            duplicateLabels.add(label);
          }

          return client.maps.createStaticEntity({
            archetypeId: entity.archetypeId,
            expectedRevision: revision,
            label,
            mapId,
            position: {
              x: entity.position.x + offset,
              z: entity.position.z + offset
            },
            rotation: entity.rotation,
            scale: entity.scale,
            state: entity.state,
            yOffset: entity.yOffset
          });
        }
      );

      if (outcome.successes.length > 0) {
        const nextRevision = await refreshAfterMutation(outcome.revision);
        setEditorRevision(nextRevision);
        onSelectEntities(outcome.successes.map(entity => entity.id));
        onSetEntityDraft(
          outcome.successes.length === 1
            ? createStaticEntityDraft(outcome.successes[0]!)
            : null
        );
      }

      if (outcome.conflicted) {
        toast.error(
          'Entity duplication stopped because the editor was out of date.'
        );
        return;
      }

      if (outcome.failures.length > 0 && outcome.successes.length > 0) {
        toast.error(
          `Duplicated ${outcome.successes.length} entities with ${outcome.failures.length} failures`
        );
        return;
      }

      if (outcome.failures.length > 0) {
        toast.error(outcome.failures[0] ?? 'Failed to duplicate entities');
        return;
      }

      toast.success(
        outcome.successes.length === 1
          ? 'Entity duplicated'
          : `${outcome.successes.length} entities duplicated`
      );
    });
  }, [
    applySequentialMutations,
    editorRevision,
    map,
    mapId,
    onSelectEntities,
    onSetEntityDraft,
    refreshAfterMutation,
    runAction,
    selectedEntityIds,
    setEditorRevision,
    staticEntityItems,
    staticEntityItemsById
  ]);

  const deleteStaticEntities = useCallback(
    async (entityIds: string[]) => {
      if (editorRevision === null || entityIds.length === 0) {
        return;
      }

      await runAction('delete-static-entities', async () => {
        let revision = editorRevision;
        let deletedCount = 0;
        let ordinaryFailureCount = 0;

        for (const entityId of entityIds) {
          try {
            const result = await client.maps.deleteStaticEntity({
              expectedRevision: revision,
              id: entityId,
              mapId
            });
            revision = result.mapRevision;
            deletedCount += 1;
          } catch (error) {
            if (getErrorCode(error) === 'CONFLICT') {
              if (deletedCount > 0) {
                const nextRevision = await refreshAfterMutation(revision);
                setEditorRevision(nextRevision);
              }
              toast.error(
                'Entity deletion stopped because the editor was out of date.'
              );
              return;
            }

            ordinaryFailureCount += 1;
          }
        }

        if (deletedCount > 0) {
          const nextRevision = await refreshAfterMutation(revision);
          setEditorRevision(nextRevision);
          onSelectEntities([]);
          onSetEntityDraft(null);
        }

        if (ordinaryFailureCount > 0 && deletedCount > 0) {
          toast.error(
            `Deleted ${deletedCount} entities with ${ordinaryFailureCount} failures`
          );
          return;
        }

        if (ordinaryFailureCount > 0) {
          toast.error('Failed to delete entities');
          return;
        }

        toast.success(
          deletedCount === 1
            ? 'Entity deleted'
            : `${deletedCount} entities deleted`
        );
      });
    },
    [
      editorRevision,
      mapId,
      onSelectEntities,
      onSetEntityDraft,
      refreshAfterMutation,
      runAction,
      setEditorRevision
    ]
  );

  return {
    applyBulkEntityEdit,
    applyEntityDraft,
    deleteStaticEntities,
    duplicateSelectedEntities,
    pendingAction,
    placeEntity,
    saveDraggedEntities,
    saveRotatedEntity
  };
};
