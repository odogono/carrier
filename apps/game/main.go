package main

import (
	"flag"
	"log/slog"
	"os"

	"carrier/game/internal/server"
)

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
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
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	srv, err := server.New(logger, server.Config{
		Port:        *port,
		APIBaseURL:  *apiBaseURL,
		ExportMapID: *exportMapID,
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
