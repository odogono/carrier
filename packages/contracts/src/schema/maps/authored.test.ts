import { describe, expect, test } from "bun:test";

import {
  ApplyBooleanOutput,
  ApplyBooleanInput,
  ArchetypeCategorySchema,
  ArchetypeSchema,
  ArchiveAssetVersionInput,
  AssetVersionSchema,
  AssetVersionListItemSchema,
  CreateStaticEntityInput,
  CreateStaticEntityOutput,
  CreateMapExportInput,
  CreateControlPointOutput,
  CreateControlPointInput,
  CreateSourcePolygonOutput,
  CreateSourcePolygonInput,
  DeleteStaticEntityOutput,
  DeleteAssetVersionInput,
  DEFAULT_SOURCE_POLYGON_PARAMS,
  GetArchetypeInput,
  hasCompatibleStaticEntityExportManifestHash,
  ListArchetypesInput,
  ListAssetVersionsInput,
  ListReferencedArchetypesInput,
  ListStaticEntitiesOutput,
  MapMetadataSchema,
  MapOverviewSchema,
  MapMetadataSummarySchema,
  StaticEntitySchema,
  StaticEntityExportManifestSchema,
  StaticEntityListItemSchema,
  GetZarchRuntimeEntityInput,
  ListZarchRuntimeEntitiesInput,
  UpsertZarchRuntimeEntityInput,
  ZarchRuntimeEntityKindSchema,
  ZarchRuntimeEntitySchema,
  stringifyStaticEntityExportManifest,
  normalizeSourcePolygonParams,
  UpdateStaticEntityOutput,
  UpdateArchetypeInput,
} from "./index";

