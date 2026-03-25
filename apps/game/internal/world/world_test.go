package world

import (
	"math"
	"testing"
)

func TestResolveStaticEntityGeometryParity(t *testing.T) {
	terrain := &TerrainSet{
		Chunks: []*TerrainChunk{
			testTerrainChunk(0, 0, 4, 4, []float64{
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
			}),
		},
	}

	manifest := testManifestEntry("watchtower", "watchtower-v1", 20, 10, 12, 8, 10, 1.5)

	testCases := []struct {
		name     string
		yaw      float64
		corner0  Vector2
		aabbMinX float64
		aabbMinZ float64
		aabbMaxX float64
		aabbMaxZ float64
	}{
		{
			name:     "yaw 0",
			yaw:      0,
			corner0:  Vector2{X: 10, Z: 15},
			aabbMinX: 10,
			aabbMinZ: 15,
			aabbMaxX: 30,
			aabbMaxZ: 25,
		},
		{
			name:     "yaw 45",
			yaw:      45,
			corner0:  Vector2{X: 16.464466094067262, Z: 9.393398282201787},
			aabbMinX: 9.393398282201787,
			aabbMinZ: 9.393398282201787,
			aabbMaxX: 30.606601717798213,
			aabbMaxZ: 30.606601717798213,
		},
		{
			name:     "yaw 90",
			yaw:      90,
			corner0:  Vector2{X: 25, Z: 10},
			aabbMinX: 15,
			aabbMinZ: 10,
			aabbMaxX: 25,
			aabbMaxZ: 30,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			resolved, err := resolveStaticEntity(
				"export-1",
				testPlacement("tower", "watchtower", 20, 20, testCase.yaw, 1, "active"),
				manifest,
				terrain,
			)
			if err != nil {
				t.Fatalf("resolveStaticEntity returned error: %v", err)
			}

			assertAlmostEqual(t, resolved.FootprintCorners[0].X, testCase.corner0.X)
			assertAlmostEqual(t, resolved.FootprintCorners[0].Z, testCase.corner0.Z)
			assertAlmostEqual(t, resolved.FootprintAABB.MinX, testCase.aabbMinX)
			assertAlmostEqual(t, resolved.FootprintAABB.MinZ, testCase.aabbMinZ)
			assertAlmostEqual(t, resolved.FootprintAABB.MaxX, testCase.aabbMaxX)
			assertAlmostEqual(t, resolved.FootprintAABB.MaxZ, testCase.aabbMaxZ)
		})
	}
}

func TestResolveStaticEntityScalesCollisionBoxAndGrounding(t *testing.T) {
	terrain := &TerrainSet{
		Chunks: []*TerrainChunk{
			testTerrainChunk(0, 0, 4, 4, []float64{
				2, 2, 2, 2, 2,
				2, 2, 2, 2, 2,
				2, 2, 2, 2, 2,
				2, 2, 2, 2, 2,
				2, 2, 2, 2, 2,
			}),
		},
	}
	manifest := testManifestEntry("factory", "factory-v2", 8, 6, 10, 12, 14, 1)

	resolved, err := resolveStaticEntity(
		"export-1",
		testPlacement("factory-1", "factory", 20, 20, 0, 1.5, "active"),
		manifest,
		terrain,
	)
	if err != nil {
		t.Fatalf("resolveStaticEntity returned error: %v", err)
	}

	assertAlmostEqual(t, resolved.FootprintWidthMeters, 12)
	assertAlmostEqual(t, resolved.FootprintDepthMeters, 9)
	assertAlmostEqual(t, resolved.CollisionWidthMeters, 15)
	assertAlmostEqual(t, resolved.CollisionDepthMeters, 18)
	assertAlmostEqual(t, resolved.CollisionHeightMeters, 21)
	assertAlmostEqual(t, resolved.EffectiveY, 2)
	assertAlmostEqual(t, resolved.CollisionOBB.Center.Y, 12.5)
	assertAlmostEqual(t, resolved.CollisionOBB.HalfWidthMeters, 7.5)
	assertAlmostEqual(t, resolved.CollisionOBB.HalfDepthMeters, 9)
	assertAlmostEqual(t, resolved.CollisionOBB.HalfHeightMeters, 10.5)
}

func TestComputeGroundingAcrossChunkBoundary(t *testing.T) {
	terrain := &TerrainSet{
		Chunks: []*TerrainChunk{
			testTerrainChunk(0, 0, 2, 2, []float64{
				2, 2, 2,
				2, 2, 2,
				2, 2, 2,
			}),
			testTerrainChunk(2, 0, 2, 2, []float64{
				4, 4, 4,
				4, 4, 4,
				4, 4, 4,
			}),
		},
	}

	result, ok := computeGrounding(terrain, 18, 10, 8, 8, 0, 3, 1)
	if !ok {
		t.Fatalf("computeGrounding returned missing terrain")
	}

	assertAlmostEqual(t, result.AverageHeight, 3.8)
	assertAlmostEqual(t, result.MaxHeightDelta, 2)
	if !result.Valid {
		t.Fatalf("expected grounding to be valid")
	}
}

