FROM oven/bun:1.3.10

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

WORKDIR /app/apps/admin

EXPOSE 5179

CMD ["bun", "--env-file=dev.defaults.env", "./dev-server.ts"]
