# infra/ — Docker и развёртывание монорепо

Здесь собрано всё, что касается контейнеризации и деплоя приложений монорепо.

```
infra/
  docker/
    Dockerfile            # универсальный билд любого app по ARG APP (webpack -> dist/apps/<APP>/main.js)
    Dockerfile.dockerignore  # игнор контекста (Dockerfile вне корня → нужен рядом с ним)
    <app>/Dockerfile      # ОПЦИОНАЛЬНО: override для app со своими сис-зависимостями
  compose/
    docker-compose.dev.yml   # локально: все 8 apps + redis + db + gotenberg (build на месте)
    docker-compose.prod.yml  # прод: образы из GHCR + redis + gotenberg (внешняя БД)
    ports.env                # host-порты приложений (коммитится, подключается через --env-file)
  legacy/               # архив старых одиночных Dockerfile/compose (не используются)
```

## Порты

**Внутри контейнера ВСЕ приложения слушают `3000`** (контейнеры изолированы, конфликта
нет). Наружу отдаются host-порты — они централизованы в одном файле
[`compose/ports.env`](compose/ports.env), а в compose подставляются как `${<APP>_HOST_PORT}`.
Менять порт приложения → править **только `ports.env`**.

| App | Host-порт | App | Host-порт |
|---|---|---|---|
| back | 8334 | admin | 8338 |
| kpi-report-sales | 8335 | event-sales | 8339 |
| pbx-install | 8336 | event-service | 8340 |
| kpi-report-service | 8337 | konstructor | 8341 |

У каждого app есть `/api/health` (общий `HealthModule` из `@/core`) — его проверяет
docker healthcheck (на внутреннем `:3000`).

> Локальный порт (`nest start <app>` без Docker) — это `defaultPort` из `apps/<app>/src/main.ts`
> (3000…3007), а не host-порт. Переопределяется переменной `PORT`.

## ENV (модель)

Два уровня, без дублирования:

- **`/.env`** — **общие** переменные (DB, Redis, Bitrix, секреты) для всех apps **и** всех
  `libs/*`. Шаблон: `/.env.example`.
- **`apps/<app>/.env`** — **только специфика** приложения (`SWAGGER_*`, `GLOBAL_PREFIX`,
  фиче-флаги). Шаблон: `apps/<app>/.env.example`. Общие переменные сюда НЕ копируем.

Приоритет (высший → низший): `process.env` (Docker `environment`/`env_file` или шелл)
→ `apps/<app>/.env` → `/.env`. Так app может перекрыть общий ключ под себя.

`ConfigModule.forRoot({ isGlobal: true, envFilePath: ['apps/<app>/.env', '.env'] })` —
глобальный, поэтому `ConfigService` в любой `libs/*` читает тот же смерженный конфиг
этого приложения. Реальные `.env` в git не попадают; коммитятся только `*.env.example`.

## Локальный запуск (dev)

```bash
cd infra/compose
docker compose --env-file ports.env -f docker-compose.dev.yml up -d --build   # все приложения
docker compose --env-file ports.env -f docker-compose.dev.yml ps              # статус/health
docker compose -f docker-compose.dev.yml logs -f back                         # логи одного
```

Пересборка/перезапуск **только одного** приложения (остальные не трогаются):

```bash
docker compose --env-file ports.env -f docker-compose.dev.yml up -d --no-deps --build admin
```

> `--env-file ports.env` обязателен — иначе `${<APP>_HOST_PORT}` не подставятся.

## Per-app Dockerfile (override)

По умолчанию все приложения собираются из `infra/docker/Dockerfile`. Если приложению
нужны собственные системные зависимости (например, ffmpeg/libreoffice), создайте
`infra/docker/<app>/Dockerfile` и укажите его в `build.dockerfile` соответствующего
сервиса в `docker-compose.dev.yml`. CI (`deploy-monorepo.yml`) подхватывает такой файл
автоматически.

## Прод-деплой

Сборка образов и пуш в GHCR — в GitHub Actions
(`.github/workflows/deploy-monorepo.yml`, matrix только по изменённым apps). На сервере
используется `docker-compose.prod.yml`; `GHCR_OWNER`/`IMAGE_TAG` приходят из шелла
(workflow экспортирует их), host-порты — из `ports.env`:

```bash
# из корня репо (как делает workflow)
export GHCR_OWNER=<owner> IMAGE_TAG=latest
docker compose --env-file infra/compose/ports.env -f infra/compose/docker-compose.prod.yml pull admin
docker compose --env-file infra/compose/ports.env -f infra/compose/docker-compose.prod.yml up -d --no-deps admin
```

Подробности CI/секретов (`GHCR_PAT` и пр.) — в `docs/MONOREPO_SUMMARY.md` (§9).