func TestComputeGroundingFailsWhenTerrainSampleIsMissing(t *testing.T) {
	terrain := &TerrainSet{
		Chunks: []*TerrainChunk{
			testTerrainChunk(0, 0, 2, 2, []float64{
				2, 2, 2,
				2, 2, 2,
				2, 2, 2,
			}),
		},
	}

	if _, ok := computeGrounding(terrain, 18, 10, 8, 8, 0, 3, 0); ok {
		t.Fatalf("expected missing neighboring terrain sample to fail grounding")
	}
}

func TestSpatialQueriesReturnActiveObstacleCandidates(t *testing.T) {
	terrain := &TerrainSet{
		Chunks: []*TerrainChunk{
			testTerrainChunk(0, 0, 4, 4, []float64{
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
				0, 0, 0, 0, 0,
			}),
		},
	}
	manifest := testManifestEntry("watchtower", "watchtower-v1", 8, 8, 8, 8, 8, 1)

	activeA, err := resolveStaticEntity(
		"export-1",
		testPlacement("active-a", "watchtower", 10, 10, 0, 1, "active"),
		manifest,
		terrain,
	)
	if err != nil {
		t.Fatalf("resolve active-a: %v", err)
	}
	activeB, err := resolveStaticEntity(
		"export-1",
		testPlacement("active-b", "watchtower", 30, 10, 45, 1, "active"),
		manifest,
		terrain,
	)
	if err != nil {
		t.Fatalf("resolve active-b: %v", err)
	}
	disabled, err := resolveStaticEntity(
		"export-1",
		testPlacement("disabled", "watchtower", 10, 30, 0, 1, "disabled"),
		manifest,
		terrain,
	)
	if err != nil {
		t.Fatalf("resolve disabled: %v", err)
	}

	index := NewSpatialIndex(16)
	index.Insert(activeA)
	index.Insert(activeB)

	world := &World{
		Map:      ExportedMap{ID: "export-1"},
		Terrain:  terrain,
		Entities: []*ResolvedStaticEntity{activeA, activeB, disabled},
		index:    index,
	}

	radiusResults := world.QueryStaticObstaclesInRadius(10, 10, 6)
	if len(radiusResults) != 1 || radiusResults[0].ID != "active-a" {
		t.Fatalf("unexpected radius results: %#v", idsOf(radiusResults))
	}

	aabbResults := world.QueryStaticObstaclesInAABB(20, 0, 40, 20)
	if len(aabbResults) != 1 || aabbResults[0].ID != "active-b" {
		t.Fatalf("unexpected AABB results: %#v", idsOf(aabbResults))
	}

	disabledResults := world.QueryStaticObstaclesInAABB(0, 20, 20, 40)
	if len(disabledResults) != 0 {
		t.Fatalf("expected disabled entity to be excluded, got %#v", idsOf(disabledResults))
	}
}

func testTerrainChunk(originTileX, originTileZ, tileWidth, tileHeight int, heights []float64) *TerrainChunk {
	return &TerrainChunk{
		ChunkX:        originTileX / 2,
		ChunkZ:        originTileZ / 2,
		MapID:         "export-1",
		OriginTileX:   originTileX,
		OriginTileZ:   originTileZ,
		SamplesHigh:   tileHeight + 1,
		SamplesWide:   tileWidth + 1,
		TileHeight:    tileHeight,
		TileWidth:     tileWidth,
		SampleSpacing: 10,
		Heights:       heights,
		Bounds: AxisAlignedBox2D{
			MinX: float64(originTileX) * 10,
			MinZ: float64(originTileZ) * 10,
			MaxX: float64(originTileX+tileWidth) * 10,
			MaxZ: float64(originTileZ+tileHeight) * 10,
		},
	}
}

func testManifestEntry(archetypeID, assetVersionID string, footprintWidth, footprintDepth, collisionWidth, collisionDepth, collisionHeight, maxHeightDelta float64) manifestEntryRecord {
	return manifestEntryRecord{
		Archetype: manifestArchetypeRecord{
			ID:             archetypeID,
			AssetVersionID: assetVersionID,
		},
		AssetVersion: manifestAssetVersionRecord{
			ID:             assetVersionID,
			CollisionClass: "building-solid",
			CollisionBox: dimensions3Record{
				WidthMeters:  collisionWidth,
				DepthMeters:  collisionDepth,
				HeightMeters: collisionHeight,
			},
			Footprint: dimensions2Record{
				WidthMeters: footprintWidth,
				DepthMeters: footprintDepth,
			},
			MaxHeightDeltaMeters: maxHeightDelta,
		},
	}
}

func testPlacement(id, archetypeID string, x, z, yaw, scale float64, state string) staticEntityPlacementRecord {
	var placement staticEntityPlacementRecord
	placement.ID = id
	placement.MapID = "export-1"
	placement.ArchetypeID = archetypeID
	placement.Position.X = x
	placement.Position.Z = z
	placement.Rotation.Yaw = yaw
	placement.Scale = scale
	placement.State = state
	return placement
}

func assertAlmostEqual(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-6 {
		t.Fatalf("got %.12f, want %.12f", got, want)
	}
}

func idsOf(entities []*ResolvedStaticEntity) []string {
	ids := make([]string, 0, len(entities))
	for _, entity := range entities {
		ids = append(ids, entity.ID)
	}
	return ids
}
