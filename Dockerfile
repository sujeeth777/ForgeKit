# ForgeKit — self-hostable container
# Build:  docker build -t forgekit .
# Run:    docker run -p 3000:3000 forgekit

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime (non-root) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 forgekit \
  && adduser --system --uid 1001 forgekit

COPY --from=builder /app/public ./public
COPY --from=builder --chown=forgekit:forgekit /app/.next/standalone ./
COPY --from=builder --chown=forgekit:forgekit /app/.next/static ./.next/static

USER forgekit
EXPOSE 3000

CMD ["node", "server.js"]
