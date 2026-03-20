import { isFiniteMap } from 'carrier-contracts/types';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { client } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

export function MapsListPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const mapsQuery = useQuery({
    queryFn: () => client.maps.list({}),
    queryKey: ['maps']
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.maps.delete({ id }),
    onError: () => {
      toast.error('Failed to delete map');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map deleted');
      setDeleteId(null);
    }
  });

  const maps = mapsQuery.data ?? [];
  const mapToDelete = maps.find(m => m.id === deleteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Maps</h2>
          <p className="text-muted-foreground">Manage maps in the system</p>
        </div>
        <Link to="/maps/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Map
          </Button>
        </Link>
      </div>

      {mapsQuery.isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : maps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">No maps yet</p>
          <Link className="mt-4" to="/maps/new">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create your first map
            </Button>
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Dimensions</TableHead>
              <TableHead>Generator</TableHead>
              <TableHead>Seed / Source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {maps.map(map => (
              <TableRow key={map.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    params={{ id: map.id }}
                    to="/maps/$id"
                  >
                    {map.name ?? (
                      <span className="text-muted-foreground italic">
                        Unnamed
                      </span>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{map.kind}</Badge>
                    {map.export && (
                      <Badge variant="secondary">
                        src rev {map.export.sourceRevision}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {isFiniteMap(map) ? (
                    <>
                      {map.extent.widthTiles}&times;{map.extent.heightTiles}
                    </>
                  ) : (
                    'Infinite'
                  )}
                </TableCell>
                <TableCell>
                  {map.generator ? (
                    <Badge variant="secondary">{map.generator}</Badge>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-mono text-xs">
                  {map.export ? map.export.sourceMapId : map.seed}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(map.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(map.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Link params={{ id: map.id }} to="/maps/$id">
                      <Button size="icon" title="View details" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      onClick={() => setDeleteId(map.id)}
                      size="icon"
                      title="Delete"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4 text-destructive-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        onOpenChange={open => !open && setDeleteId(null)}
        open={!!deleteId}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Map</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{mapToDelete?.name ?? 'this map'}</strong>? This will
              permanently remove the map and all its chunks. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteId(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              variant="destructive"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
