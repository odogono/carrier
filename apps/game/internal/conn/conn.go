package conn

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"

	pb "carrier/game/internal/pb"
)

const sendBufSize = 64

type Conn struct {
	ws       *websocket.Conn
	send     chan []byte
	logger   *slog.Logger
	ctx      context.Context
	cancel   context.CancelFunc
	closed   sync.Once
	playerID string
	mu       sync.RWMutex
}

func New(ctx context.Context, ws *websocket.Conn, logger *slog.Logger) *Conn {
	ctx, cancel := context.WithCancel(ctx)
	return &Conn{
		ws:     ws,
		send:   make(chan []byte, sendBufSize),
		logger: logger,
		ctx:    ctx,
		cancel: cancel,
	}
}

func (c *Conn) PlayerID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.playerID
}

func (c *Conn) SetPlayerID(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.playerID = id
}

func (c *Conn) Context() context.Context {
	return c.ctx
}

// ReadMessage reads and decodes a protobuf Envelope from the WebSocket.
func (c *Conn) ReadMessage() (*pb.Envelope, error) {
	typ, data, err := c.ws.Read(c.ctx)
	if err != nil {
		return nil, fmt.Errorf("ws read: %w", err)
	}
	if typ != websocket.MessageBinary {
		return nil, fmt.Errorf("expected binary message, got %v", typ)
	}
	env := &pb.Envelope{}
	if err := proto.Unmarshal(data, env); err != nil {
		return nil, fmt.Errorf("proto unmarshal: %w", err)
	}
	return env, nil
}

// Send enqueues an Envelope to be written by the write pump.
func (c *Conn) Send(env *pb.Envelope) error {
	data, err := proto.Marshal(env)
	if err != nil {
		return fmt.Errorf("proto marshal: %w", err)
	}
	select {
	case c.send <- data:
		return nil
	default:
		return fmt.Errorf("send buffer full")
	}
}

// WritePump drains the send channel and writes to the WebSocket.
// Run this as a goroutine.
func (c *Conn) WritePump() {
	defer c.Close()
	for {
		select {
		case <-c.ctx.Done():
			return
		case data, ok := <-c.send:
			if !ok {
				return
			}
			if err := c.ws.Write(c.ctx, websocket.MessageBinary, data); err != nil {
				c.logger.Debug("write error", "player", c.PlayerID(), "error", err)
				return
			}
		}
	}
}

func (c *Conn) Close() {
	c.closed.Do(func() {
		c.cancel()
		c.ws.Close(websocket.StatusNormalClosure, "")
	})
}
