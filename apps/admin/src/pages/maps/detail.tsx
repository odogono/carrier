import { type FormEvent, useEffect, useState } from 'react';

import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { isFiniteMap } from 'carrier-contracts/types';

import { MapViewer } from '@/components/map-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/api-client';

export function MapDetailPage() {
  const { id } = useParams({ from: '/maps/$id' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);
  const [name, setName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);

  const mapQuery = useQuery({
    queryFn: () => client.maps.find({ id }),
    queryKey: ['maps', id],
  });

  const map = mapQuery.data;

  useEffect(() => {
    if (map && !nameLoaded) {
      setName(map.name ?? '');
      setNameLoaded(true);
    }
  }, [map, nameLoaded]);

  const updateMutation = useMutation({
    mutationFn: () =>
      client.maps.update({
        id,
        name: name.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map updated');
    },
    onError: () => {
      toast.error('Failed to update map');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => client.maps.delete({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map deleted');
      void navigate({ to: '/maps' });
    },
    onError: () => {
      toast.error('Failed to delete map');
    },
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
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
  const finite = isFiniteMap(map);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/maps">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-3xl font-bold tracking-tight">
            {map.name ?? 'Unnamed Map'}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">{map.id}</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDelete(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
        {map.kind === 'infinite-vector' && (
          <Link to="/maps/$id/editor" params={{ id }}>
            <Button size="sm" variant="outline">
              Open Editor
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Map Preview</CardTitle>
          <CardDescription>Drag to pan, scroll to zoom</CardDescription>
        </CardHeader>
        <CardContent>
          <MapViewer mapId={id} map={map} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Edit Properties</CardTitle>
            <CardDescription>Update editable map properties</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Map name"
                  maxLength={120}
                />
              </div>
              <Button
                type="submit"
                disabled={updateMutation.isPending || !hasChanges}>
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
                  {finite
                    ? <>{map.extent.widthTiles}&times;{map.extent.heightTiles} tiles</>
                    : 'Infinite'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Size</dt>
                <dd>
                  {finite
                    ? <>{map.extent.widthMeters}&times;{map.extent.heightMeters} meters</>
                    : 'Infinite'}
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

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
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
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
