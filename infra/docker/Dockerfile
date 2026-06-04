# syntax=docker/dockerfile:1.7
# ============================================================
# Универсальный Dockerfile монорепозитория.
# Собирает и запускает ЛЮБОЕ приложение из apps/* по build-аргументу APP.
#
# Пример сборки (контекст — корень репо):
#   docker build -f infra/docker/Dockerfile --build-arg APP=kpi-report-sales -t kpi-report-sales .
# В docker-compose задаётся через build.args (см. infra/compose/docker-compose.dev.yml).
# Per-app override: создайте infra/docker/<app>/Dockerfile и укажите его в compose/CI.
# ============================================================

FROM node:20-slim AS deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund


FROM node:20-slim AS build
ARG APP
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Собираем конкретное приложение монорепо (webpack -> dist/apps/$APP/main.js)
RUN npx nest build "$APP"


FROM node:20-slim AS runtime
ARG APP
# APP нужен в рантайме, чтобы CMD знал какой main запускать
ENV APP=${APP}
ENV NODE_ENV=production
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app

# только prod-зависимости (webpack оставляет node_modules внешними)
COPY package*.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# артефакты сборки
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma

# shell-форма, чтобы раскрылась переменная $APP
CMD node "dist/apps/$APP/main"
