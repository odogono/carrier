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
	"carrier/game/internal/script"
	"carrier/game/internal/world"
)

type Config struct {
	Port             int
	APIBaseURL       string
	ExportMapID      string
	HTTPClient       *http.Client
	ScriptConfigPath string
	ScriptDevMode    bool
	ScriptDir        string
	ScriptStatePath  string
}

type Server struct {
	hub           *hub.Hub
	handler       *handler.Handler
	logger        *slog.Logger
	port          int
	scriptRuntime *script.Runtime
	world         *world.World
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

	var scriptRuntime *script.Runtime
	var inputObserver handler.PlayerInputObserver
	if config.ScriptDir != "" || config.ScriptConfigPath != "" || config.ScriptStatePath != "" {
		scriptRuntime, err = script.New(script.RuntimeOptions{
			Logger:     logger,
			MapID:      loadedWorld.Map.ID,
			ScriptDir:  config.ScriptDir,
			ConfigPath: config.ScriptConfigPath,
			StatePath:  config.ScriptStatePath,
			DevMode:    config.ScriptDevMode,
		})
		if err != nil {
			return nil, fmt.Errorf("load script runtime: %w", err)
		}
		inputObserver = scriptRuntime
	}

	return &Server{
		hub:           h,
		handler:       handler.New(h, logger, inputObserver),
		logger:        logger,
		port:          config.Port,
		scriptRuntime: scriptRuntime,
		world:         loadedWorld,
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

func (s *Server) Close() error {
	if s == nil || s.scriptRuntime == nil {
		return nil
	}

	return s.scriptRuntime.Close()
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

	defer func() {
		if s.scriptRuntime != nil {
			if playerID := c.PlayerID(); playerID != "" {
				s.scriptRuntime.RemoveActor(playerID)
			}
		}
		s.hub.Unregister(c)
	}()

	for {
		env, err := c.ReadMessage()
		if err != nil {
			s.logger.Debug("read error", "player", c.PlayerID(), "error", err)
			return
		}
		s.handler.HandleMessage(c, env)
	}
}
