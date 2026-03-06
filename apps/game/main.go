package main

import (
	"flag"
	"log/slog"
	"os"

	"carrier/game/internal/server"
)

func main() {
	port := flag.Int("port", 6030, "server listen port")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	srv := server.New(logger, *port)
	if err := srv.Run(); err != nil {
		logger.Error("server exited", "error", err)
		os.Exit(1)
	}
}
