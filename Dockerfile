FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 MODEL_CACHE_DIR=/app/model-cache WIKI_DB_PATH=/app/data/my_wiki.db OMP_NUM_THREADS=2
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /app/data /app/model-cache && chown -R node:node /app
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src/lib/db.worker.js ./src/lib/db.worker.js
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs
USER node
EXPOSE 3000
CMD ["npm","start","--","--hostname","0.0.0.0"]
