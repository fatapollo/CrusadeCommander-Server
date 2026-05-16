### Builder stage ###
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for bcrypt native module
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Trim devDependencies after build
RUN npm prune --production

### Runtime stage ###
FROM node:20-alpine

WORKDIR /app

# Install runtime deps for bcrypt
RUN apk add --no-cache tini

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Create non-root user
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
