import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Archive, Boxes, Search, Trash2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { apiUrl, client } from '@/lib/api-client';
import { formatTimestamp, parseTags } from '@/lib/format';
import { toMessage } from '@/pages/maps/editor/helpers/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Archetype,
  ArchetypeCategory,
  ArchetypeStatus,
  AssetVersion,
  AssetVersionListItem,
  AssetVersionStatus,
  MapMetadata,
  ZarchRuntimeEntity
} from 'carrier-contracts/types';

import {
  type AssetWorkflowFilter,
  filterAssetItems,
  sortAssetItems
} from './assets.helpers';

const PAGE_SIZE = 12;
const defaultWorkflowFilter: AssetWorkflowFilter = 'all';
const assetStatusOptions: Array<AssetVersionStatus | 'all'> = [
  'all',
  'review',
  'ready',
  'processing',
  'uploaded',
  'failed',
  'archived'
];
const workflowOptions: Array<{
  label: string;
  value: AssetWorkflowFilter;
}> = [
  { label: 'Needs Review', value: 'review' },
  { label: 'Ready', value: 'ready' },
  { label: 'Failed', value: 'failed' },
  { label: 'Bound', value: 'bound' },
  { label: 'Unbound', value: 'unbound' },
  { label: 'Archived', value: 'archived' },
  { label: 'All', value: 'all' }
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

type AssetsPageUrlState = {
  page: number;
  search: string;
  selectedAssetId: string | null;
  status: AssetVersionStatus | 'all';
  workflow: AssetWorkflowFilter;
};

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

const statusBadgeVariant = (status: AssetVersionStatus) => {
  switch (status) {
    case 'ready':
      return 'default' as const;
    case 'review':
      return 'secondary' as const;
    case 'archived':
      return 'outline' as const;
    case 'failed':
      return 'destructive' as const;
    case 'uploaded':
    case 'processing':
      return 'secondary' as const;
  }
};

const titleCaseSlug = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

const defaultArchetypeId = (assetId: string) =>
  assetId.replace(/-v\d+$/, '') || assetId;

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

const parseAssetsPageUrlState = (): AssetsPageUrlState => {
  const params = new URLSearchParams(window.location.search);
  const workflowParam = params.get('workflow');
  const statusParam = params.get('status');
  const pageParam = Number(params.get('page') ?? '1');

  const workflow = workflowOptions.some(option => option.value === workflowParam)
    ? (workflowParam as AssetWorkflowFilter)
    : defaultWorkflowFilter;
  const status = assetStatusOptions.includes(
    (statusParam ?? 'all') as AssetVersionStatus | 'all'
  )
    ? ((statusParam ?? 'all') as AssetVersionStatus | 'all')
    : 'all';

  return {
    page: Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1,
    search: params.get('search') ?? '',
    selectedAssetId: params.get('asset'),
    status,
    workflow
  };
};

function AssetUsageBadges({ item }: { item: AssetVersionListItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {item.usage.archetypeIds.length > 0 ? (
        <Badge variant="secondary">
          {item.usage.archetypeIds.length} archetype
          {item.usage.archetypeIds.length === 1 ? '' : 's'}
        </Badge>
      ) : null}
      {item.usage.runtimeEntityIds.length > 0 ? (
        <Badge variant="secondary">
          {item.usage.runtimeEntityIds.length} runtime entity
          {item.usage.runtimeEntityIds.length === 1 ? '' : 'ies'}
        </Badge>
      ) : null}
      {item.usage.archetypeIds.length === 0 &&
      item.usage.runtimeEntityIds.length === 0 ? (
        <Badge variant="outline">Unbound</Badge>
      ) : null}
      {!item.runtimeArtifactPresent ? (
        <Badge variant="destructive">No runtime</Badge>
      ) : null}
    </div>
  );
}

function AssetDetailPanel({
  assetItem,
  availableMaps,
  onDeleted,
  runtimeEntities
}: {
  assetItem: AssetVersionListItem;
  availableMaps: MapMetadata[];
  onDeleted: (id: string) => void;
  runtimeEntities: ZarchRuntimeEntity[];
}) {
  const queryClient = useQueryClient();
  const asset = assetItem.asset;
  const currentRuntimeEntity =
    runtimeEntities.find(entity => entity.assetVersionId === asset.id) ?? null;
  const [reviewDraft, setReviewDraft] = useState(() => buildReviewDraft(asset));
  const [archetypeDraft, setArchetypeDraft] = useState(() =>
    buildArchetypeDraft(asset)
  );
  const [runtimeEntityDraft, setRuntimeEntityDraft] = useState(() =>
    buildRuntimeEntityDraft(currentRuntimeEntity)
  );
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
      await invalidateAssets();
      toast.success(`Runtime entity ${bound.id} now points to ${asset.id}`);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async () => client.maps.archiveAssetVersion({ id: asset.id }),
    onError: error => {
      toast.error(toMessage(error, 'Failed to archive asset'));
    },
    onSuccess: async archived => {
      await invalidateAssets();
      setShowArchiveDialog(false);
      toast.success(`Asset ${archived.id} archived`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => client.maps.deleteAssetVersion({ id: asset.id }),
    onError: error => {
      toast.error(toMessage(error, 'Failed to delete asset'));
    },
    onSuccess: async deleted => {
      await invalidateAssets();
      setShowDeleteDialog(false);
      onDeleted(deleted.id);
      toast.success(`Asset ${deleted.id} deleted`);
    }
  });

  const pending =
    reviewMutation.isPending ||
    approveMutation.isPending ||
    archetypeMutation.isPending ||
    approveAndCreateMutation.isPending ||
    runtimeEntityMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending;

  const runtimeHref =
    asset.runtimeFile === null ? null : `${apiUrl}/maps/assets/${asset.id}/runtime`;
  const targetRuntimeBinding =
    runtimeEntities.find(entity => entity.id === runtimeEntityDraft.id.trim()) ??
    null;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">{asset.id}</h3>
            <p className="text-sm text-muted-foreground">
              Uploaded {formatTimestamp(asset.createdAt)}. Updated{' '}
              {formatTimestamp(asset.updatedAt)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusBadgeVariant(asset.status)}>{asset.status}</Badge>
            {assetItem.isDeletable ? (
              <Badge variant="outline">Deletable</Badge>
            ) : (
              <Badge variant="secondary">Referenced</Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Preview</CardTitle>
            <CardDescription>
              Inspect the runtime artifact against current footprint and grounding
              settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssetPreviewPanel
              asset={asset}
              availableMaps={availableMaps}
              footprintDepthMeters={Number(reviewDraft.footprintDepthMeters)}
              footprintWidthMeters={Number(reviewDraft.footprintWidthMeters)}
              maxHeightDeltaMeters={Number(reviewDraft.maxHeightDeltaMeters)}
              runtimeHref={runtimeHref}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Files</CardTitle>
            <CardDescription>
              Source and runtime artifact metadata for this asset version.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>Original: {asset.originalFile.path}</div>
            <div>
              Runtime: {asset.runtimeFile ? asset.runtimeFile.path : 'Not available yet'}
            </div>
            {runtimeHref ? (
              <a
                className="font-medium text-primary underline-offset-4 hover:underline"
                href={runtimeHref}
                rel="noreferrer"
                target="_blank"
              >
                Open runtime artifact
              </a>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Relationships</CardTitle>
            <CardDescription>
              See how this asset is used before promoting, archiving, or deleting
              it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Archetypes</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assetItem.usage.archetypeIds.length > 0 ? (
                    assetItem.usage.archetypeIds.map(id => (
                      <Badge key={id} variant="secondary">
                        {id}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Unbound</span>
                  )}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Runtime Entities</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assetItem.usage.runtimeEntityIds.length > 0 ? (
                    assetItem.usage.runtimeEntityIds.map(id => (
                      <Badge key={id} variant="secondary">
                        {id}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Unbound</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Runtime Artifact</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {assetItem.runtimeArtifactPresent ? 'Present' : 'Missing'}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Lifecycle</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {asset.status === 'archived'
                    ? 'Archived from normal workflows'
                    : asset.status === 'ready'
                      ? 'Approved and immutable'
                      : 'Still mutable'}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Delete Safety</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {assetItem.isDeletable
                    ? 'Safe to delete permanently'
                    : 'Blocked by live references'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Review Metadata</CardTitle>
            <CardDescription>
              Adjust derived metadata before approval. Ready and archived assets
              are read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  <Label htmlFor={`${asset.id}-max-height-delta`}>Max height delta</Label>
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
                <Button
                  disabled={pending || asset.status !== 'review'}
                  type="submit"
                >
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Actions</CardTitle>
            <CardDescription>
              Promote the selected asset or manage its lifecycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 rounded-md border p-4">
              <div>
                <div className="text-sm font-medium">Archetype Promotion</div>
                <p className="text-sm text-muted-foreground">
                  Promote approved assets into the global archetype catalog.
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
                <div className="text-sm font-medium">Runtime Entity Binding</div>
                <p className="text-sm text-muted-foreground">
                  Point a stable Zarch runtime entity id at this approved asset.
                </p>
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

              <div className="space-y-1 text-sm text-muted-foreground">
                <div>
                  Current asset binding:{' '}
                  {currentRuntimeEntity
                    ? `${currentRuntimeEntity.id} (${currentRuntimeEntity.name})`
                    : 'None'}
                </div>
                <div>
                  Target runtime entity currently points to:{' '}
                  {targetRuntimeBinding?.assetVersionId ?? 'Nothing'}
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

            <div className="space-y-4 rounded-md border border-destructive/30 p-4">
              <div>
                <div className="text-sm font-medium">Danger Zone</div>
                <p className="text-sm text-muted-foreground">
                  Archive to remove the asset from normal workflows, or delete it
                  permanently when it is unreferenced.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending || asset.status === 'archived'}
                  onClick={() => setShowArchiveDialog(true)}
                  type="button"
                  variant="outline"
                >
                  <Archive />
                  Archive Asset
                </Button>
                <Button
                  disabled={pending || !assetItem.isDeletable}
                  onClick={() => setShowDeleteDialog(true)}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 />
                  Delete Permanently
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog onOpenChange={setShowArchiveDialog} open={showArchiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Asset</DialogTitle>
            <DialogDescription>
              {asset.id} will be hidden from the normal review queue and promotion
              flows, but existing references will still resolve.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowArchiveDialog(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => archiveMutation.mutate()}
              type="button"
              variant="default"
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Asset Permanently</DialogTitle>
            <DialogDescription>
              This removes {asset.id} permanently. This action is only available
              because the asset is currently unreferenced.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowDeleteDialog(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteMutation.mutate()}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AssetsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasHydratedUrlStateRef = useRef(false);
  const initialUrlState = useMemo(() => parseAssetsPageUrlState(), []);
  const [search, setSearch] = useState(initialUrlState.search);
  const [status, setStatus] = useState<AssetVersionStatus | 'all'>(
    initialUrlState.status
  );
  const [workflow, setWorkflow] = useState<AssetWorkflowFilter>(
    initialUrlState.workflow
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    initialUrlState.selectedAssetId
  );
  const [page, setPage] = useState(initialUrlState.page);
  const [file, setFile] = useState<File | null>(null);

  const mapsQuery = useQuery({
    queryFn: () => client.maps.list({}),
    queryKey: ['maps']
  });
  const assetsQuery = useQuery({
    queryFn: () =>
      client.maps.listAssetVersions({
        status: 'all'
      }),
    queryKey: ['assets', 'v2'],
    refetchOnMount: 'always'
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

  const sortedAssets = useMemo(
    () => sortAssetItems(assetsQuery.data ?? []),
    [assetsQuery.data]
  );
  const visibleAssets = useMemo(
    () =>
      filterAssetItems({
        items: sortedAssets,
        search,
        status,
        workflow
      }),
    [search, sortedAssets, status, workflow]
  );
  const totalPages = Math.max(Math.ceil(visibleAssets.length / PAGE_SIZE), 1);
  const pagedAssets = useMemo(
    () =>
      visibleAssets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, visibleAssets]
  );

  useEffect(() => {
    if (!hasHydratedUrlStateRef.current) {
      hasHydratedUrlStateRef.current = true;
      return;
    }

    setPage(1);
  }, [search, status, workflow]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (visibleAssets.length === 0) {
      setSelectedAssetId(null);
      return;
    }

    const selectedStillVisible = visibleAssets.some(
      asset => asset.asset.id === selectedAssetId
    );

    if (!selectedStillVisible) {
      setSelectedAssetId(visibleAssets[0]?.asset.id ?? null);
    }
  }, [selectedAssetId, visibleAssets]);

  const selectedAssetItem =
    visibleAssets.find(asset => asset.asset.id === selectedAssetId) ?? null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (workflow === defaultWorkflowFilter) {
      params.delete('workflow');
    } else {
      params.set('workflow', workflow);
    }

    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }

    if (search.trim().length === 0) {
      params.delete('search');
    } else {
      params.set('search', search);
    }

    if (selectedAssetId) {
      params.set('asset', selectedAssetId);
    } else {
      params.delete('asset');
    }

    if (page <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }

    const nextQuery = params.toString();
    const nextUrl =
      nextQuery.length > 0
        ? `${window.location.pathname}?${nextQuery}`
        : window.location.pathname;

    window.history.replaceState(null, '', nextUrl);
  }, [page, search, selectedAssetId, status, workflow]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assets</h2>
          <p className="text-muted-foreground">
            Triage the asset review queue, inspect usage, and promote or retire
            assets without wading through a single long page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workflowOptions.map(option => (
            <Button
              key={option.value}
              onClick={() => setWorkflow(option.value)}
              size="sm"
              type="button"
              variant={workflow === option.value ? 'default' : 'outline'}
            >
              {option.label}
            </Button>
          ))}
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(420px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Asset Queue</CardTitle>
            <CardDescription>
              Search, filter, and select asset versions for focused review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="asset-search">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    id="asset-search"
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search ids, files, diagnostics, archetypes, runtime entities"
                    value={search}
                  />
                </div>
              </div>
              <div className="w-full md:w-52 space-y-2">
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

            {assetsQuery.isLoading ? (
              <div className="text-muted-foreground">Loading assets...</div>
            ) : assetsQuery.isError ? (
              <div className="rounded-lg border border-destructive/40 p-6 text-sm text-muted-foreground">
                Failed to load assets: {toMessage(assetsQuery.error, 'Unknown error')}
              </div>
            ) : visibleAssets.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                <div className="space-y-3">
                  <div>No assets found for the current queue and filters.</div>
                  {(() => {
                    if (workflow === 'all') return null;
                    const outsideCount = filterAssetItems({
                      items: sortedAssets,
                      search,
                      status,
                      workflow: 'all'
                    }).length;
                    if (outsideCount === 0) return null;
                    return (
                      <div className="space-y-3">
                        <div className="text-sm">
                          {outsideCount} asset
                          {outsideCount === 1 ? '' : 's'} exist
                          outside the current workflow view.
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button
                            onClick={() => setWorkflow('ready')}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Show Ready
                          </Button>
                          <Button
                            onClick={() => setWorkflow('all')}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Show All
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedAssets.map(item => {
                      const isSelected = item.asset.id === selectedAssetId;

                      return (
                        <TableRow
                          className={isSelected ? 'bg-accent/50' : undefined}
                          key={item.asset.id}
                          onClick={() => setSelectedAssetId(item.asset.id)}
                        >
                          <TableCell>
                            <div className="font-medium">{item.asset.id}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.asset.originalFile.path}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <Badge variant={statusBadgeVariant(item.asset.status)}>
                                {item.asset.status}
                              </Badge>
                              {!item.isDeletable ? (
                                <span className="text-xs text-muted-foreground">
                                  protected
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <AssetUsageBadges item={item} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatTimestamp(item.asset.updatedAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    Showing {pagedAssets.length} of {visibleAssets.length} matching
                    assets.
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={page <= 1}
                      onClick={() => setPage(current => Math.max(current - 1, 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage(current => Math.min(current + 1, totalPages))
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Asset Details</CardTitle>
            <CardDescription>
              Review one asset at a time with clear usage and lifecycle context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedAssetItem ? (
              <AssetDetailPanel
                assetItem={selectedAssetItem}
                availableMaps={(mapsQuery.data ?? []) as MapMetadata[]}
                onDeleted={id => {
                  if (selectedAssetId === id) {
                    setSelectedAssetId(null);
                  }
                }}
                runtimeEntities={runtimeEntitiesQuery.data ?? []}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Boxes className="h-5 w-5" />
                </div>
                Select an asset from the queue to inspect its preview, review
                metadata, relationships, and lifecycle actions.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
