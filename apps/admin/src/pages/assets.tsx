import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';

import { AssetPreviewPanel } from '@/components/assets/asset-preview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiUrl, client } from '@/lib/api-client';
import { formatTimestamp, parseTags } from '@/lib/format';
import { toMessage } from '@/pages/maps/editor/helpers/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Archetype,
  ArchetypeCategory,
  ArchetypeStatus,
  AssetVersion,
  AssetVersionStatus,
  MapMetadata,
  ZarchRuntimeEntity
} from 'carrier-contracts/types';

const assetStatusOptions: Array<AssetVersionStatus | 'all'> = [
  'all',
  'review',
  'ready',
  'processing',
  'uploaded',
  'failed'
];

const archetypeCategories: ArchetypeCategory[] = [
  'building',
  'landmark',
  'industrial',
  'natural-prop'
];

const archetypeStatuses: ArchetypeStatus[] = ['active', 'deprecated', 'archived'];
const DEFAULT_ZARCH_RUNTIME_ENTITY_ID = 'zarch-player-ship';
const DEFAULT_ZARCH_RUNTIME_ENTITY_NAME = 'Zarch Player Ship';
const DEFAULT_ZARCH_RUNTIME_ENTITY_LENGTH_METERS = 18;

const titleCaseSlug = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

const defaultArchetypeId = (assetId: string) =>
  assetId.replace(/-v\d+$/, '') || assetId;

type ArchetypeDraft = {
  category: ArchetypeCategory;
  id: string;
  name: string;
  status: ArchetypeStatus;
  tags: string;
};

type ReviewDraft = {
  collisionClass: string;
  collisionDepthMeters: string;
  collisionHeightMeters: string;
  collisionWidthMeters: string;
  diagnostics: string;
  footprintDepthMeters: string;
  footprintWidthMeters: string;
  groundingPolicy: string;
  instancingEligible: boolean;
  maxHeightDeltaMeters: string;
};

type ZarchRuntimeEntityDraft = {
  id: string;
  lengthMeters: string;
  name: string;
};

const buildReviewDraft = (asset: AssetVersion): ReviewDraft => ({
  collisionClass: asset.collisionClass,
  collisionDepthMeters: String(asset.collisionBox.depthMeters),
  collisionHeightMeters: String(asset.collisionBox.heightMeters),
  collisionWidthMeters: String(asset.collisionBox.widthMeters),
  diagnostics: asset.diagnostics.join('\n'),
  footprintDepthMeters: String(asset.footprint.depthMeters),
  footprintWidthMeters: String(asset.footprint.widthMeters),
  groundingPolicy: asset.groundingPolicy,
  instancingEligible: asset.instancingEligible,
  maxHeightDeltaMeters: String(asset.maxHeightDeltaMeters)
});

const buildReviewPayload = (assetId: string, draft: ReviewDraft) => ({
  collisionBox: {
    depthMeters: Number(draft.collisionDepthMeters),
    heightMeters: Number(draft.collisionHeightMeters),
    widthMeters: Number(draft.collisionWidthMeters)
  },
  collisionClass: draft.collisionClass.trim(),
  diagnostics: draft.diagnostics
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean),
  footprint: {
    depthMeters: Number(draft.footprintDepthMeters),
    widthMeters: Number(draft.footprintWidthMeters)
  },
  groundingPolicy: draft.groundingPolicy.trim(),
  id: assetId,
  instancingEligible: draft.instancingEligible,
  maxHeightDeltaMeters: Number(draft.maxHeightDeltaMeters)
});

const buildArchetypeDraft = (asset: AssetVersion): ArchetypeDraft => {
  const archetypeId = defaultArchetypeId(asset.id);

  return {
    category: 'building',
    id: archetypeId,
    name: titleCaseSlug(archetypeId),
    status: 'active',
    tags: ''
  };
};

