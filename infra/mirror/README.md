# Зеркало бэка на Dokploy (тёплый резерв)

Второй хостер, панель Dokploy, те же 12 приложений из тех же GHCR-образов.
Пока прод жив, зеркало стоит в режиме ожидания: приложения подняты и
отвечают, но кроны остановлены и воркеры очередей на паузе
(`APP_ROLE=standby`, `libs/core/src/bootstrap/standby-mode.ts`). База —
реплика прода только для чтения, Redis — реплика, файлы — rsync.
Переключение руками по разделу 7.

Прод (`docker-compose.prod.yml`, `deploy-monorepo.yml`, nginx, `.env`
сервера) этим не затрагивается. План и обоснование решений —
`ai/tasks/2026-10-14-mirror-dokploy-dr-plan.md`.

```
infra/
  compose/docker-compose.mirror.yml   # стек зеркала (Dokploy Compose)
  mirror/
    README.md                         # этот runbook
    mysql/replica.cnf                 # → <files>/mysql/replica.cnf на сервере
    redis/redis.conf                  # → <files>/redis/redis.conf
    scripts/                          # → /opt/mirror/scripts на сервере зеркала
      mirror.env.example              # → /etc/mirror/mirror.env
      lib.sh                          # общие функции
      seed-replica.sh                 # первичная заливка + START REPLICA
      check-lag.sh                    # cron: контроль репликации → Telegram
      sync-storage.sh                 # cron: rsync storage/ и keys/ с прода
      backup-dump.sh                  # cron: дамп с реплики (+S3)
      promote.sh                      # переключение: реплики → главные
      demote-prod.sh                  # переключение: прод → только чтение (на проде)
      dokploy-deploy.sh               # ручной деплой через API
.github/workflows/deploy-mirror.yml   # образы :mirror + compose.deploy
```

---

## 1. Что сделать в Dokploy (чеклист владельца)

Порядок важен: сервис создаётся до секретов workflow, а домены — до
первого деплоя.

1. **VPS у второго хостера.** Ориентир: 8 vCPU, 16 GB RAM, NVMe от
   2× размера БД + 60 GB, Ubuntu 24.04, публичный IP. Открыть 80/443 и
   SSH; 3306/6379 наружу не открывать.
2. **Установить Dokploy** официальным инсталлером
   (`curl -sSL https://dokploy.com/install.sh | sh`), зайти на
   `http://<ip>:3000`, создать админа, повесить домен панели
   (Settings → Server → Domain) с Let's Encrypt.
3. **API-токен:** Settings → Profile → API/CLI → Generate. Сохранить —
   он пойдёт в секрет `DOKPLOY_API_KEY` репозитория.
4. **GitHub-провайдер:** Settings → Git → GitHub → установить GitHub App
   на репозиторий бэка (нужен доступ только к этому репо).
5. **Реестр образов:** Settings → Registry → Add: Registry URL
   `https://ghcr.io`, username — логин GitHub, password — classic PAT
   с `read:packages` (кнопка Test должна пройти).
6. **Проект и сервис:** Projects → Create `april-mirror` → в окружении
   `production` → Create Service → **Compose**. Имя `back-mirror`.
   Провайдер GitHub: репозиторий бэка, ветка `mirror`, Compose Path
   `infra/compose/docker-compose.mirror.yml`. **Auto Deploy — выключить**
   (деплой запускает workflow, когда образы уже в GHCR).
7. **Environment сервиса:** вставить `.env` прода целиком и добавить
   переменные из раздела 3 (`APP_ROLE=standby`, `MIRROR_DATABASE_URL`,
   `MIRROR_MYSQL_ROOT_PASSWORD`, `MYSQL_IMAGE`, `GHCR_OWNER`, `IMAGE_TAG`).
   `CORS_ORIGIN` дополнить тестовыми доменами зеркала.
8. **Файлы на сервере** (раздел 4): по SSH создать в каталоге `files`
   сервиса `mysql/replica.cnf`, `redis/redis.conf`, `keys/key.json`,
   пустой `storage/`. Путь каталога виден в Advanced → Volumes/Mounts или
   в логе деплоя; записать его в `MIRROR_FILES_DIR` (env) и в
   `/etc/mirror/mirror.env`.
9. **Домены:** вкладка Domains сервиса → Add Domain для каждого
   приложения: тестовый host (например `api.event-sales.m.april-app.ru`),
   Service `event-sales`, Container Port `3000`, HTTPS + Let's Encrypt.
   Повторить для 12 приложений. Боевые `api.<app>.april-app.ru` добавить
   сразу вторыми записями на те же сервисы — сертификаты на них появятся
   только после переключения DNS, это нормально.
   В DNS: A-записи тестовых доменов → IP зеркала.
