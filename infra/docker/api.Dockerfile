FROM oven/bun:1.3.10

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/client/package.json apps/client/
COPY packages/contracts/package.json packages/contracts/
COPY packages/preview/package.json packages/preview/

RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

EXPOSE 6021

CMD ["bun", "run", "--cwd", "apps/api", "start"]
