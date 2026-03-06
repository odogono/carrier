set dotenv-load := true


# Place help first so `just` runs it by default
help:
    @echo "Available commands:"


dev:
  bun run --cwd apps/api dev &
  bun run --cwd apps/client dev