10. **ID compose-сервиса:** из URL страницы сервиса
    (`.../services/compose/<composeId>`) — в секрет `DOKPLOY_COMPOSE_ID`.
11. **Секреты GitHub** репозитория бэка: `DOKPLOY_URL`
    (`https://<домен панели>`), `DOKPLOY_API_KEY`, `DOKPLOY_COMPOSE_ID`.
    Переменная `MIRROR_HEALTH_URLS` (Variables, не Secrets) — health
    тестовых доменов через пробел, например
    `https://api.event-sales.m.april-app.ru/api/health https://api.admin.m.april-app.ru/api/health`.
12. **Ветка и первый деплой:** `git push origin monorepo:mirror` → workflow
    «Deploy mirror» соберёт (или перетегирует) образы и дёрнет
    `compose.deploy`. Проверка — раздел 5.
13. **Скрипты на сервере зеркала:** `infra/mirror/scripts/` →
    `/opt/mirror/scripts`, `chmod +x`, `mirror.env.example` →
    `/etc/mirror/mirror.env` (`chmod 600`), заполнить.

---

## 2. Как это работает

- **Образы.** `deploy-mirror.yml` (ветка `mirror`) ищет в GHCR образ
  `:<sha>` этого коммита, собранный прод-конвейером; если есть —
  перетегирует в `:mirror` (на зеркале крутится ровно прод-сборка), иначе
  собирает сам. Прод-тег `:latest` зеркало не использует.
- **Compose под Dokploy.** У приложений нет `container_name` и host-портов:
  наружу их выводит Traefik через вкладку Domains (labels и
  `dokploy-network` Dokploy дописывает сам, видно в Preview Compose).
  Переменные Dokploy пишет в `.env` рядом с compose → `env_file: .env`.
  Каталог репо при каждом деплое клонируется заново → всё долгоживущее в
  `files` (`MIRROR_FILES_DIR`).
- **Режим ожидания.** `APP_ROLE=standby`: после инициализации
  `bootstrapApp` останавливает все кроны/интервалы/таймауты и ставит
  очереди Bull на локальную паузу; `/api/health` отдаёт `role`.
  Записи в БД в этом режиме невозможны (`super_read_only`) — так и задумано.

---

## 3. Переменные окружения сервиса (Dokploy → Environment)

Сначала — `.env` прода целиком (значения `APP_KEY`, `AUTH_JWT_SECRET`,
`APP_SECRET_KEY`, `MARKETPLACE_ADMIN_KEY`, `ADMIN_KEY` должны совпадать
побайтово: ими расшифровываются токены установок). Затем:

| Переменная | Значение | Зачем |
|---|---|---|
| `APP_ROLE` | `standby` (при переключении — `active`) | режим ожидания |
| `GHCR_OWNER` | владелец пакетов GHCR в нижнем регистре | образы |
| `IMAGE_TAG` | `mirror` | образы |
| `MIRROR_DATABASE_URL` | `mysql://root:<MIRROR_MYSQL_ROOT_PASSWORD>@mysql-replica:3306/bitrix` | перекрывает прод-`DATABASE_URL` |
| `MIRROR_MYSQL_ROOT_PASSWORD` | сильный пароль | root реплики |
| `MYSQL_IMAGE` | `mysql:8.0.NN` — точная версия прода | реплика той же версии |
| `MIRROR_FILES_DIR` | путь каталога `files` сервиса (абсолютный надёжнее) | keys, storage, конфиги |
| `GOTENBERG_REPLICAS` | `2` (после переключения — по ядрам) | конвертация |
| `MYSQL_REPLICA_BIND` | `127.0.0.1` (для обратной репликации — IP WireGuard зеркала) | порт реплики |
| `CORS_ORIGIN` | прод-список + тестовые домены зеркала | фронты |
| `LOG_CLICKHOUSE_ENABLED` | compose ставит `false`; ClickHouse на зеркале нет | логи |

Если приложения на проде ходят в БД не root'ом — заведите того же
пользователя на реплике (`MIRROR_DB_APP_USER` в `mirror.env`,
создаётся `seed-replica.sh`) и подставьте его в `MIRROR_DATABASE_URL`.

---

## 4. Файлы на сервере зеркала (`<files>`)

```
<files>/
  keys/key.json          # сервисный аккаунт Yandex — копия с прода
  storage/               # пусто; наполнит sync-storage.sh
  mysql/replica.cnf      # из infra/mirror/mysql/replica.cnf
  redis/redis.conf       # из infra/mirror/redis/redis.conf (на запись!)
```

