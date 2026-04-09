FROM golang:1.26-alpine AS builder

WORKDIR /src/apps/game

COPY apps/game/go.mod apps/game/go.sum ./

RUN go mod download

COPY apps/game ./

RUN go build -o /out/game-server .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /out/game-server /usr/local/bin/game-server
COPY --from=builder /src/apps/game/scripts ./scripts

EXPOSE 6030

CMD ["game-server"]