describe("authored map schemas", () => {
  test("validates authored write inputs and revision-bearing metadata", () => {
    expect(
      CreateSourcePolygonInput.parse({
        expectedRevision: 0,
        mapId: "map-1",
        params: {
          interiorFill: 1.5,
          maxDisplacementMeters: 12,
          noiseScaleMeters: 64,
          roughness: 0.5,
        },
        vertices: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 },
        ],
      }),
    ).toBeDefined();

    expect(() =>
      CreateSourcePolygonInput.parse({
        expectedRevision: 0,
        mapId: "map-1",
        params: {
          interiorFill: 1.5,
          maxDisplacementMeters: 12,
          noiseScaleMeters: 64,
          roughness: 0.5,
        },
        vertices: [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 10, z: 10 },
        ],
      }),
    ).toThrow();

    expect(
      CreateControlPointInput.parse({
        elevationMeters: 90,
        expectedRevision: 2,
        influenceMeters: 120,
        mapId: "map-1",
        strength: 1,
        type: "peak",
        x: 120,
        z: 40,
      }),
    ).toBeDefined();

    expect(
      ApplyBooleanInput.parse({
        expectedRevision: 3,
        mapId: "map-1",
        operation: "xor",
        polygonIds: ["a", "b"],
      }).operation,
    ).toBe("xor");

    expect(
      MapMetadataSchema.parse({
        createdAt: new Date().toISOString(),
        extent: {
          heightMeters: 640,
          heightTiles: 64,
          kind: "finite",
          widthMeters: 640,
          widthTiles: 64,
          wrapX: false,
          wrapZ: false,
        },
        export: {
          bounds: {
            maxX: 640,
            maxZ: 640,
            minX: 0,
            minZ: 0,
          },
          exportedAt: new Date().toISOString(),
          sourceMapId: "source-1",
          sourceRevision: 2,
        },
        id: "map-1",
        kind: "finite-vector-slice",
        name: "World",
        resolution: {
          chunkSizeTiles: 32,
          metersPerTile: 10,
        },
        revision: 4,
        seed: "seed-1",
        updatedAt: new Date().toISOString(),
      }).revision,
    ).toBe(4);

    expect(
      CreateMapExportInput.parse({
        bounds: {
          maxX: 640,
          maxZ: 640,
          minX: 0,
          minZ: 0,
        },
        chunkSizeTiles: 32,
        expectedRevision: 4,
        kind: "finite-vector-slice",
        mapId: "map-1",
        metersPerTile: 10,
      }).kind,
    ).toBe("finite-vector-slice");
  });

  test("validates overview payloads with nullable bounds", () => {
    expect(
      MapOverviewSchema.parse({
        bounds: null,
        clusters: [],
        counts: {
          controlPoints: 0,
          derivedIslands: 0,
          sourcePolygons: 0,
        },
        mapId: "map-1",
        revision: 0,
      }).bounds,
    ).toBeNull();
  });

  test("normalizes polygon params with the shared default interior fill", () => {
    expect(
      normalizeSourcePolygonParams({
        maxDisplacementMeters: 20,
        noiseScaleMeters: 80,
        roughness: 0.75,
      }),
    ).toEqual({
      ...DEFAULT_SOURCE_POLYGON_PARAMS,
      maxDisplacementMeters: 20,
      noiseScaleMeters: 80,
      roughness: 0.75,
    });

    expect(
      CreateSourcePolygonInput.parse({
        expectedRevision: 0,
        mapId: "map-1",
        params: {
          maxDisplacementMeters: 12,
          noiseScaleMeters: 64,
          roughness: 0.5,
        },
        vertices: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 },
        ],
      }).params,
    ).toEqual(DEFAULT_SOURCE_POLYGON_PARAMS);
  });

  test("validates static entity catalog record shapes", () => {
    const now = new Date().toISOString();

    expect(
      AssetVersionSchema.parse({
        collisionBox: {
          depthMeters: 18,
          heightMeters: 24,
          widthMeters: 20,
        },
        collisionClass: "building-solid",
        createdAt: now,
        diagnostics: ["auto-derived footprint"],
        footprint: {
          depthMeters: 18,
          widthMeters: 20,
        },
        groundingPolicy: "terrain-average-footprint",
        id: "watchtower-v1",
        instancingEligible: false,
        maxHeightDeltaMeters: 2.5,
        originalFile: {
          contentType: "model/gltf-binary",
          path: "uploads/watchtower/source.glb",
          sizeBytes: 1024,
        },
        runtimeFile: {
          contentType: "model/gltf-binary",
          path: "runtime/watchtower/normalized.glb",
          sizeBytes: 2048,
        },
        status: "review",
        updatedAt: now,
      }).status,
    ).toBe("review");

    expect(
      AssetVersionListItemSchema.parse({
        asset: {
          collisionBox: {
            depthMeters: 18,
            heightMeters: 24,
            widthMeters: 20,
          },
          collisionClass: "building-solid",
          createdAt: now,
          diagnostics: ["auto-derived footprint"],
          footprint: {
            depthMeters: 18,
            widthMeters: 20,
          },
          groundingPolicy: "terrain-average-footprint",
          id: "watchtower-v1",
          instancingEligible: false,
          maxHeightDeltaMeters: 2.5,
          originalFile: {
            contentType: "model/gltf-binary",
            path: "uploads/watchtower/source.glb",
            sizeBytes: 1024,
          },
          runtimeFile: {
            contentType: "model/gltf-binary",
            path: "runtime/watchtower/normalized.glb",
            sizeBytes: 2048,
          },
          status: "archived",
          updatedAt: now,
        },
        isDeletable: false,
        runtimeArtifactPresent: true,
        usage: {
          archetypeIds: ["watchtower"],
          runtimeEntityIds: ["zarch-player-ship"],
        },
      }).asset.status,
    ).toBe("archived");

    expect(
      ZarchRuntimeEntitySchema.parse({
        assetVersionId: "zarch-player-ship-v1",
        createdAt: now,
        id: "zarch-player-ship",
        kind: "player-ship",
        name: "Zarch Player Ship",
        renderDimensions: {
          lengthMeters: 18,
        },
        status: "active",
        updatedAt: now,
      }).kind,
    ).toBe("player-ship");

    expect(
      ArchetypeSchema.parse({
        assetVersionId: "watchtower-v1",
        category: "landmark",
        createdAt: now,
        id: "watchtower",
        name: "Watchtower",
        status: "active",
        tags: ["coastal", "defensive"],
        updatedAt: now,
      }).category,
    ).toBe("landmark");

    expect(
      StaticEntitySchema.parse({
        archetypeId: "watchtower",
        createdAt: now,
        id: "watchtower-north",
        label: null,
        mapId: "map-1",
        position: {
          x: 120,
          z: -40,
        },
        rotation: {
          yaw: 90,
        },
        scale: 1,
        state: "active",
        updatedAt: now,
        yOffset: 0.25,
      }).position,
    ).toEqual({
      x: 120,
      z: -40,
    });

    expect(
      UpsertZarchRuntimeEntityInput.parse({
        assetVersionId: "zarch-player-ship-v1",
        id: "zarch-player-ship",
        kind: "player-ship",
        name: "Zarch Player Ship",
        renderDimensions: {
          lengthMeters: 18,
        },
        status: "active",
      }).assetVersionId,
    ).toBe("zarch-player-ship-v1");

    expect(
      CreateStaticEntityInput.parse({
        archetypeId: "watchtower",
        expectedRevision: 4,
        label: null,
        mapId: "map-1",
        position: {
          x: 12,
          z: 24,
        },
        rotation: {
          yaw: 180,
        },
        scale: 1.5,
        state: "active",
        yOffset: 0,
      }).id,
    ).toBeUndefined();

    expect(() => ArchetypeCategorySchema.parse("bridge")).toThrow();
    expect(ZarchRuntimeEntityKindSchema.parse("player-ship")).toBe(
      "player-ship",
    );
    expect(ListAssetVersionsInput.parse({ status: "archived" }).status).toBe(
      "archived",
    );
    expect(ListArchetypesInput.parse({ status: "archived" }).status).toBe(
      "archived",
    );
    expect(
      ListZarchRuntimeEntitiesInput.parse({
        status: "archived",
      }).status,
    ).toBe("archived");
    expect(GetArchetypeInput.parse({ id: "watchtower" }).id).toBe("watchtower");
    expect(
      GetZarchRuntimeEntityInput.parse({ id: "zarch-player-ship" }).id,
    ).toBe("zarch-player-ship");
    expect(ArchiveAssetVersionInput.parse({ id: "watchtower-v1" }).id).toBe(
      "watchtower-v1",
    );
    expect(DeleteAssetVersionInput.parse({ id: "watchtower-v1" }).id).toBe(
      "watchtower-v1",
    );
    expect(
      ListReferencedArchetypesInput.parse({
        mapId: "map-1",
      }).mapId,
    ).toBe("map-1");
    expect(
      UpdateArchetypeInput.parse({
        category: "building",
        id: "watchtower",
        name: "Watchtower Mk II",
        status: "deprecated",
        tags: ["legacy"],
      }).status,
    ).toBe("deprecated");
    expect(() =>
      StaticEntitySchema.parse({
        archetypeId: "watchtower",
        createdAt: now,
        id: "bad-entity",
        label: "Bad entity",
        mapId: "map-1",
        position: {
          x: 0,
          z: 0,
        },
        rotation: {
          yaw: 0,
        },
        scale: 0,
        state: "active",
        updatedAt: now,
        yOffset: 0,
      }),
    ).toThrow();

    const listItem = StaticEntityListItemSchema.parse({
      archetype: {
        assetVersionId: "watchtower-v1",
        category: "landmark",
        id: "watchtower",
        name: "Watchtower",
        status: "active",
      },
      entity: {
        archetypeId: "watchtower",
        createdAt: now,
        id: "watchtower-1",
        label: null,
        mapId: "map-1",
        position: {
          x: 10,
          z: 20,
        },
        rotation: {
          yaw: 45,
        },
        scale: 1,
        state: "active",
        updatedAt: now,
        yOffset: 0,
      },
    });

    expect(listItem.archetype.assetVersionId).toBe("watchtower-v1");
    expect(ListStaticEntitiesOutput.parse([listItem])[0]?.entity.id).toBe(
      "watchtower-1",
    );
    expect(
      CreateStaticEntityOutput.parse({
        entity: listItem.entity,
        mapRevision: 5,
      }).mapRevision,
    ).toBe(5);
    expect(
      UpdateStaticEntityOutput.parse({
        entity: listItem.entity,
        mapRevision: 6,
      }).mapRevision,
    ).toBe(6);
    expect(
      DeleteStaticEntityOutput.parse({
        entity: listItem.entity,
        mapRevision: 7,
      }).mapRevision,
    ).toBe(7);
  });

  test("validates static-entity export manifests and summary/detail map metadata", () => {
    const now = new Date().toISOString();
    const manifest = StaticEntityExportManifestSchema.parse([
      {
        archetype: {
          assetVersionId: "watchtower-v1",
          category: "landmark",
          id: "watchtower",
          name: "Watchtower",
          status: "active",
          tags: ["stone", "coastal"],
        },
        assetVersion: {
          collisionBox: {
            depthMeters: 18,
            heightMeters: 24,
            widthMeters: 20,
          },
          collisionClass: "building-solid",
          footprint: {
            depthMeters: 18,
            widthMeters: 20,
          },
          groundingPolicy: "terrain-average-footprint",
          id: "watchtower-v1",
          instancingEligible: true,
          maxHeightDeltaMeters: 1.5,
          runtimeFile: {
            contentType: "model/gltf-binary",
            path: "runtime/watchtower/normalized.glb",
            sizeBytes: 2048,
          },
        },
      },
    ]);
    const fullManifestHash =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    expect(
      MapMetadataSchema.parse({
        createdAt: now,
        extent: {
          heightMeters: 640,
          heightTiles: 64,
          kind: "finite",
          widthMeters: 640,
          widthTiles: 64,
          wrapX: false,
          wrapZ: false,
        },
        export: {
          bounds: {
            maxX: 640,
            maxZ: 640,
            minX: 0,
            minZ: 0,
          },
          exportedAt: now,
          sourceMapId: "source-1",
          sourceRevision: 2,
          staticEntities: {
            archetypeCount: 1,
            entityCount: 3,
            fullManifestHash,
            manifest,
          },
        },
        id: "map-1",
        kind: "finite-vector-slice",
        name: "World",
        resolution: {
          chunkSizeTiles: 32,
          metersPerTile: 10,
        },
        revision: 4,
        seed: "seed-1",
        updatedAt: now,
      }).export?.staticEntities?.manifest,
    ).toEqual(manifest);

    expect(
      MapMetadataSummarySchema.parse({
        createdAt: now,
        extent: {
          heightMeters: 640,
          heightTiles: 64,
          kind: "finite",
          widthMeters: 640,
          widthTiles: 64,
          wrapX: false,
          wrapZ: false,
        },
        export: {
          bounds: {
            maxX: 640,
            maxZ: 640,
            minX: 0,
            minZ: 0,
          },
          exportedAt: now,
          sourceMapId: "source-1",
          sourceRevision: 2,
          staticEntities: {
            archetypeCount: 1,
            entityCount: 3,
            fullManifestHash,
          },
        },
        id: "map-1",
        kind: "finite-vector-slice",
        name: "World",
        resolution: {
          chunkSizeTiles: 32,
          metersPerTile: 10,
        },
        revision: 4,
        seed: "seed-1",
        updatedAt: now,
      }).export?.staticEntities?.fullManifestHash,
    ).toBe(fullManifestHash);

    const canonicalJson = stringifyStaticEntityExportManifest([
      {
        archetype: {
          assetVersionId: "watchtower-v1",
          category: "landmark",
          id: "watchtower",
          name: "Watchtower",
          status: "active",
          tags: ["stone", "coastal"],
        },
        assetVersion: {
          collisionBox: {
            depthMeters: 18,
            heightMeters: 24,
            widthMeters: 20,
          },
          collisionClass: "building-solid",
          footprint: {
            depthMeters: 18,
            widthMeters: 20,
          },
          groundingPolicy: "terrain-average-footprint",
          id: "watchtower-v1",
          instancingEligible: true,
          maxHeightDeltaMeters: 1.5,
          runtimeFile: {
            contentType: "model/gltf-binary",
            path: "runtime/watchtower/normalized.glb",
            sizeBytes: 2048,
          },
        },
      },
    ]);

    expect(canonicalJson).toContain('"tags":["coastal","stone"]');
    expect(
      hasCompatibleStaticEntityExportManifestHash(
        fullManifestHash,
        fullManifestHash,
      ),
    ).toBe(true);
    expect(
      hasCompatibleStaticEntityExportManifestHash(
        fullManifestHash,
        fullManifestHash.replace(/f$/, "e"),
      ),
    ).toBe(false);
  });

  test("validates terrain mutation outputs with dirty bounds", () => {
    const dirtyBounds = {
      maxX: 100,
      maxZ: 120,
      minX: -40,
      minZ: -60,
    };

    expect(
      CreateSourcePolygonOutput.parse({
        dirtyBounds,
        mapRevision: 1,
        polygon: {
          bbox: dirtyBounds,
          createdAt: new Date().toISOString(),
          id: "polygon-1",
          mapId: "map-1",
          params: {
            interiorFill: 1.5,
            maxDisplacementMeters: 12,
            noiseScaleMeters: 64,
            roughness: 0.5,
          },
          retiredAt: null,
          status: "active",
          updatedAt: new Date().toISOString(),
          vertices: [
            { x: -40, z: -60 },
            { x: 100, z: -60 },
            { x: 100, z: 120 },
          ],
        },
      }).dirtyBounds,
    ).toEqual(dirtyBounds);

    expect(
      CreateControlPointOutput.parse({
        controlPoint: {
          createdAt: new Date().toISOString(),
          elevationMeters: 42,
          id: "control-1",
          influenceMeters: 80,
          mapId: "map-1",
          strength: 1,
          type: "plain",
          updatedAt: new Date().toISOString(),
          x: 12,
          z: -8,
        },
        dirtyBounds,
        mapRevision: 2,
      }).dirtyBounds,
    ).toEqual(dirtyBounds);

    expect(
      ApplyBooleanOutput.parse({
        createdPolygons: [],
        dirtyBounds,
        mapRevision: 3,
        retiredPolygonIds: ["polygon-1"],
      }).dirtyBounds,
    ).toEqual(dirtyBounds);
  });
});
