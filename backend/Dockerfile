# Backend image. Built on the server by `docker compose up -d --build`.
# The build context is this folder (backend/), so only backend files are copied.
FROM node:20-alpine AS deps

RUN apk update && apk upgrade --no-cache

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app

# Pick up patched OS packages (e.g. openssl fixes) available in Alpine's repo


RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The container only ever runs `node server.js`, never `npm`, so remove npm's own
# bundled dependency tree (and its known CVEs) from the image.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

USER appuser

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