Владелец — root (контейнеры приложений работают от root). `redis.conf`
монтируется на запись: `promote.sh` делает `CONFIG REWRITE`.

---

## 5. Первый деплой и проверка (ожидание, без данных)

1. Actions → «Deploy mirror» → Run workflow (`apps=all`) или push в `mirror`.
2. В Dokploy: Deployments → лог без ошибок; Preview Compose показывает
   labels Traefik у приложений с доменами.
3. `curl https://api.<app>.m.april-app.ru/api/health` для всех 12 →
   `{"status":"ok","role":"standby"}` (ответ может быть обёрнут
   `ResponseInterceptor`).
4. Swagger: `https://api.<app>.m.april-app.ru/docs/api`.
5. Логи приложений: предупреждение «Режим ожидания (APP_ROLE=standby)» с
   перечнем остановленных кронов и очередей; ошибок записи в БД при
   старте быть не должно. Если какое-то приложение пишет на старте — это
   дефект для фазы 1 (обернуть под `APP_ROLE`), заводим задачу.
6. Redis и MySQL пока «пустые мастера» — это ожидаемо до раздела 6.

---

## 6. Данные: туннель, реплика MySQL, Redis, файлы

Нужны доступ на прод-сервер и согласие на правки прод-MySQL (БД общая с
Laravel `online`, пока он не выведен).

### 6.1 WireGuard между хостами

На обоих серверах `apt install wireguard`, пара ключей, `wg0`:
прод `10.10.0.1/24`, зеркало `10.10.0.2/24`, `PersistentKeepalive = 25`,
`AllowedIPs` — только адрес соседа. Файрвол прода: 3306 и 6379 (или
`REDIS_HOST_PORT`) принимать только с `10.10.0.2`. Проверить снаружи, что
эти порты не открыты публично (Docker публикует порты в обход ufw —
правила нужны в `DOCKER-USER` или через хостерский файрвол).

### 6.2 Прод-MySQL (источник)

```sql
SHOW VARIABLES LIKE 'log_bin';            -- ON (в 8.0 по умолчанию)
SHOW VARIABLES LIKE 'server_id';          -- не 0 и не 2
SHOW VARIABLES LIKE 'gtid_mode';          -- нужно ON; включение онлайн:
SET PERSIST enforce_gtid_consistency = WARN;   -- подождать, проверить error log
SET PERSIST enforce_gtid_consistency = ON;
SET PERSIST gtid_mode = OFF_PERMISSIVE;
SET PERSIST gtid_mode = ON_PERMISSIVE;
-- дождаться SHOW STATUS LIKE 'Ongoing_anonymous_transaction_count' = 0
SET PERSIST gtid_mode = ON;
SET PERSIST binlog_expire_logs_seconds = 604800;   -- 7 дней на догон
CREATE USER 'repl'@'10.10.0.2' IDENTIFIED BY '<пароль>';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'10.10.0.2';
```

MySQL в контейнере: `SET PERSIST` пишет в `mysqld-auto.cnf` в data-volume
и переживает перезапуск. `bind-address` должен позволять подключение с
`10.10.0.2` (в контейнере — `0.0.0.0` + файрвол хоста).

### 6.3 Первичная заливка и запуск репликации

Вариант А (до ~20–30 GB): на зеркале `seed-replica.sh --yes` — дамп через
туннель, заливка, `CHANGE REPLICATION SOURCE TO … SOURCE_AUTO_POSITION=1`,
`START REPLICA`, `super_read_only=ON`.

Вариант Б (большая база): clone-плагин. Требует одинаковых версий,
`INSTALL PLUGIN clone SONAME 'mysql_clone.so'` на обеих сторонах,
пользователя с `BACKUP_ADMIN` на проде и `clone_valid_donor_list` на
реплике; затем `CLONE INSTANCE FROM 'clone'@'10.10.0.1':3306 IDENTIFIED BY
'…'`, после перезапуска — тот же `CHANGE REPLICATION SOURCE TO` с
auto-position и `super_read_only=ON`.

Проверка: `SHOW REPLICA STATUS\G` → `Replica_IO_Running: Yes`,
`Replica_SQL_Running: Yes`, `Seconds_Behind_Source` → 0.

### 6.4 Redis

В `<files>/redis/redis.conf` раскомментировать `replicaof 10.10.0.1 <порт
Redis прода>` (и `masterauth`, если на проде включён `requirepass`),
`docker restart` контейнера redis. `redis-cli INFO replication` →
`master_link_status:up`. В `mirror.env` поставить
`MIRROR_EXPECT_REDIS_REPLICA=1`.

