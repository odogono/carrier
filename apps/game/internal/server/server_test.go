package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
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

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
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

func TestNewLoadsScriptRuntimeAtStartupWhenConfigured(t *testing.T) {
	t.Parallel()

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
						"manifest": []map[string]any{},
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
				StaticEntities: []map[string]any{},
			})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer api.Close()

	dir := t.TempDir()
	scriptDir := filepath.Join(dir, "scripts")
	if err := os.MkdirAll(scriptDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(scriptDir, "startup.lua"), []byte(`
return {
  on_init = function(ctx)
    ctx:set_state("boot_count", (ctx:get_state("boot_count") or 0) + 1)
  end,
}
`), 0o644); err != nil {
		t.Fatalf("WriteFile(startup.lua) returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(scriptDir, "triggers.json"), []byte(`{
  "maps": {
    "export-1": {
      "triggers": [
        {
          "id": "startup-trigger",
          "script": "startup.lua",
          "volume": { "minX": 0, "minZ": 0, "maxX": 10, "maxZ": 10 }
        }
      ]
    }
  }
}`), 0o644); err != nil {
		t.Fatalf("WriteFile(triggers.json) returned error: %v", err)
	}

	statePath := filepath.Join(dir, "script-state.json")

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv, err := New(logger, Config{
		Port:             6030,
		APIBaseURL:       api.URL,
		ExportMapID:      "export-1",
		HTTPClient:       api.Client(),
		ScriptDir:        scriptDir,
		ScriptConfigPath: filepath.Join(scriptDir, "triggers.json"),
		ScriptStatePath:  statePath,
	})
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	defer srv.Close()

	bytes, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile(script-state.json) returned error: %v", err)
	}

	var payload struct {
		Maps map[string]map[string]map[string]any `json:"maps"`
	}
	if err := json.Unmarshal(bytes, &payload); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	state := payload.Maps["export-1"]["startup-trigger"]
	if got, want := state["boot_count"], float64(1); got != want {
		t.Fatalf("got boot_count %#v, want %#v", got, want)
	}
}

