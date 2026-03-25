package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"carrier/game/internal/worldtest"
)

func TestNewLoadsExportedWorldAtStartup(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/maps/exports/export-1":
			writer.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"id":   "export-1",
				"kind": "finite-vector-slice",
				"extent": map[string]any{
					"kind":         "finite",
					"widthMeters":  20,
					"heightMeters": 20,
					"widthTiles":   2,
					"heightTiles":  2,
					"wrapX":        false,
					"wrapZ":        false,
				},
				"resolution": map[string]any{
					"metersPerTile":  10,
					"chunkSizeTiles": 2,
				},
				"export": map[string]any{
					"bounds": map[string]any{
						"minX": 0,
						"minZ": 0,
						"maxX": 20,
						"maxZ": 20,
					},
					"exportedAt":     "2026-03-25T00:00:00.000Z",
					"sourceMapId":    "source-1",
					"sourceRevision": 1,
					"staticEntities": map[string]any{
						"manifest": []map[string]any{
							{
								"archetype": map[string]any{
									"id":             "watchtower",
									"assetVersionId": "watchtower-v1",
								},
								"assetVersion": map[string]any{
									"id":             "watchtower-v1",
									"collisionClass": "building-solid",
									"collisionBox": map[string]any{
										"widthMeters":  8,
										"depthMeters":  8,
										"heightMeters": 12,
									},
									"footprint": map[string]any{
										"widthMeters": 8,
										"depthMeters": 8,
									},
									"maxHeightDeltaMeters": 1,
								},
							},
						},
					},
				},
			})
		case "/api/maps/export-1/chunks/0/0/binary":
			worldtest.WriteMultipartChunk(t, writer, worldtest.ChunkFields{
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
				StaticEntities: []map[string]any{
					{
						"id":          "watchtower-1",
						"mapId":       "export-1",
						"label":       nil,
						"archetypeId": "watchtower",
						"position": map[string]any{
							"x": 10,
							"z": 10,
						},
						"rotation": map[string]any{
							"yaw": 0,
						},
						"scale":   1,
						"state":   "active",
						"yOffset": 0,
					},
				},
			})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer api.Close()

	logger := slog.New(slog.NewTextHandler(ioDiscard{}, nil))
	srv, err := New(logger, Config{
		Port:        6030,
		APIBaseURL:  api.URL,
		ExportMapID: "export-1",
		HTTPClient:  api.Client(),
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	if srv.StaticWorld() == nil {
		t.Fatalf("expected static world to be loaded")
	}
	if got, want := srv.StaticWorld().ActiveObstacleCount(), 1; got != want {
		t.Fatalf("got %d active obstacles, want %d", got, want)
	}
}

func TestNewFailsFastWhenExportMetadataCannotBeLoaded(t *testing.T) {
	api := httptest.NewServer(http.NotFoundHandler())
	defer api.Close()

	logger := slog.New(slog.NewTextHandler(ioDiscard{}, nil))
	_, err := New(logger, Config{
		Port:        6030,
		APIBaseURL:  api.URL,
		ExportMapID: "missing-export",
		HTTPClient:  api.Client(),
	})
	if err == nil {
		t.Fatalf("expected startup to fail")
	}
}

type ioDiscard struct{}

func (ioDiscard) Write(bytes []byte) (int, error) {
	return len(bytes), nil
}