### 6.5 Файлы и cron

На проде завести пользователя с доступом на чтение `storage/` и `keys/`
и ключ для зеркала (`PROD_SSH`, `PROD_SSH_KEY`). Cron на зеркале:

```
*/5  * * * * /opt/mirror/scripts/check-lag.sh    >> /var/log/mirror-check.log  2>&1
*/30 * * * * /opt/mirror/scripts/sync-storage.sh >> /var/log/mirror-sync.log   2>&1
15   3 * * * /opt/mirror/scripts/backup-dump.sh  >> /var/log/mirror-backup.log 2>&1
```

---

## 7. Переключение на зеркало (failover)

Заранее, один раз: TTL A-записей `api.*.april-app.ru` (и фронтов) = 300.

1. **Убедиться, что прод действительно недоступен:** health нескольких
   приложений, SSH, страница статуса хостера. Одно упавшее приложение —
   не повод переключаться.
2. **Если прод доступен** — на нём `demote-prod.sh --yes`: останавливает
   приложения и переводит MySQL в `super_read_only`. Недоступен — пропустить,
   но при его возвращении сразу выполнить, пока DNS не вернули.
3. **На зеркале** `promote.sh --yes`: MySQL `STOP REPLICA; RESET REPLICA
   ALL`, запись разрешена; Redis `REPLICAOF NO ONE`.
4. **Dokploy → Environment:** `APP_ROLE=active` (при необходимости
   `GOTENBERG_REPLICAS` по ядрам) → **Redeploy**. Кроны и очереди
   включаются; в логах/Telegram — отчёт о кронах без предупреждения о
   режиме ожидания.
5. **DNS:** A-записи `api.<app>.april-app.ru` → IP зеркала. Traefik
   выпустит сертификаты на боевые домены через 1–3 минуты после того, как
   DNS начнёт отвечать новым адресом.
6. **Отключить cron `sync-storage.sh`** на зеркале (иначе он перезапишет
   новые файлы старыми с прода).
7. **Проверки:** health всех приложений (`role: active`); тестовый
   исходящий вебхук Битрикса (например, ХО v2 на тестовой сделке); отчёт в
   kpi-report-sales; вход в админку; рефреш OAuth-установки маркетплейса.
8. Сообщить команде. Вебхуки Битрикса, пришедшие в окно переключения,
   потеряны (роботы не повторяют) — ХО дошлёт «подстраховка ХО» в
   пределах 24 часов.

---

## 8. Возврат (failback)

Проще всего считать зеркало новым продом, а старый сервер — новым
зеркалом (если хостеры равноценны). Если возвращаться:

1. Старый прод поднят, приложения остановлены, MySQL в `super_read_only`
   (шаг 2 раздела 7).
2. На старом проде сделать MySQL репликой зеркала: заливка (дамп или
   clone с `10.10.0.2`; для clone/репликации порт реплики зеркала открыть
   на WireGuard: `MYSQL_REPLICA_BIND=10.10.0.2` + Redeploy), `CHANGE
   REPLICATION SOURCE TO SOURCE_HOST='10.10.0.2' … AUTO_POSITION=1`,
   `START REPLICA`. Redis прода — `REPLICAOF 10.10.0.2 6379`.
3. Дождаться `Seconds_Behind_Source = 0`, окно обслуживания: на зеркале
   `APP_ROLE=standby` + Redeploy, `super_read_only=ON`; на проде
   `STOP REPLICA; RESET REPLICA ALL`, снять read-only, `REPLICAOF NO ONE`,
   поднять приложения, DNS обратно.
4. Снова настроить репликацию прод → зеркало (раздел 6.3–6.4), включить
   cron'ы.

---

## 9. Учения и регламент

- **Ветка `mirror` догоняет `monorepo`** после каждого удачного
  прод-деплоя: `git push origin monorepo:mirror` (позже — workflow на
  `workflow_run`). Иначе при переключении поедет старый код.
- **Раз в квартал — учения без повышения реплики:** на зеркале
  восстановить последний дамп в отдельный временный MySQL (`docker run
  mysql:<ver>`), поднять один тестовый стек с `APP_ROLE=active` и
  `MIRROR_DATABASE_URL` на него, прогнать smoke на тестовых доменах,
  снести. Реплику при учениях не трогать.
- **Ежемесячно:** `check-lag.sh` зелёный, свежий дамп в `BACKUP_DIR`/S3,
  `sync-storage.sh` без ошибок, срок PAT GHCR, место на диске под
  binlog/relay-log, версия MySQL на проде не ушла вперёд реплики.
