package world

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"carrier/game/internal/worldtest"
)

func TestLoadExportedWorldResolvesManifestAndDeduplicatesChunkPlacements(t *testing.T) {
	metadata := mapMetadataRecord{
		ID:   "export-1",
		Kind: "finite-vector-slice",
		Extent: mapExtentRecord{
			Kind:         "finite",
			WidthMeters:  40,
			HeightMeters: 20,
			WidthTiles:   4,
			HeightTiles:  2,
			WrapX:        false,
			WrapZ:        false,
		},
		Resolution: resolutionRecord{
			MetersPerTile:  10,
			ChunkSizeTiles: 2,
		},
		Export: &mapExportRecord{
			Bounds: boundsRecord{
				MinX: 100,
				MinZ: 200,
				MaxX: 140,
				MaxZ: 220,
			},
			ExportedAt:     "2026-03-25T00:00:00.000Z",
			SourceMapID:    "source-1",
			SourceRevision: 7,
			StaticEntities: &mapExportStaticEntitiesRecord{
				Manifest: []manifestEntryRecord{
					testManifestEntry("watchtower", "watchtower-v1", 8, 8, 8, 8, 10, 1),
				},
			},
		},
	}

	chunks := map[string]worldtest.ChunkFields{
		"0:0": {
			ChunkX:         0,
			ChunkZ:         0,
			MapID:          "export-1",
			OriginTileX:    0,
			OriginTileZ:    0,
			SamplesHigh:    3,
			SamplesWide:    3,
			TileHeight:     2,
			TileWidth:      2,
			HeightEncoding: "uint16",
			HeightMin:      0,
			HeightStep:     1,
			HeightBytes:    worldtest.EncodeUint16Heights([]uint16{0, 0, 0, 0, 0, 0, 0, 0, 0}),
			StaticEntities: []staticEntityPlacementRecord{
				testPlacement("watchtower-center", "watchtower", 10, 10, 0, 1, "active"),
				testPlacement("watchtower-edge", "watchtower", 19, 10, 45, 1, "active"),
				testPlacement("watchtower-disabled", "watchtower", 5, 5, 0, 1, "disabled"),
			},
		},
		"1:0": {
			ChunkX:         1,
			ChunkZ:         0,
			MapID:          "export-1",
			OriginTileX:    2,
			OriginTileZ:    0,
			SamplesHigh:    3,
			SamplesWide:    3,
			TileHeight:     2,
			TileWidth:      2,
			HeightEncoding: "uint16",
			HeightMin:      0,
			HeightStep:     1,
			HeightBytes:    worldtest.EncodeUint16Heights([]uint16{0, 0, 0, 0, 0, 0, 0, 0, 0}),
			StaticEntities: []staticEntityPlacementRecord{
				testPlacement("watchtower-edge", "watchtower", 19, 10, 45, 1, "active"),
			},
		},
	}

	server := testExportServer(t, metadata, chunks)
	defer server.Close()

	world, err := LoadExportedWorld(context.Background(), LoaderConfig{
		APIBaseURL:  server.URL,
		ExportMapID: "export-1",
		HTTPClient:  server.Client(),
	})
	if err != nil {
		t.Fatalf("LoadExportedWorld returned error: %v", err)
	}

	if got, want := len(world.Entities), 3; got != want {
		t.Fatalf("got %d entities, want %d", got, want)
	}
	if got, want := world.ActiveObstacleCount(), 2; got != want {
		t.Fatalf("got %d active obstacles, want %d", got, want)
	}
	if got := idsOf(world.QueryStaticObstaclesInAABB(0, 0, 12, 12)); strings.Join(got, ",") != "watchtower-center" {
		t.Fatalf("unexpected center query results: %#v", got)
	}
	if got := idsOf(world.QueryStaticObstaclesInAABB(0, 0, 10, 10)); strings.Contains(strings.Join(got, ","), "watchtower-disabled") {
		t.Fatalf("disabled entity unexpectedly indexed: %#v", got)
	}
	entitiesByID := make(map[string]*ResolvedStaticEntity, len(world.Entities))
	for _, entity := range world.Entities {
		entitiesByID[entity.ID] = entity
	}
	if entitiesByID["watchtower-edge"] == nil || entitiesByID["watchtower-edge"].AssetVersionID != "watchtower-v1" {
		t.Fatalf("unexpected resolved edge entity: %#v", entitiesByID["watchtower-edge"])
	}
}

func TestLoadExportedWorldFailsWhenChunkReferencesMissingManifestArchetype(t *testing.T) {
	metadata := mapMetadataRecord{
		ID:   "export-1",
		Kind: "finite-vector-slice",
		Extent: mapExtentRecord{
			Kind:         "finite",
			WidthMeters:  20,
			HeightMeters: 20,
			WidthTiles:   2,
			HeightTiles:  2,
		},
		Resolution: resolutionRecord{
			MetersPerTile:  10,
			ChunkSizeTiles: 2,
		},
		Export: &mapExportRecord{
			Bounds:         boundsRecord{MinX: 0, MinZ: 0, MaxX: 20, MaxZ: 20},
			ExportedAt:     "2026-03-25T00:00:00.000Z",
			SourceMapID:    "source-1",
			SourceRevision: 1,
			StaticEntities: &mapExportStaticEntitiesRecord{Manifest: nil},
		},
	}
	chunks := map[string]worldtest.ChunkFields{
		"0:0": {
			ChunkX:         0,
			ChunkZ:         0,
			MapID:          "export-1",
			OriginTileX:    0,
			OriginTileZ:    0,
			SamplesHigh:    3,
			SamplesWide:    3,
			TileHeight:     2,
			TileWidth:      2,
			HeightEncoding: "uint16",
			HeightMin:      0,
			HeightStep:     1,
			HeightBytes:    worldtest.EncodeUint16Heights([]uint16{0, 0, 0, 0, 0, 0, 0, 0, 0}),
			StaticEntities: []staticEntityPlacementRecord{
				testPlacement("orphan", "missing", 10, 10, 0, 1, "active"),
			},
		},
	}

	server := testExportServer(t, metadata, chunks)
	defer server.Close()

	_, err := LoadExportedWorld(context.Background(), LoaderConfig{
		APIBaseURL:  server.URL,
		ExportMapID: "export-1",
		HTTPClient:  server.Client(),
	})
	if err == nil || !strings.Contains(err.Error(), "missing from export manifest") {
		t.Fatalf("expected missing manifest error, got %v", err)
	}
}

func testExportServer(t *testing.T, metadata mapMetadataRecord, chunks map[string]worldtest.ChunkFields) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/maps/exports/" + metadata.ID:
			writer.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(writer).Encode(metadata); err != nil {
				t.Fatalf("encode metadata: %v", err)
			}
		default:
			if strings.HasPrefix(request.URL.Path, "/api/maps/"+metadata.ID+"/chunks/") && strings.HasSuffix(request.URL.Path, "/binary") {
				key := chunkKeyFromPath(request.URL.Path)
				chunk, ok := chunks[key]
				if !ok {
					http.NotFound(writer, request)
					return
				}
				worldtest.WriteMultipartChunk(t, writer, chunk)
				return
			}

			http.NotFound(writer, request)
		}
	}))
}

func chunkKeyFromPath(value string) string {
	trimmed := strings.TrimSuffix(strings.TrimPrefix(value, "/api/maps/export-1/chunks/"), "/binary")
	parts := strings.Split(trimmed, "/")
	if len(parts) != 2 {
		return ""
	}

	return parts[0] + ":" + parts[1]
}
