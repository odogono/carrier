package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"carrier/game/internal/conn"
	"carrier/game/internal/handler"
	"carrier/game/internal/hub"
	"carrier/game/internal/world"
)

type Config struct {
	Port        int
	APIBaseURL  string
	ExportMapID string
	HTTPClient  *http.Client
}

type Server struct {
	hub     *hub.Hub
	handler *handler.Handler
	logger  *slog.Logger
	port    int
	world   *world.World
}

func New(logger *slog.Logger, config Config) (*Server, error) {
	h := hub.New(logger)
	loadCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	loadedWorld, err := world.LoadExportedWorld(loadCtx, world.LoaderConfig{
		APIBaseURL:  config.APIBaseURL,
		ExportMapID: config.ExportMapID,
		HTTPClient:  config.HTTPClient,
	})
	if err != nil {
		return nil, fmt.Errorf("load exported world: %w", err)
	}

	logger.Info(
		"loaded static world",
		"map", loadedWorld.Map.ID,
		"entities", len(loadedWorld.Entities),
		"active_obstacles", loadedWorld.ActiveObstacleCount(),
	)

	return &Server{
		hub:     h,
		handler: handler.New(h, logger),
		logger:  logger,
		port:    config.Port,
		world:   loadedWorld,
	}, nil
}

func (s *Server) Run() error {
	go s.hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", s.handleWebSocket)
	mux.HandleFunc("GET /health", s.handleHealth)

	addr := fmt.Sprintf(":%d", s.port)
	s.logger.Info("game server starting", "addr", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) StaticWorld() *world.World {
	if s == nil {
		return nil
	}

	return s.world
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"localhost:*", "127.0.0.1:*"},
	})
	if err != nil {
		s.logger.Error("websocket accept failed", "error", err)
		return
	}

	c := conn.New(r.Context(), ws, s.logger)
	s.hub.Register(c)

	go c.WritePump()

	defer s.hub.Unregister(c)

	for {
		env, err := c.ReadMessage()
		if err != nil {
			s.logger.Debug("read error", "player", c.PlayerID(), "error", err)
			return
		}
		s.handler.HandleMessage(c, env)
	}
}
