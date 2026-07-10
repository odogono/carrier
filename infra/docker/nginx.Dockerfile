FROM oven/bun:1.3.10 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/client/package.json apps/client/
COPY packages/contracts/package.json packages/contracts/
COPY packages/preview/package.json packages/preview/
COPY packages/terrain-edit/package.json packages/terrain-edit/

RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

RUN bun run --cwd packages/contracts build
RUN API_URL=/api bun run --cwd apps/client build
RUN API_URL=/api BASE_PATH=/admin bun run --cwd apps/admin build

FROM nginx:1.27-alpine

COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html/client
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html/admin

EXPOSE 80
