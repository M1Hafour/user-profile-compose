
# Backend dependencies
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Production image
FROM node:20-alpine

# Apply security updates to the FINAL image
RUN apk update && apk upgrade --no-cache

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove npm and npx from the production image
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

USER appuser

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

