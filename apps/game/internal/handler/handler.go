package handler

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"time"

	"carrier/game/internal/conn"
	"carrier/game/internal/hub"
	pb "carrier/game/internal/pb"
)

type PlayerInputObserver interface {
	UpdateActorPosition(actorID string, x, z float64)
}

type Handler struct {
	hub           *hub.Hub
	logger        *slog.Logger
	inputObserver PlayerInputObserver
}

func New(h *hub.Hub, logger *slog.Logger, observer PlayerInputObserver) *Handler {
	return &Handler{
		hub:           h,
		logger:        logger,
		inputObserver: observer,
	}
}

func (h *Handler) HandleMessage(c *conn.Conn, env *pb.Envelope) {
	switch p := env.Payload.(type) {
	case *pb.Envelope_JoinRequest:
		h.handleJoin(c, env.Seq, p.JoinRequest)
	case *pb.Envelope_PlayerInput:
		h.handlePlayerInput(c, p.PlayerInput)
	case *pb.Envelope_Ping:
		h.handlePing(c, env.Seq, p.Ping)
	default:
		h.logger.Warn("unknown message type", "player", c.PlayerID())
	}
}

func (h *Handler) handleJoin(c *conn.Conn, seq uint64, req *pb.JoinRequest) {
	playerID := generateID()
	c.SetPlayerID(playerID)

	h.logger.Info("player joined", "player", playerID, "name", req.PlayerName)

	c.Send(&pb.Envelope{
		Seq: seq,
		Payload: &pb.Envelope_JoinResponse{
			JoinResponse: &pb.JoinResponse{
				PlayerId:   playerID,
				TickRate:   20,
				ServerTime: time.Now().UnixMilli(),
			},
		},
	})
}

func (h *Handler) handlePlayerInput(c *conn.Conn, input *pb.PlayerInput) {
	if h.inputObserver == nil || c.PlayerID() == "" {
		return
	}

	h.inputObserver.UpdateActorPosition(
		c.PlayerID(),
		float64(input.CamX),
		float64(input.CamZ),
	)
}

func (h *Handler) handlePing(c *conn.Conn, seq uint64, ping *pb.Ping) {
	c.Send(&pb.Envelope{
		Seq: seq,
		Payload: &pb.Envelope_Pong{
			Pong: &pb.Pong{
				ClientTime: ping.ClientTime,
				ServerTime: time.Now().UnixMilli(),
			},
		},
	})
}

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