const buildRuntimeEntityDraft = (
  runtimeEntity?: ZarchRuntimeEntity | null
): ZarchRuntimeEntityDraft => ({
  id: runtimeEntity?.id ?? DEFAULT_ZARCH_RUNTIME_ENTITY_ID,
  lengthMeters: String(
    runtimeEntity?.renderDimensions.lengthMeters ??
      DEFAULT_ZARCH_RUNTIME_ENTITY_LENGTH_METERS
  ),
  name: runtimeEntity?.name ?? DEFAULT_ZARCH_RUNTIME_ENTITY_NAME
});

async function uploadAsset(file: File) {
  const formData = new FormData();
  formData.set('file', file);

  const response = await fetch(`${apiUrl}/maps/assets`, {
    body: formData,
    credentials: 'include',
    method: 'POST'
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(error?.message ?? 'Failed to upload asset');
  }

  return (await response.json()) as AssetVersion;
}

function AssetReviewCard({
  asset,
  availableMaps,
  runtimeEntities
}: {
  asset: AssetVersion;
  availableMaps: MapMetadata[];
  runtimeEntities: ZarchRuntimeEntity[];
}) {
  const queryClient = useQueryClient();
  const currentRuntimeEntity = useMemo(
    () => runtimeEntities.find(entity => entity.assetVersionId === asset.id) ?? null,
    [runtimeEntities, asset.id]
  );
  const [reviewDraft, setReviewDraft] = useState(() => buildReviewDraft(asset));
  const [archetypeDraft, setArchetypeDraft] = useState(() =>
    buildArchetypeDraft(asset)
  );
  const [runtimeEntityDraft, setRuntimeEntityDraft] = useState(() =>
    buildRuntimeEntityDraft(currentRuntimeEntity)
  );

  useEffect(() => {
    setReviewDraft(buildReviewDraft(asset));
    setArchetypeDraft(buildArchetypeDraft(asset));
    setRuntimeEntityDraft(buildRuntimeEntityDraft(currentRuntimeEntity));
  }, [asset.id, asset.updatedAt, currentRuntimeEntity]);

  const invalidateAssets = () =>
    queryClient.invalidateQueries({ queryKey: ['assets'] });
  const invalidateRuntimeEntities = () =>
    queryClient.invalidateQueries({ queryKey: ['zarch-runtime-entities'] });

  const reviewMutation = useMutation({
    mutationFn: async () =>
      client.maps.updateAssetVersionReview(
        buildReviewPayload(asset.id, reviewDraft)
      ),
    onError: error => {
      toast.error(toMessage(error, 'Failed to save review'));
    },
    onSuccess: async () => {
      await invalidateAssets();
      toast.success('Review metadata saved');
    }
  });

  const approveMutation = useMutation({
    mutationFn: async () => client.maps.approveAssetVersion({ id: asset.id }),
    onError: error => {
      toast.error(toMessage(error, 'Failed to approve asset'));
    },
    onSuccess: async () => {
      await invalidateAssets();
      toast.success('Asset approved');
    }
  });

  const archetypeMutation = useMutation({
    mutationFn: async () =>
      client.maps.createArchetype({
        assetVersionId: asset.id,
        category: archetypeDraft.category,
        id: archetypeDraft.id.trim(),
        name: archetypeDraft.name.trim(),
        status: archetypeDraft.status,
        tags: parseTags(archetypeDraft.tags)
      }),
    onError: error => {
      toast.error(toMessage(error, 'Failed to create archetype'));
    },
    onSuccess: async (created: Archetype) => {
      await invalidateAssets();
      toast.success(`Archetype ${created.id} created`);
    }
  });

  const approveAndCreateMutation = useMutation({
    mutationFn: async () => {
      await client.maps.updateAssetVersionReview(
        buildReviewPayload(asset.id, reviewDraft)
      );
      await client.maps.approveAssetVersion({ id: asset.id });
      return client.maps.createArchetype({
        assetVersionId: asset.id,
        category: archetypeDraft.category,
        id: archetypeDraft.id.trim(),
        name: archetypeDraft.name.trim(),
        status: archetypeDraft.status,
        tags: parseTags(archetypeDraft.tags)
      });
    },
    onError: error => {
      toast.error(toMessage(error, 'Failed to approve and create archetype'));
    },
    onSuccess: async created => {
      await invalidateAssets();
      toast.success(`Asset approved and archetype ${created.id} created`);
    }
  });

  const runtimeEntityMutation = useMutation({
    mutationFn: async () =>
      client.maps.upsertZarchRuntimeEntity({
        assetVersionId: asset.id,
        id: runtimeEntityDraft.id.trim(),
        kind: 'player-ship',
        name: runtimeEntityDraft.name.trim(),
        renderDimensions: {
          lengthMeters: Number(runtimeEntityDraft.lengthMeters)
        },
        status: 'active'
      }),
    onError: error => {
      toast.error(toMessage(error, 'Failed to bind runtime entity'));
    },
    onSuccess: async bound => {
      await invalidateRuntimeEntities();
      toast.success(`Runtime entity ${bound.id} now points to ${asset.id}`);
    }
  });

  const pending =
    reviewMutation.isPending ||
    approveMutation.isPending ||
    archetypeMutation.isPending ||
    approveAndCreateMutation.isPending ||
    runtimeEntityMutation.isPending;

  const runtimeHref =
    asset.runtimeFile === null ? null : `${apiUrl}/maps/assets/${asset.id}/runtime`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{asset.id}</CardTitle>
            <CardDescription>
              Uploaded {formatTimestamp(asset.createdAt)}. Updated{' '}
              {formatTimestamp(asset.updatedAt)}.
            </CardDescription>
          </div>
          <Badge variant={asset.status === 'ready' ? 'default' : 'secondary'}>
            {asset.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <AssetPreviewPanel
          asset={asset}
          availableMaps={availableMaps}
          footprintDepthMeters={Number(reviewDraft.footprintDepthMeters)}
          footprintWidthMeters={Number(reviewDraft.footprintWidthMeters)}
          maxHeightDeltaMeters={Number(reviewDraft.maxHeightDeltaMeters)}
          runtimeHref={runtimeHref}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border p-4">
            <div className="text-sm font-medium">Files</div>
            <div className="text-sm text-muted-foreground">
              Original: {asset.originalFile.path}
            </div>
            <div className="text-sm text-muted-foreground">
              Runtime:{' '}
              {asset.runtimeFile ? asset.runtimeFile.path : 'Not available yet'}
            </div>
            {runtimeHref ? (
              <a
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={runtimeHref}
                rel="noreferrer"
                target="_blank"
              >
                Open runtime artifact
              </a>
            ) : null}
          </div>
          <div className="space-y-2 rounded-md border p-4">
            <div className="text-sm font-medium">Review Scope</div>
            <p className="text-sm text-muted-foreground">
              Adjust derived footprint, collision, grounding, and instancing
              metadata before approval. Ready assets become immutable.
            </p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            reviewMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-footprint-width`}>Footprint width</Label>
              <Input
                id={`${asset.id}-footprint-width`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    footprintWidthMeters: event.target.value
                  }))
                }
                value={reviewDraft.footprintWidthMeters}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-footprint-depth`}>Footprint depth</Label>
              <Input
                id={`${asset.id}-footprint-depth`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    footprintDepthMeters: event.target.value
                  }))
                }
                value={reviewDraft.footprintDepthMeters}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-collision-width`}>Collision width</Label>
              <Input
                id={`${asset.id}-collision-width`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    collisionWidthMeters: event.target.value
                  }))
                }
                value={reviewDraft.collisionWidthMeters}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-collision-depth`}>Collision depth</Label>
              <Input
                id={`${asset.id}-collision-depth`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    collisionDepthMeters: event.target.value
                  }))
                }
                value={reviewDraft.collisionDepthMeters}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-collision-height`}>Collision height</Label>
              <Input
                id={`${asset.id}-collision-height`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    collisionHeightMeters: event.target.value
                  }))
                }
                value={reviewDraft.collisionHeightMeters}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-max-height-delta`}>
                Max height delta
              </Label>
              <Input
                id={`${asset.id}-max-height-delta`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    maxHeightDeltaMeters: event.target.value
                  }))
                }
                value={reviewDraft.maxHeightDeltaMeters}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-collision-class`}>Collision class</Label>
              <Input
                id={`${asset.id}-collision-class`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    collisionClass: event.target.value
                  }))
                }
                value={reviewDraft.collisionClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-grounding-policy`}>Grounding policy</Label>
              <Input
                id={`${asset.id}-grounding-policy`}
                onChange={event =>
                  setReviewDraft(current => ({
                    ...current,
                    groundingPolicy: event.target.value
                  }))
                }
                value={reviewDraft.groundingPolicy}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${asset.id}-diagnostics`}>Diagnostics</Label>
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id={`${asset.id}-diagnostics`}
              onChange={event =>
                setReviewDraft(current => ({
                  ...current,
                  diagnostics: event.target.value
                }))
              }
              value={reviewDraft.diagnostics}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              checked={reviewDraft.instancingEligible}
              onChange={event =>
                setReviewDraft(current => ({
                  ...current,
                  instancingEligible: event.target.checked
                }))
              }
              type="checkbox"
            />
            Instancing eligible
          </label>

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || asset.status !== 'review'} type="submit">
              Save Review
            </Button>
            <Button
              disabled={pending || asset.status !== 'review'}
              onClick={() => approveMutation.mutate()}
              type="button"
              variant="outline"
            >
              Approve Asset
            </Button>
          </div>
        </form>

        <div className="space-y-4 rounded-md border p-4">
          <div>
            <div className="text-sm font-medium">Archetype Promotion</div>
            <p className="text-sm text-muted-foreground">
              Draft the placeable archetype bound to this asset version. Review
              assets can be approved and promoted in one step.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-archetype-id`}>Archetype ID</Label>
              <Input
                id={`${asset.id}-archetype-id`}
                onChange={event =>
                  setArchetypeDraft(current => ({
                    ...current,
                    id: event.target.value
                  }))
                }
                value={archetypeDraft.id}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-archetype-name`}>Name</Label>
              <Input
                id={`${asset.id}-archetype-name`}
                onChange={event =>
                  setArchetypeDraft(current => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                value={archetypeDraft.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-archetype-category`}>Category</Label>
              <Select
                id={`${asset.id}-archetype-category`}
                onChange={event =>
                  setArchetypeDraft(current => ({
                    ...current,
                    category: event.target.value as ArchetypeCategory
                  }))
                }
                value={archetypeDraft.category}
              >
                {archetypeCategories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-archetype-status`}>Status</Label>
              <Select
                id={`${asset.id}-archetype-status`}
                onChange={event =>
                  setArchetypeDraft(current => ({
                    ...current,
                    status: event.target.value as ArchetypeStatus
                  }))
                }
                value={archetypeDraft.status}
              >
                {archetypeStatuses.map(status => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-archetype-tags`}>Tags</Label>
              <Input
                id={`${asset.id}-archetype-tags`}
                onChange={event =>
                  setArchetypeDraft(current => ({
                    ...current,
                    tags: event.target.value
                  }))
                }
                placeholder="industrial, cargo"
                value={archetypeDraft.tags}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || asset.status !== 'ready'}
              onClick={() => archetypeMutation.mutate()}
              type="button"
            >
              Create Archetype
            </Button>
            <Button
              disabled={pending || asset.status !== 'review'}
              onClick={() => approveAndCreateMutation.mutate()}
              type="button"
              variant="outline"
            >
              Approve and Create
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-md border p-4">
          <div>
            <div className="text-sm font-medium">Zarch Runtime Entity Binding</div>
            <p className="text-sm text-muted-foreground">
              Bind this approved asset to a stable Zarch runtime entity id for
              non-static gameplay models.
            </p>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <div>
              Current asset binding:{' '}
              {currentRuntimeEntity
                ? `${currentRuntimeEntity.id} (${currentRuntimeEntity.name})`
                : 'None'}
            </div>
            <div>
              Target runtime entity:{' '}
              {runtimeEntities.find(
                entity => entity.id === runtimeEntityDraft.id.trim()
              )?.assetVersionId ?? 'Unbound'}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-runtime-entity-id`}>
                Runtime entity ID
              </Label>
              <Input
                id={`${asset.id}-runtime-entity-id`}
                onChange={event =>
                  setRuntimeEntityDraft(current => ({
                    ...current,
                    id: event.target.value
                  }))
                }
                value={runtimeEntityDraft.id}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-runtime-entity-name`}>Name</Label>
              <Input
                id={`${asset.id}-runtime-entity-name`}
                onChange={event =>
                  setRuntimeEntityDraft(current => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                value={runtimeEntityDraft.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${asset.id}-runtime-entity-length`}>
                Length meters
              </Label>
              <Input
                id={`${asset.id}-runtime-entity-length`}
                onChange={event =>
                  setRuntimeEntityDraft(current => ({
                    ...current,
                    lengthMeters: event.target.value
                  }))
                }
                value={runtimeEntityDraft.lengthMeters}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || asset.status !== 'ready'}
              onClick={() => runtimeEntityMutation.mutate()}
              type="button"
              variant="outline"
            >
              Bind Runtime Entity
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<AssetVersionStatus | 'all'>('all');
  const [file, setFile] = useState<File | null>(null);

  const mapsQuery = useQuery({
    queryFn: () => client.maps.list({}),
    queryKey: ['maps']
  });

  const assetsQuery = useQuery({
    queryFn: () =>
      client.maps.listAssetVersions({
        status: status === 'all' ? undefined : status
      }),
    queryKey: ['assets', status]
  });
  const runtimeEntitiesQuery = useQuery({
    queryFn: () => client.maps.listZarchRuntimeEntities({}),
    queryKey: ['zarch-runtime-entities']
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error('Choose a GLB file first');
      }

      return uploadAsset(file);
    },
    onError: error => {
      toast.error(toMessage(error, 'Failed to upload asset'));
    },
    onSuccess: async uploaded => {
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast.success(`Uploaded ${uploaded.id}`);
    }
  });

  const assets = assetsQuery.data ?? [];
  const maps = mapsQuery.data ?? [];
  const runtimeEntities = runtimeEntitiesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assets</h2>
          <p className="text-muted-foreground">
            Upload runtime props, review derived metadata, and promote approved
            assets into archetypes.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Label htmlFor="asset-status-filter">Status filter</Label>
          <Select
            id="asset-status-filter"
            onChange={event =>
              setStatus(event.target.value as AssetVersionStatus | 'all')
            }
            value={status}
          >
            {assetStatusOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Upload Asset</CardTitle>
          <CardDescription>
            Upload a source GLB. The API stores the original, derives review
            metadata, and produces a runtime artifact asynchronously.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 md:flex-row md:items-end"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              uploadMutation.mutate();
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="asset-upload">GLB file</Label>
              <Input
                accept=".glb,model/gltf-binary"
                id="asset-upload"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setFile(event.target.files?.[0] ?? null)
                }
                ref={fileInputRef}
                type="file"
              />
            </div>
            <Button disabled={uploadMutation.isPending || file === null} type="submit">
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {assetsQuery.isLoading ? (
        <div className="text-muted-foreground">Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No assets found for the current filter.
        </div>
      ) : (
        <div className="space-y-6">
          {assets.map(asset => (
            <AssetReviewCard
              asset={asset}
              availableMaps={maps}
              key={asset.id}
              runtimeEntities={runtimeEntities}
            />
          ))}
        </div>
      )}
    </div>
  );
}
