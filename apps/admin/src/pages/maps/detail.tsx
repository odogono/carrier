import {
  DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS,
  isFiniteMap,
  type MapExportKind
} from 'carrier-contracts/types';
import { ArrowLeft, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { MapViewer } from '@/components/map-viewer';
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
import { client } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

export function MapDetailPage() {
  const { id } = useParams({ from: '/maps/$id' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [name, setName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);
  const [regenerateSeed, setRegenerateSeed] = useState('');
  const [regenerateIslandDensityBias, setRegenerateIslandDensityBias] =
    useState(String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.densityBias));
  const [
    regenerateIslandMajorAttractorCount,
    setRegenerateIslandMajorAttractorCount
  ] = useState(String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.majorAttractorCount));
  const [
    regenerateIslandMediumAttractorCount,
    setRegenerateIslandMediumAttractorCount
  ] = useState(String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.mediumAttractorCount));
  const [regenerateIslandRadiusScale, setRegenerateIslandRadiusScale] =
    useState(String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.radiusScale));
  const [exportName, setExportName] = useState('');
  const [exportBoundsLoaded, setExportBoundsLoaded] = useState(false);
  const [minX, setMinX] = useState('0');
  const [minZ, setMinZ] = useState('0');
  const [maxX, setMaxX] = useState('640');
  const [maxZ, setMaxZ] = useState('640');
  const [metersPerTile, setMetersPerTile] = useState('10');
  const [chunkSizeTiles, setChunkSizeTiles] = useState('32');
  const [exportKind, setExportKind] = useState<MapExportKind>(
    'finite-vector-slice'
  );

  const mapQuery = useQuery({
    queryFn: () => client.maps.find({ id }),
    queryKey: ['maps', id]
  });

  const overviewQuery = useQuery({
    enabled: mapQuery.data?.kind === 'infinite-vector',
    queryFn: () => client.maps.getOverview({ mapId: id }),
    queryKey: ['maps', id, 'overview']
  });

  const exportsQuery = useQuery({
    enabled: mapQuery.data?.kind === 'infinite-vector',
    queryFn: () => client.maps.listExports({ mapId: id }),
    queryKey: ['maps', id, 'exports']
  });

  const map = mapQuery.data;

  useEffect(() => {
    if (map && !nameLoaded) {
      setName(map.name ?? '');
      setNameLoaded(true);
    }
  }, [map, nameLoaded]);

  useEffect(() => {
    if (showRegenerate && map?.kind === 'wrapped-classic') {
      setRegenerateSeed(map.seed);
      if (map.generator === 'island-clusters') {
        setRegenerateIslandDensityBias(
          String(
            map.generatorParams?.densityBias ??
              DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.densityBias
          )
        );
        setRegenerateIslandMajorAttractorCount(
          String(
            map.generatorParams?.majorAttractorCount ??
              DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.majorAttractorCount
          )
        );
        setRegenerateIslandMediumAttractorCount(
          String(
            map.generatorParams?.mediumAttractorCount ??
              DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.mediumAttractorCount
          )
        );
        setRegenerateIslandRadiusScale(
          String(
            map.generatorParams?.radiusScale ??
              DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.radiusScale
          )
        );
      }
    }
  }, [map?.kind, map?.seed, showRegenerate]);

  useEffect(() => {
    if (!overviewQuery.data?.bounds || exportBoundsLoaded) {
      return;
    }

    setMinX(String(overviewQuery.data.bounds.minX));
    setMinZ(String(overviewQuery.data.bounds.minZ));
    setMaxX(String(overviewQuery.data.bounds.maxX));
    setMaxZ(String(overviewQuery.data.bounds.maxZ));
    setMetersPerTile(String(mapQuery.data?.resolution.metersPerTile ?? 10));
    setChunkSizeTiles(String(mapQuery.data?.resolution.chunkSizeTiles ?? 32));
    setExportBoundsLoaded(true);
  }, [
    exportBoundsLoaded,
    mapQuery.data?.resolution.chunkSizeTiles,
    mapQuery.data?.resolution.metersPerTile,
    overviewQuery.data?.bounds
  ]);

  const updateMutation = useMutation({
    mutationFn: () =>
      client.maps.update({
        id,
        name: name.trim() || null
      }),
    onError: () => {
      toast.error('Failed to update map');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => client.maps.delete({ id }),
    onError: () => {
      toast.error('Failed to delete map');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map deleted');
      void navigate({ to: '/maps' });
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      client.maps.regenerate({
        expectedRevision: map!.revision,
        generatorParams:
          map!.generator === 'island-clusters'
            ? {
                densityBias: Number(regenerateIslandDensityBias),
                majorAttractorCount: Number(
                  regenerateIslandMajorAttractorCount
                ),
                mediumAttractorCount: Number(
                  regenerateIslandMediumAttractorCount
                ),
                radiusScale: Number(regenerateIslandRadiusScale)
              }
            : undefined,
        id,
        seed: regenerateSeed.trim()
      }),
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to regenerate map'
      );
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maps'] }),
        queryClient.invalidateQueries({ queryKey: ['maps', id] }),
        queryClient.removeQueries({
          predicate: query =>
            query.queryKey[0] === 'map-chunk' && query.queryKey[1] === id
        })
      ]);
      toast.success('Map regenerated');
      setShowRegenerate(false);
    }
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      client.maps.createExport({
        bounds: {
          maxX: Number(maxX),
          maxZ: Number(maxZ),
          minX: Number(minX),
          minZ: Number(minZ)
        },
        chunkSizeTiles: Number(chunkSizeTiles),
        expectedRevision: map!.revision,
        kind: exportKind,
        mapId: id,
        metersPerTile: Number(metersPerTile),
        name: exportName.trim() || undefined
      }),
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create export'
      );
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maps'] }),
        queryClient.invalidateQueries({ queryKey: ['maps', id, 'exports'] })
      ]);
      toast.success('Export created');
      setShowExport(false);
      setExportName('');
    }
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  const parseNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  if (mapQuery.isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (!map) {
    return (
      <div className="space-y-4">
        <div className="text-muted-foreground">Map not found</div>
        <Link to="/maps">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Maps
          </Button>
        </Link>
      </div>
    );
  }

  const hasChanges = name !== (map.name ?? '');
  const regenerateSeedValid = regenerateSeed.trim().length > 0;
  const regenerateIslandParamsValid =
    Number.isFinite(Number(regenerateIslandDensityBias)) &&
    Number.isFinite(Number(regenerateIslandMajorAttractorCount)) &&
    Number.isInteger(Number(regenerateIslandMajorAttractorCount)) &&
    Number.isFinite(Number(regenerateIslandMediumAttractorCount)) &&
    Number.isInteger(Number(regenerateIslandMediumAttractorCount)) &&
    Number.isFinite(Number(regenerateIslandRadiusScale));
  const finite = isFiniteMap(map);
  const parsedMinX = parseNumber(minX);
  const parsedMinZ = parseNumber(minZ);
  const parsedMaxX = parseNumber(maxX);
  const parsedMaxZ = parseNumber(maxZ);
  const parsedMetersPerTile = parseNumber(metersPerTile);
  const parsedChunkSizeTiles = parseNumber(chunkSizeTiles);
  const exportDimensionsValid =
    parsedMinX !== null &&
    parsedMinZ !== null &&
    parsedMaxX !== null &&
    parsedMaxZ !== null &&
    parsedMetersPerTile !== null &&
    parsedChunkSizeTiles !== null &&
    Number.isInteger(parsedChunkSizeTiles) &&
    parsedChunkSizeTiles > 0 &&
    parsedMaxX > parsedMinX &&
    parsedMaxZ > parsedMinZ &&
    Number.isInteger((parsedMaxX - parsedMinX) / parsedMetersPerTile) &&
    Number.isInteger((parsedMaxZ - parsedMinZ) / parsedMetersPerTile);
  const exportStats = exportDimensionsValid
    ? (() => {
        const widthTiles = (parsedMaxX! - parsedMinX!) / parsedMetersPerTile!;
        const heightTiles = (parsedMaxZ! - parsedMinZ!) / parsedMetersPerTile!;
        const chunkSize = parsedChunkSizeTiles!;
        const chunkCount =
          Math.ceil(widthTiles / chunkSize) *
          Math.ceil(heightTiles / chunkSize);
        const heightBytes =
          (widthTiles + Math.ceil(widthTiles / chunkSize)) *
          (heightTiles + Math.ceil(heightTiles / chunkSize)) *
          4;
        const materialBytes = widthTiles * heightTiles;
        return {
          binaryBytes: heightBytes + materialBytes,
          chunkCount,
          heightBytes,
          heightTiles,
          widthTiles
        };
      })()
    : null;
  const formatBytes = (value: number | null) =>
    value === null
      ? '—'
      : `${(value / 1024).toFixed(value >= 1024 ? 1 : 0)} KiB`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/maps">
          <Button size="icon" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-3xl font-bold tracking-tight">
            {map.name ?? 'Unnamed Map'}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">{map.id}</p>
        </div>
        {map.kind === 'wrapped-classic' && (
          <Button
            onClick={() => setShowRegenerate(true)}
            size="sm"
            variant="destructive"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
        )}
        <Button
          onClick={() => setShowDelete(true)}
          size="sm"
          variant="destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
        {map.kind === 'infinite-vector' && (
          <>
            <Button
              onClick={() => setShowExport(true)}
              size="sm"
              variant="outline"
            >
              Export Slice
            </Button>
            <Link params={{ id }} to="/maps/$id/editor">
              <Button size="sm" variant="outline">
                Open Editor
              </Button>
            </Link>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Map Preview</CardTitle>
          <CardDescription>Drag to pan, scroll to zoom</CardDescription>
        </CardHeader>
        <CardContent>
          <MapViewer map={map} mapId={id} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Edit Properties</CardTitle>
            <CardDescription>Update editable map properties</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSave}>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  maxLength={120}
                  onChange={e => setName(e.target.value)}
                  placeholder="Map name"
                  value={name}
                />
              </div>
              <Button
                disabled={updateMutation.isPending || !hasChanges}
                type="submit"
              >
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Map Properties</CardTitle>
            <CardDescription>Read-only structural properties</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Kind</dt>
                <dd>
                  <Badge variant="secondary">{map.kind}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd>
                  {finite ? (
                    <>
                      {map.extent.widthTiles}&times;{map.extent.heightTiles}{' '}
                      tiles
                    </>
                  ) : (
                    'Infinite'
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Size</dt>
                <dd>
                  {finite ? (
                    <>
                      {map.extent.widthMeters}&times;{map.extent.heightMeters}{' '}
                      meters
                    </>
                  ) : (
                    'Infinite'
                  )}
                </dd>
              </div>
              {map.generator && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Generator</dt>
                  <dd>
                    <Badge variant="secondary">{map.generator}</Badge>
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Seed</dt>
                <dd className="max-w-[200px] truncate font-mono text-xs">
                  {map.seed}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Meters/Tile</dt>
                <dd>{map.resolution.metersPerTile}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Chunk Size</dt>
                <dd>{map.resolution.chunkSizeTiles} tiles</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(map.createdAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{new Date(map.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {map.export && (
        <Card>
          <CardHeader>
            <CardTitle>Export Snapshot</CardTitle>
            <CardDescription>
              Read-only source linkage for this exported slice
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Source Map</dt>
                <dd className="font-mono text-xs">{map.export.sourceMapId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Source Revision</dt>
                <dd>{map.export.sourceRevision}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Exported</dt>
                <dd>{new Date(map.export.exportedAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Source Bounds</dt>
                <dd className="font-mono text-xs">
                  {map.export.bounds.minX},{map.export.bounds.minZ} →{' '}
                  {map.export.bounds.maxX},{map.export.bounds.maxZ}
                </dd>
              </div>
              {map.export.staticEntities && (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Static Entities</dt>
                    <dd>{map.export.staticEntities.entityCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">
                      Referenced Archetypes
                    </dt>
                    <dd>{map.export.staticEntities.archetypeCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Manifest Hash</dt>
                    <dd className="max-w-[260px] break-all font-mono text-xs">
                      {map.export.staticEntities.fullManifestHash}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {map.kind === 'infinite-vector' && (
        <Card>
          <CardHeader>
            <CardTitle>Exports</CardTitle>
            <CardDescription>
              Immutable finite slices created from this authored world
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {exportsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading exports...
              </div>
            ) : (exportsQuery.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">
                No exports yet
              </div>
            ) : (
              <div className="space-y-3">
                {exportsQuery.data?.map(exportedMap => (
                  <div
                    className="flex items-center justify-between rounded-md border p-3"
                    key={exportedMap.id}
                  >
                    <div>
                      <Link
                        className="font-medium hover:underline"
                        params={{ id: exportedMap.id }}
                        to="/maps/$id"
                      >
                        {exportedMap.name ?? 'Unnamed Export'}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {exportedMap.kind} · revision{' '}
                        {exportedMap.export?.sourceRevision ?? 0}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {exportedMap.export
                        ? new Date(
                            exportedMap.export.exportedAt
                          ).toLocaleDateString()
                        : 'Export'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog onOpenChange={setShowDelete} open={showDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Map</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{map.name ?? 'this map'}</strong>? This will permanently
              remove the map and all its chunks. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowDelete(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              variant="destructive"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setShowRegenerate} open={showRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Map</DialogTitle>
            <DialogDescription>
              Are you sure you want to regenerate{' '}
              <strong>{map.name ?? 'this map'}</strong>? This will wipe all
              existing map data for this map, including tile overrides and
              static entities, and clear cached/generated chunks. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="regenerate-seed">Seed</Label>
              <Input
                id="regenerate-seed"
                maxLength={120}
                onChange={e => setRegenerateSeed(e.target.value)}
                value={regenerateSeed}
              />
              <p className="text-xs text-muted-foreground">
                Current seed: <span className="font-mono">{map.seed}</span>
              </p>
            </div>
            {map.generator === 'island-clusters' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="regenerate-density-bias">
                    Density Bias
                  </Label>
                  <Input
                    id="regenerate-density-bias"
                    max={1.5}
                    min={-0.5}
                    onChange={e => setRegenerateIslandDensityBias(e.target.value)}
                    step="0.05"
                    type="number"
                    value={regenerateIslandDensityBias}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regenerate-radius-scale">Radius Scale</Label>
                  <Input
                    id="regenerate-radius-scale"
                    max={2.5}
                    min={0.5}
                    onChange={e => setRegenerateIslandRadiusScale(e.target.value)}
                    step="0.05"
                    type="number"
                    value={regenerateIslandRadiusScale}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regenerate-major-count">
                    Major Clusters
                  </Label>
                  <Input
                    id="regenerate-major-count"
                    max={8}
                    min={1}
                    onChange={e =>
                      setRegenerateIslandMajorAttractorCount(e.target.value)
                    }
                    step="1"
                    type="number"
                    value={regenerateIslandMajorAttractorCount}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regenerate-medium-count">
                    Medium Clusters
                  </Label>
                  <Input
                    id="regenerate-medium-count"
                    max={16}
                    min={0}
                    onChange={e =>
                      setRegenerateIslandMediumAttractorCount(e.target.value)
                    }
                    step="1"
                    type="number"
                    value={regenerateIslandMediumAttractorCount}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowRegenerate(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                regenerateMutation.isPending ||
                !regenerateSeedValid ||
                (map.generator === 'island-clusters' &&
                  !regenerateIslandParamsValid)
              }
              onClick={() => regenerateMutation.mutate()}
              variant="destructive"
            >
              {regenerateMutation.isPending
                ? 'Regenerating...'
                : 'Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setShowExport} open={showExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Export Slice</DialogTitle>
            <DialogDescription>
              Create an immutable finite snapshot from the current authored
              world revision.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="export-name">Name (optional)</Label>
              <Input
                id="export-name"
                maxLength={120}
                onChange={e => setExportName(e.target.value)}
                placeholder="North sector slice"
                value={exportName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-kind">Output Kind</Label>
              <Select
                id="export-kind"
                onChange={e => setExportKind(e.target.value as MapExportKind)}
                value={exportKind}
              >
                <option value="finite-vector-slice">Finite Vector Slice</option>
                <option value="wrapped-classic-slice">
                  Wrapped Classic Slice
                </option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="min-x">Min X</Label>
                <Input
                  id="min-x"
                  onChange={e => setMinX(e.target.value)}
                  value={minX}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-x">Max X</Label>
                <Input
                  id="max-x"
                  onChange={e => setMaxX(e.target.value)}
                  value={maxX}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-z">Min Z</Label>
                <Input
                  id="min-z"
                  onChange={e => setMinZ(e.target.value)}
                  value={minZ}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-z">Max Z</Label>
                <Input
                  id="max-z"
                  onChange={e => setMaxZ(e.target.value)}
                  value={maxZ}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="meters-per-tile">Meters / Tile</Label>
                <Input
                  id="meters-per-tile"
                  onChange={e => setMetersPerTile(e.target.value)}
                  value={metersPerTile}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chunk-size-tiles">Chunk Size Tiles</Label>
                <Input
                  id="chunk-size-tiles"
                  onChange={e => setChunkSizeTiles(e.target.value)}
                  value={chunkSizeTiles}
                />
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated tiles</span>
                <span>
                  {exportStats
                    ? `${exportStats.widthTiles} × ${exportStats.heightTiles}`
                    : '—'}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Estimated chunks</span>
                <span>{exportStats?.chunkCount ?? '—'}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">
                  Estimated height storage
                </span>
                <span>{formatBytes(exportStats?.heightBytes ?? null)}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">
                  Estimated binary wire
                </span>
                <span>{formatBytes(exportStats?.binaryBytes ?? null)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowExport(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={exportMutation.isPending || !exportDimensionsValid}
              onClick={() => exportMutation.mutate()}
            >
              {exportMutation.isPending ? 'Exporting...' : 'Create Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
