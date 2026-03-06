package hub

import (
	"log/slog"

	"carrier/game/internal/conn"
	pb "carrier/game/internal/pb"
)

type Hub struct {
	conns      map[*conn.Conn]struct{}
	register   chan *conn.Conn
	unregister chan *conn.Conn
	broadcast  chan *pb.Envelope
	logger     *slog.Logger
}

func New(logger *slog.Logger) *Hub {
	return &Hub{
		conns:      make(map[*conn.Conn]struct{}),
		register:   make(chan *conn.Conn),
		unregister: make(chan *conn.Conn),
		broadcast:  make(chan *pb.Envelope, 256),
		logger:     logger,
	}
}

func (h *Hub) Register(c *conn.Conn) {
	h.register <- c
}

func (h *Hub) Unregister(c *conn.Conn) {
	h.unregister <- c
}

func (h *Hub) Broadcast(env *pb.Envelope) {
	h.broadcast <- env
}

func (h *Hub) PlayerCount() int {
	return len(h.conns)
}

// Run processes hub events. Call as a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.conns[c] = struct{}{}
			h.logger.Info("player registered", "player", c.PlayerID(), "total", len(h.conns))

		case c := <-h.unregister:
			if _, ok := h.conns[c]; ok {
				delete(h.conns, c)
				c.Close()
				h.logger.Info("player unregistered", "player", c.PlayerID(), "total", len(h.conns))

				// Broadcast leave notice
				if c.PlayerID() != "" {
					h.Broadcast(&pb.Envelope{
						Payload: &pb.Envelope_LeaveNotice{
							LeaveNotice: &pb.LeaveNotice{
								PlayerId: c.PlayerID(),
							},
						},
					})
				}
			}

		case env := <-h.broadcast:
			for c := range h.conns {
				if err := c.Send(env); err != nil {
					h.logger.Debug("broadcast send failed", "player", c.PlayerID(), "error", err)
				}
			}
		}
	}
}
