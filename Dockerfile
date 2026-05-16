# Crusade Commander — full-stack image
# Builds the React/Vite frontend and the Node/TypeScript backend, then
# packages them into a single container. The Express server serves the
# API at /api/* and the built frontend for everything else.
#
# Build:  docker compose build
# Run:    docker compose up

### Stage 1: build the web app ###
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

### Stage 2: build the API server ###
FROM node:20-alpine AS server
WORKDIR /server
# bcrypt needs build tools
RUN apk add --no-cache python3 make g++
COPY backend/package*.json backend/tsconfig.json ./
RUN npm ci
COPY backend/src ./src
RUN npm run build
RUN npm prune --production

### Stage 3: runtime ###
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache tini

# API + node_modules
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/dist ./dist
COPY --from=server /server/package.json ./

# Built frontend → /app/web (served by Express in production)
COPY --from=web /web/dist ./web

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/web

# Non-root user
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# Run schema migration on each start (idempotent), then boot.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
