import { type FormEvent, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { client } from '@/lib/api-client';

export function CreateMapPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [widthTiles, setWidthTiles] = useState('128');
  const [heightTiles, setHeightTiles] = useState('128');
  const [generator, setGenerator] = useState<'diamond-square' | 'island-clusters'>('diamond-square');
  const [seed, setSeed] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      client.maps.create({
        generator,
        heightTiles: Number(heightTiles),
        name: name.trim() || undefined,
        seed: seed.trim() || undefined,
        widthTiles: Number(widthTiles)
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map created');
      void navigate({ to: '/maps' });
    },
    onError: () => {
      toast.error('Failed to create map');
    }
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Create Map</h2>
        <p className="text-muted-foreground">Generate a new map</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Map Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Map"
                maxLength={120}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="widthTiles">Width (tiles)</Label>
                <Input
                  id="widthTiles"
                  type="number"
                  value={widthTiles}
                  onChange={e => setWidthTiles(e.target.value)}
                  min={1}
                  max={4096}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heightTiles">Height (tiles)</Label>
                <Input
                  id="heightTiles"
                  type="number"
                  value={heightTiles}
                  onChange={e => setHeightTiles(e.target.value)}
                  min={1}
                  max={4096}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="generator">Generator</Label>
              <Select
                id="generator"
                value={generator}
                onChange={e =>
                  setGenerator(
                    e.target.value as 'diamond-square' | 'island-clusters'
                  )
                }
              >
                <option value="diamond-square">Diamond Square</option>
                <option value="island-clusters">Island Clusters</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <Input
                id="seed"
                value={seed}
                onChange={e => setSeed(e.target.value)}
                placeholder="Random if left empty"
                maxLength={120}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Map'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: '/maps' })}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
