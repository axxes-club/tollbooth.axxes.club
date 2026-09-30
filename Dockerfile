# AXXES Next.js image for Cloud Run (standalone output, glibc for sharp/Prisma).
# Build-time env (NEXT_PUBLIC_* etc.) comes from .env.production, written by
# Cloud Build from Secret Manager; it never reaches the final image.
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN if [ -f package-lock.json ]; then npm ci || npm install --no-audit --no-fund; \
    else corepack enable && pnpm install --frozen-lockfile; fi
RUN mkdir -p public && if [ -d prisma ]; then npx prisma generate; fi
RUN if [ -f package-lock.json ]; then npm run build; else pnpm run build; fi

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN rm -f .env .env.* && mkdir -p .next/cache && chown -R node:node .next
USER node
EXPOSE 8080
# Runtime secrets: Cloud Run mounts the app's Secret Manager dotenv at /secrets/env.
CMD ["sh", "-c", "if [ -f /secrets/env ]; then exec node --env-file=/secrets/env --env-file=/database/env server.js; else exec node server.js; fi"]
