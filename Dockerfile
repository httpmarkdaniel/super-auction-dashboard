# Cloud Run container for the API only — the dashboard frontend (src/,
# public/, dist/) is served separately by Firebase Hosting and is
# deliberately NOT part of this image. This just runs server/index.js,
# which imports and mounts the existing api/*.js handlers unmodified.
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY api ./api
COPY server ./server

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/index.js"]
