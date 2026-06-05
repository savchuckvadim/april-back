# Логи docker (monorepo)

Стек поднимается из `infra/compose` (см. [`../infra/README.md`](../infra/README.md)).
Сервисы compose: `back`, `pbx-install`, `kpi-report-sales`, `kpi-report-service`,
`admin`, `event-sales`, `event-service`, `konstructor` + `redis`, `db`, `gotenberg`.
Имена контейнеров: `app-<service>` (напр. `app-back`), а также `redis`, `app_db`, `gotenberg`.

```bash
cd infra/compose
C="docker compose --env-file ports.env -f docker-compose.dev.yml"

$C logs -f                 # все сервисы
$C logs -f back            # один сервис (по имени СЕРВИСА: back / pbx-install / admin ...)
$C logs -f redis
$C logs --tail=200 back    # последние 200 строк
$C logs --since=10m back   # за последние 10 минут
```

Или напрямую по имени КОНТЕЙНЕРА (`app-<service>`):

```bash
docker logs -f app-back
docker logs -f app-pbx-install
docker logs --tail=200 app-admin
```

> На проде compose-файл другой: `-f docker-compose.prod.yml` (см. `infra/README.md`),
> имена сервисов/контейнеров те же.
