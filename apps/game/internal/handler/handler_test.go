package handler

import (
	"io"
	"log/slog"
	"testing"

	"carrier/game/internal/conn"
	pb "carrier/game/internal/pb"
)

func TestHandlePlayerInputForwardsActorPositionToObserver(t *testing.T) {
	t.Parallel()

	observer := &recordingPlayerInputObserver{}
	handler := New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), observer)

	connection := &conn.Conn{}
	connection.SetPlayerID("player-1")

	handler.handlePlayerInput(connection, &pb.PlayerInput{
		CamX: 12.5,
		CamZ: -7.25,
	})

	if observer.actorID != "player-1" {
		t.Fatalf("got actorID %q, want %q", observer.actorID, "player-1")
	}
	if observer.x != 12.5 {
		t.Fatalf("got x %v, want %v", observer.x, 12.5)
	}
	if observer.z != -7.25 {
		t.Fatalf("got z %v, want %v", observer.z, -7.25)
	}
}

type recordingPlayerInputObserver struct {
	actorID string
	x       float64
	z       float64
}

func (o *recordingPlayerInputObserver) UpdateActorPosition(actorID string, x, z float64) {
	o.actorID = actorID
	o.x = x
	o.z = z
}
