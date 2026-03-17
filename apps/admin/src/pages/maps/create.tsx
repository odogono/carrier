import { type FormEvent, useState } from "react";

import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  MAP_METERS_PER_TILE,
  type MapKind,
} from "carrier-contracts/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { client } from "@/lib/api-client";

export function CreateMapPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<MapKind>("wrapped-classic");
  const [name, setName] = useState("");
  const [widthMeters, setWidthMeters] = useState("1280");
  const [heightMeters, setHeightMeters] = useState("1280");
  const [generator, setGenerator] = useState<
    "diamond-square" | "island-clusters"
  >("diamond-square");
  const [seed, setSeed] = useState("");

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

  const createMutation = useMutation({
    mutationFn: () => {
      if (kind === "infinite-vector") {
        return client.maps.create({
          kind: "infinite-vector",
          name: name.trim() || undefined,
          seed: seed.trim() || undefined,
        });
      }
      return client.maps.create({
        kind: "wrapped-classic",
        generator,
        heightMeters: Number(heightMeters),
        name: name.trim() || undefined,
        seed: seed.trim() || undefined,
        widthMeters: Number(widthMeters),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maps"] });
      toast.success("Map created");
      void navigate({ to: "/maps" });
    },
    onError: () => {
      toast.error("Failed to create map");
    },
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
              <Label htmlFor="kind">Map Kind</Label>
              <Select
                id="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as MapKind)}
              >
                <option value="wrapped-classic">Wrapped Classic</option>
                <option value="infinite-vector">Infinite Vector</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Map"
                maxLength={120}
              />
            </div>

            {kind === "wrapped-classic" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="widthMeters">Width (meters)</Label>
                    <Input
                      id="widthMeters"
                      type="number"
                      value={widthMeters}
                      onChange={(e) => setWidthMeters(e.target.value)}
                      min={MAP_METERS_PER_TILE}
                      max={4096 * MAP_METERS_PER_TILE}
                      step={MAP_METERS_PER_TILE}
                      required
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
                      type="number"
                      value={heightMeters}
                      onChange={(e) => setHeightMeters(e.target.value)}
                      min={MAP_METERS_PER_TILE}
                      max={4096 * MAP_METERS_PER_TILE}
                      step={MAP_METERS_PER_TILE}
                      required
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
                    value={generator}
                    onChange={(e) =>
                      setGenerator(
                        e.target.value as "diamond-square" | "island-clusters",
                      )
                    }
                  >
                    <option value="diamond-square">Diamond Square</option>
                    <option value="island-clusters">Island Clusters</option>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <Input
                id="seed"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Random if left empty"
                maxLength={120}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  (kind === "wrapped-classic" && !wrappedClassicDimensionsValid)
                }
              >
                {createMutation.isPending ? "Creating..." : "Create Map"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: "/maps" })}
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
