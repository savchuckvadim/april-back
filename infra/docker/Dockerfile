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

# --- Манифест зависимостей (18.11.2026) ---
# package.json, урезанный до списков зависимостей. Слои `npm ci` ниже зависят
# только от него и от package-lock.json, а не от всего package.json: правка
# скриптов или настроек jest (строка moduleNameMapper для новой библиотеки)
# больше не пересобирает слой node_modules всех 12 приложений. 17.11.2026
# одна такая строка заставила сервер скачать ~1,5 ГБ и растянула выкладку
# до часа. Кэш COPY в BuildKit считается по содержимому файла, поэтому пока
# зависимости те же — слой берётся из кэша, а сервер его не качает.
FROM node:20-slim AS manifest
WORKDIR /app
COPY package.json ./
RUN node -e "const p=require('./package.json');const keep=['name','version','private','dependencies','devDependencies','optionalDependencies','peerDependencies','overrides','engines'];const out={};for(const k of keep)if(p[k]!==undefined)out[k]=p[k];require('fs').writeFileSync('package.deps.json',JSON.stringify(out,null,2)+'\n')"


FROM node:20-slim AS deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=manifest /app/package.deps.json ./package.json
COPY package-lock.json .npmrc ./
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

# только prod-зависимости (webpack оставляет node_modules внешними);
# ставятся по манифесту зависимостей — см. стадию manifest
COPY --from=manifest /app/package.deps.json ./package.json
COPY package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund
# полный package.json — как было до 18.11.2026 (маленький слой поверх)
COPY package.json ./package.json

# артефакты сборки
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma

# shell-форма, чтобы раскрылась переменная $APP
CMD node "dist/apps/$APP/main"
