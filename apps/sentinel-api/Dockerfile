# ── Build from monorepo root (Railway: set root directory to repo root) ────────
FROM node:22-alpine

# Native deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/sentinel-api/package*.json ./apps/sentinel-api/

# Install all workspace deps (resolves @sentinel/shared symlink)
RUN npm install

# Copy source
COPY packages/shared ./packages/shared
COPY apps/sentinel-api ./apps/sentinel-api

# Data dir for SQLite volume mount
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/sentinel.db
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=apps/sentinel-api"]
