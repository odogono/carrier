import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { client } from '@/lib/api-client';
import { formatTimestamp, parseTags } from '@/lib/format';
import { toMessage } from '@/pages/maps/editor/helpers/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Archetype,
  ArchetypeCategory,
  ArchetypeStatus
} from 'carrier-contracts/types';

const archetypeStatuses: Array<ArchetypeStatus | 'all'> = [
  'all',
  'active',
  'deprecated',
  'archived'
];

const archetypeCategories: Array<ArchetypeCategory | 'all'> = [
  'all',
  'building',
  'landmark',
  'industrial',
  'natural-prop'
];

const statusBadgeVariant = (status: ArchetypeStatus) => {
  switch (status) {
    case 'active':
      return 'default' as const;
    case 'deprecated':
      return 'secondary' as const;
    case 'archived':
      return 'outline' as const;
  }
};

type ArchetypeDraft = {
  category: ArchetypeCategory;
  name: string;
  status: ArchetypeStatus;
  tags: string;
};

const buildDraft = (archetype: Archetype): ArchetypeDraft => ({
  category: archetype.category,
  name: archetype.name,
  status: archetype.status,
  tags: archetype.tags.join(', ')
});

export function ArchetypesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ArchetypeStatus | 'all'>('all');
  const [category, setCategory] = useState<ArchetypeCategory | 'all'>('all');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(
    null
  );
  const [draft, setDraft] = useState<ArchetypeDraft | null>(null);

  const archetypesQuery = useQuery({
    queryFn: () =>
      client.maps.listArchetypes({
        status: status === 'all' ? undefined : status
      }),
    queryKey: ['archetypes', status]
  });

  const archetypes = archetypesQuery.data ?? [];
  const visibleArchetypes = useMemo(
    () =>
      archetypes.filter(archetype =>
        category === 'all' ? true : archetype.category === category
      ),
    [archetypes, category]
  );

  useEffect(() => {
    if (visibleArchetypes.length === 0) {
      setSelectedArchetypeId(null);
      return;
    }

    const selectedStillVisible = visibleArchetypes.some(
      archetype => archetype.id === selectedArchetypeId
    );

    if (!selectedStillVisible) {
      setSelectedArchetypeId(visibleArchetypes[0]?.id ?? null);
    }
  }, [visibleArchetypes]);

  const selectedArchetype =
    visibleArchetypes.find(a => a.id === selectedArchetypeId) ?? null;

  useEffect(() => {
    setDraft(selectedArchetype ? buildDraft(selectedArchetype) : null);
  }, [selectedArchetype?.id, selectedArchetype?.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedArchetype || !draft) {
        throw new Error('Select an archetype to edit');
      }

      return client.maps.updateArchetype({
        category: draft.category,
        id: selectedArchetype.id,
        name: draft.name.trim(),
        status: draft.status,
        tags: parseTags(draft.tags)
      });
    },
    onError: error => {
      toast.error(toMessage(error, 'Failed to update archetype'));
    },
    onSuccess: async updated => {
      await queryClient.invalidateQueries({ queryKey: ['archetypes'] });
      toast.success(`Archetype ${updated.id} saved`);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Archetypes</h2>
          <p className="text-muted-foreground">
            Browse the global content catalog and manage archetype lifecycle.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="w-44">
            <Label htmlFor="archetype-status-filter">Status filter</Label>
            <Select
              id="archetype-status-filter"
              onChange={event =>
                setStatus(event.target.value as ArchetypeStatus | 'all')
              }
              value={status}
            >
              {archetypeStatuses.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Label htmlFor="archetype-category-filter">Category filter</Label>
            <Select
              id="archetype-category-filter"
              onChange={event =>
                setCategory(event.target.value as ArchetypeCategory | 'all')
              }
              value={category}
            >
              {archetypeCategories.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Global Catalog</CardTitle>
            <CardDescription>
              Active archetypes are placeable. Deprecated and archived entries
              remain resolvable for existing placements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {archetypesQuery.isLoading ? (
              <div className="text-muted-foreground">Loading archetypes...</div>
            ) : visibleArchetypes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                No archetypes found for the current filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Asset Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleArchetypes.map(archetype => {
                    const isSelected = archetype.id === selectedArchetypeId;

                    return (
                      <TableRow
                        className={isSelected ? 'bg-accent/50' : undefined}
                        key={archetype.id}
                        onClick={() => setSelectedArchetypeId(archetype.id)}
                      >
                        <TableCell className="font-mono text-xs">
                          {archetype.id}
                        </TableCell>
                        <TableCell className="font-medium">
                          {archetype.name}
                        </TableCell>
                        <TableCell>{archetype.category}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(archetype.status)}>
                            {archetype.status === 'active'
                              ? 'placeable'
                              : archetype.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {archetype.assetVersionId}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Archetype Details</CardTitle>
            <CardDescription>
              Edit mutable metadata while keeping the bound asset version
              immutable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedArchetype || !draft ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                <Boxes className="h-8 w-8" />
                Select an archetype to inspect or edit it.
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="archetype-id">Archetype ID</Label>
                  <Input
                    disabled
                    id="archetype-id"
                    value={selectedArchetype.id}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="archetype-asset-version">Asset Version</Label>
                  <Input
                    disabled
                    id="archetype-asset-version"
                    value={selectedArchetype.assetVersionId}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="archetype-name">Name</Label>
                    <Input
                      id="archetype-name"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraft(current =>
                          current
                            ? {
                                ...current,
                                name: event.target.value
                              }
                            : current
                        )
                      }
                      value={draft.name}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="archetype-category">Category</Label>
                    <Select
                      id="archetype-category"
                      onChange={event =>
                        setDraft(current =>
                          current
                            ? {
                                ...current,
                                category: event.target.value as ArchetypeCategory
                              }
                            : current
                        )
                      }
                      value={draft.category}
                    >
                      {archetypeCategories
                        .filter(option => option !== 'all')
                        .map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="archetype-status">Lifecycle Status</Label>
                  <Select
                    id="archetype-status"
                    onChange={event =>
                      setDraft(current =>
                        current
                          ? {
                              ...current,
                              status: event.target.value as ArchetypeStatus
                            }
                          : current
                      )
                    }
                    value={draft.status}
                  >
                    {archetypeStatuses
                      .filter(option => option !== 'all')
                      .map(option => (
                        <option key={option} value={option}>
                          {option === 'active' ? 'active (placeable)' : option}
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="archetype-tags">Tags</Label>
                  <Input
                    id="archetype-tags"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDraft(current =>
                        current
                          ? {
                              ...current,
                              tags: event.target.value
                            }
                          : current
                      )
                    }
                    placeholder="coastal, fortified"
                    value={draft.tags}
                  />
                  <p className="text-sm text-muted-foreground">
                    Comma-separated organizational tags.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Created</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTimestamp(selectedArchetype.createdAt)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Updated</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTimestamp(selectedArchetype.updatedAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">Placeability</div>
                    <div className="text-sm text-muted-foreground">
                      {draft.status === 'active'
                        ? 'Visible in pickers and available for placement.'
                        : 'Kept for placement resolution only; hidden from placeable pickers.'}
                    </div>
                  </div>
                  <Badge variant={statusBadgeVariant(draft.status)}>
                    {draft.status}
                  </Badge>
                </div>
                <Button disabled={saveMutation.isPending} type="submit">
                  {saveMutation.isPending ? 'Saving...' : 'Save Archetype'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
