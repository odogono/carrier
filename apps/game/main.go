package main

import (
	"flag"
	"log/slog"
	"os"
	"strings"

	"carrier/game/internal/server"
)

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func envBoolOr(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func main() {
	port := flag.Int("port", 6030, "server listen port")
	apiBaseURL := flag.String(
		"api-base-url",
		envOr("GAME_API_BASE_URL", "http://localhost:6021"),
		"API base URL used to load exported map content",
	)
	exportMapID := flag.String(
		"export-map-id",
		os.Getenv("GAME_EXPORT_MAP_ID"),
		"exported map ID to load at startup",
	)
	scriptDir := flag.String(
		"script-dir",
		envOr("GAME_SCRIPT_DIR", "./scripts"),
		"directory containing repo-owned Lua scripts",
	)
	scriptConfigPath := flag.String(
		"script-config",
		envOr("GAME_SCRIPT_CONFIG", "./scripts/triggers.json"),
		"JSON trigger config path keyed by exported map id",
	)
	scriptStatePath := flag.String(
		"script-state",
		envOr("GAME_SCRIPT_STATE", "./script-state.json"),
		"JSON state snapshot path for scripted trigger state",
	)
	scriptDevMode := flag.Bool(
		"script-dev",
		envBoolOr("GAME_SCRIPT_DEV", false),
		"enable dev-time script reload checks",
	)
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	srv, err := server.New(logger, server.Config{
		Port:             *port,
		APIBaseURL:       *apiBaseURL,
		ExportMapID:      *exportMapID,
		ScriptConfigPath: *scriptConfigPath,
		ScriptDevMode:    *scriptDevMode,
		ScriptDir:        *scriptDir,
		ScriptStatePath:  *scriptStatePath,
	})
	if err != nil {
		logger.Error("server initialization failed", "error", err)
		os.Exit(1)
	}

	if err := srv.Run(); err != nil {
		logger.Error("server exited", "error", err)
		os.Exit(1)
	}
}
