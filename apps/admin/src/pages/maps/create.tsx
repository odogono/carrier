import {
  DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS,
  MAP_METERS_PER_TILE
} from 'carrier-contracts/types';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { client } from '@/lib/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

export function CreateMapPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<'wrapped-classic' | 'infinite-vector'>(
    'wrapped-classic'
  );
  const [name, setName] = useState('');
  const [widthMeters, setWidthMeters] = useState('1280');
  const [heightMeters, setHeightMeters] = useState('1280');
  const [generator, setGenerator] = useState<
    'diamond-square' | 'island-clusters'
  >('diamond-square');
  const [islandDensityBias, setIslandDensityBias] = useState(
    String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.densityBias)
  );
  const [islandMajorAttractorCount, setIslandMajorAttractorCount] = useState(
    String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.majorAttractorCount)
  );
  const [islandMediumAttractorCount, setIslandMediumAttractorCount] =
    useState(String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.mediumAttractorCount));
  const [islandRadiusScale, setIslandRadiusScale] = useState(
    String(DEFAULT_ISLAND_CLUSTER_GENERATOR_PARAMS.radiusScale)
  );
  const [seed, setSeed] = useState('');

  const parseDerivedTiles = (value: string) => {
    const meters = Number(value);

    if (
      !Number.isFinite(meters) ||
      !Number.isInteger(meters) ||
      meters < MAP_METERS_PER_TILE ||
      meters % MAP_METERS_PER_TILE !== 0
    ) {
      return null;
    }

    return meters / MAP_METERS_PER_TILE;
  };

  const derivedWidthTiles = parseDerivedTiles(widthMeters);
  const derivedHeightTiles = parseDerivedTiles(heightMeters);
  const wrappedClassicDimensionsValid =
    derivedWidthTiles !== null && derivedHeightTiles !== null;
  const islandParamsValid =
    Number.isFinite(Number(islandDensityBias)) &&
    Number.isFinite(Number(islandMajorAttractorCount)) &&
    Number.isInteger(Number(islandMajorAttractorCount)) &&
    Number.isFinite(Number(islandMediumAttractorCount)) &&
    Number.isInteger(Number(islandMediumAttractorCount)) &&
    Number.isFinite(Number(islandRadiusScale));

  const createMutation = useMutation({
    mutationFn: () => {
      if (kind === 'infinite-vector') {
        return client.maps.create({
          kind: 'infinite-vector',
          name: name.trim() || undefined,
          seed: seed.trim() || undefined
        });
      }
      return client.maps.create({
        generatorParams:
          generator === 'island-clusters'
            ? {
                densityBias: Number(islandDensityBias),
                majorAttractorCount: Number(islandMajorAttractorCount),
                mediumAttractorCount: Number(islandMediumAttractorCount),
                radiusScale: Number(islandRadiusScale)
              }
            : undefined,
        generator,
        heightMeters: Number(heightMeters),
        kind: 'wrapped-classic',
        name: name.trim() || undefined,
        seed: seed.trim() || undefined,
        widthMeters: Number(widthMeters)
      });
    },
    onError: () => {
      toast.error('Failed to create map');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Map created');
      void navigate({ to: '/maps' });
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
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="kind">Map Kind</Label>
              <Select
                id="kind"
                onChange={e =>
                  setKind(
                    e.target.value as 'wrapped-classic' | 'infinite-vector'
                  )
                }
                value={kind}
              >
                <option value="wrapped-classic">Wrapped Classic</option>
                <option value="infinite-vector">Infinite Vector</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                maxLength={120}
                onChange={e => setName(e.target.value)}
                placeholder="My Map"
                value={name}
              />
            </div>

            {kind === 'wrapped-classic' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="widthMeters">Width (meters)</Label>
                    <Input
                      id="widthMeters"
                      max={4096 * MAP_METERS_PER_TILE}
                      min={MAP_METERS_PER_TILE}
                      onChange={e => setWidthMeters(e.target.value)}
                      required
                      step={MAP_METERS_PER_TILE}
                      type="number"
                      value={widthMeters}
                    />
                    <p className="text-xs text-muted-foreground">
                      {derivedWidthTiles === null
                        ? `Use a whole-number multiple of ${MAP_METERS_PER_TILE}m`
                        : `${derivedWidthTiles} tiles at ${MAP_METERS_PER_TILE}m/tile`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="heightMeters">Height (meters)</Label>
                    <Input
                      id="heightMeters"
                      max={4096 * MAP_METERS_PER_TILE}
                      min={MAP_METERS_PER_TILE}
                      onChange={e => setHeightMeters(e.target.value)}
                      required
                      step={MAP_METERS_PER_TILE}
                      type="number"
                      value={heightMeters}
                    />
                    <p className="text-xs text-muted-foreground">
                      {derivedHeightTiles === null
                        ? `Use a whole-number multiple of ${MAP_METERS_PER_TILE}m`
                        : `${derivedHeightTiles} tiles at ${MAP_METERS_PER_TILE}m/tile`}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="generator">Generator</Label>
                  <Select
                    id="generator"
                    onChange={e =>
                      setGenerator(
                        e.target.value as 'diamond-square' | 'island-clusters'
                      )
                    }
                    value={generator}
                  >
                    <option value="diamond-square">Diamond Square</option>
                    <option value="island-clusters">Island Clusters</option>
                  </Select>
                </div>

                {generator === 'island-clusters' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="island-density-bias">Density Bias</Label>
                      <Input
                        id="island-density-bias"
                        max={1.5}
                        min={-0.5}
                        onChange={e => setIslandDensityBias(e.target.value)}
                        step="0.05"
                        type="number"
                        value={islandDensityBias}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="island-radius-scale">Radius Scale</Label>
                      <Input
                        id="island-radius-scale"
                        max={2.5}
                        min={0.5}
                        onChange={e => setIslandRadiusScale(e.target.value)}
                        step="0.05"
                        type="number"
                        value={islandRadiusScale}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="major-attractor-count">
                        Major Clusters
                      </Label>
                      <Input
                        id="major-attractor-count"
                        max={8}
                        min={1}
                        onChange={e =>
                          setIslandMajorAttractorCount(e.target.value)
                        }
                        step="1"
                        type="number"
                        value={islandMajorAttractorCount}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="medium-attractor-count">
                        Medium Clusters
                      </Label>
                      <Input
                        id="medium-attractor-count"
                        max={16}
                        min={0}
                        onChange={e =>
                          setIslandMediumAttractorCount(e.target.value)
                        }
                        step="1"
                        type="number"
                        value={islandMediumAttractorCount}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <Input
                id="seed"
                maxLength={120}
                onChange={e => setSeed(e.target.value)}
                placeholder="Random if left empty"
                value={seed}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                disabled={
                  createMutation.isPending ||
                  (kind === 'wrapped-classic' &&
                    (!wrappedClassicDimensionsValid ||
                      (generator === 'island-clusters' && !islandParamsValid)))
                }
                type="submit"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Map'}
              </Button>
              <Button
                onClick={() => void navigate({ to: '/maps' })}
                type="button"
                variant="outline"
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
