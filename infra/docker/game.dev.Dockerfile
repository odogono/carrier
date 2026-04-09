FROM golang:1.26-alpine

WORKDIR /app/apps/game

COPY apps/game/go.mod apps/game/go.sum ./

RUN go mod download

EXPOSE 6030

CMD ["go", "run", "."]
