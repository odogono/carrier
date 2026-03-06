protoc \
  --go_out=../apps/game/internal/protocol \
  --ts_out=./gen/ts \
  proto/game.proto