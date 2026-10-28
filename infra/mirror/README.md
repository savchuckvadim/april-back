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
      dokploy-domains.sh              # домены всех приложений (test | prod)
      dokploy-deploy.sh               # ручной деплой через API
      seed-replica.sh                 # первичная заливка + START REPLICA
      check-lag.sh                    # cron: контроль репликации → Telegram
      sync-storage.sh                 # cron: rsync storage/ и keys/ с прода
      backup-dump.sh                  # cron: дамп с реплики (+S3)
      promote.sh                      # переключение: реплики → главные
      demote-prod.sh                  # переключение: прод → только чтение (на проде)
.github/workflows/deploy-mirror.yml   # после прод-деплоя: образы → :mirror + compose.deploy
```

---

## 0. Что уже настроено (28.10.2026)

| Что | Значение |
|---|---|
| Сервер | `62.113.100.217` (Beget), Ubuntu 26.04, 6 vCPU / 11 GB / 145 GB |
| SSH | только ключи (`/etc/ssh/sshd_config.d/00-keys-only.conf`), пароль выключен |
| Dokploy | v0.30.10, панель `https://m.dockploy.april-app.ru` (Let’s Encrypt), прямой порт 3000 закрыт; проект «April Mirror Backend», окружение `production` |
| Compose-сервис | `back-mirror`, composeId `FakrccxrHqpOXbUvDLKs5`, appName `back-mirror-phxj10` |
| Источник | `git@github.com:savchuckvadim/april-back.git`, ветка `monorepo`, путь `./infra/compose/docker-compose.mirror.yml`, Auto Deploy выключен |
| Ключ к репо | SSH-ключ Dokploy `github-april-back-ro` — добавить в GitHub как deploy key только на чтение |
| Каталог files | `/etc/dokploy/compose/back-mirror-phxj10/files` (mysql, redis, keys, storage) |
| Домены | 12 тестовых `{short}.m.april-app.ru` (`dokploy-domains.sh test`) |
| Скрипты | `/opt/mirror/scripts`, настройки `/etc/mirror/mirror.env` |
| Реестр | не нужен, пока пакеты GHCR публичные (см. раздел 10) |

---

## 1. Что осталось сделать владельцу

1. **DNS в Selectel.** DNS домена обслуживает Selectel, хостер сервера
   роли не играет:
   - `A  m.dockploy.april-app.ru → 62.113.100.217` — панель (сделано 28.10);
   - `A  *.m.april-app.ru      → 62.113.100.217` — все 12 тестовых доменов
     одной записью (сделано 28.10). Wildcard покрывает один уровень, поэтому тестовые
     домены вида `event-sales.m.april-app.ru`, без `api.`. В Selectel в поле
     «Имя группы» вводится только `*.m` — зона `.april-app.ru.` дописывается
     сама; полное имя или пробел в конце дают ошибку.
2. **Deploy key в GitHub.** Dokploy при каждом деплое скачивает репозиторий
   (из него берётся compose-файл). Пускает его SSH-ключ: закрытая половина
   хранится в Dokploy (Settings → SSH Keys → `github-april-back-ro`),
   открытую надо разрешить в репозитории — только чтение, только april-back.
   - https://github.com/savchuckvadim/april-back/settings/keys/new
     (это настройки репозитория, не профиля: Settings → SSH keys профиля
     не подходит);
   - Title — `dokploy-mirror`; Key — публичный ключ одной строкой, от
     `ssh-ed25519` до `dokploy`;
   - галку «Allow write access» не ставить → Add key.

   Проверка: `git ls-remote` с этим ключом отдаёт sha ветки `monorepo`.
   Один deploy key — на один репозиторий: фронту понадобится свой.
3. **Прод-`.env`** вставить в Dokploy → сервис `back-mirror` →
   Environment, в верхний блок (нижний с переменными зеркала уже
   заполнен). Взять с прод-сервера `/var/www/html/back-mono.april-app/.env`.
   Значения `apps/<app>/.env` прода, если там есть что-то кроме `SWAGGER_*`,
   — туда же.
4. **`keys/key.json`** (сервисный аккаунт Yandex) с прода
   `/var/www/html/back-mono.april-app/keys/key.json` → на зеркало
   `/etc/dokploy/compose/back-mirror-phxj10/files/keys/key.json`. Через
   компьютер (PowerShell; `<логин>` — тот, которым заходишь на прод):

   ```powershell
   scp <логин>@176.114.65.190:/var/www/html/back-mono.april-app/keys/key.json $env:TEMP\key.json
   scp $env:TEMP\key.json april-mirror:/etc/dokploy/compose/back-mirror-phxj10/files/keys/key.json
   Remove-Item $env:TEMP\key.json
   ```

   Без scp — текстом: на проде `cat …/keys/key.json`, скопировать всё; на
   зеркале `ssh april-mirror`, `nano /etc/dokploy/compose/back-mirror-phxj10/files/keys/key.json`,
   вставить, Ctrl+O, Enter, Ctrl+X. В чаты и задачи файл не вставлять — это
   секрет. Позже `sync-storage.sh` по cron будет держать `keys/` в синхроне.
5. **Секреты GitHub** april-back → Settings → Secrets and variables → Actions:
   `DOKPLOY_URL=https://m.dockploy.april-app.ru`, `DOKPLOY_API_KEY` (токен
   панели), `DOKPLOY_COMPOSE_ID=FakrccxrHqpOXbUvDLKs5`. Переменная
   (Variables) `MIRROR_HEALTH_URLS`, например
   `https://event-sales.m.april-app.ru/api/health https://admin.m.april-app.ru/api/health`.
6. **Закоммитить и запушить** правки зеркала от 28.10 в `monorepo`. Прод ничего
   не пересоберёт: меняются только workflow зеркала и infra, а основной код
   зеркала уже на проде с 14.10. После прод-workflow «Deploy mirror» сам
   возьмёт текущие прод-образы `:latest` и задеплоит зеркало. Руками —
   Actions → Deploy mirror → `sync=latest`.

Панель уже на домене, порт 3000 закрыт (`docker service update
--publish-rm` у сервиса dokploy; вернуть — `--publish-add
"published=3000,target=3000,mode=host"`).

---

## 2. Как это работает

- **Образы.** `deploy-mirror.yml` срабатывает на тот же push в `monorepo`,
  ждёт, пока прод-деплой этого коммита закончится, и только при успехе
  перетегирует прод-образы в `:mirror` (прошлый — в `:mirror-prev`).
  Сборки у зеркала нет: на нём крутится ровно то, что прошло прод.
  Прод упал — зеркало остаётся на последней рабочей версии.
  `workflow_run` не подходит: он срабатывает только для файла в ветке по
  умолчанию (`main`), а push в `main` запускает старый `deploy.yml`.
- **Compose под Dokploy.** У приложений нет `container_name` и host-портов:
  наружу их выводит Traefik через Domains (labels и `dokploy-network`
  Dokploy дописывает при деплое). Сеть `default` задана явно, иначе после
  добавления домена приложение оказалось бы только в `dokploy-network`,
  без доступа к redis и mysql-replica. Тег `:mirror` подвижный, поэтому
  `pull_policy: always`. Переменные Dokploy пишет в `.env` рядом с
  compose, отсюда `env_file: .env`. Каталог репо при каждом деплое
  клонируется заново, поэтому всё долгоживущее лежит в `files`
  (`MIRROR_FILES_DIR`).
- **Режим ожидания.** `APP_ROLE=standby`: после инициализации
  `bootstrapApp` останавливает все кроны/интервалы/таймауты и ставит
  очереди Bull на локальную паузу; `/api/health` отдаёт `role`.
  Записи в БД в этом режиме невозможны (`super_read_only`) — так и задумано.

---

## 3. Переменные окружения сервиса (Dokploy → Environment)

Верхний блок — `.env` прода целиком: значения `APP_KEY`, `AUTH_JWT_SECRET`,
`APP_SECRET_KEY`, `MARKETPLACE_ADMIN_KEY`, `ADMIN_KEY` должны совпадать
побайтово, ими расшифровываются токены установок. Нижний блок уже
заполнен; его имена с прод-`.env` не пересекаются, порядок не важен.

| Переменная | Значение | Зачем |
|---|---|---|
| `APP_ROLE` | `standby` (при переключении — `active`) | режим ожидания |
| `MIRROR_DATABASE_URL` | `mysql://root:<пароль>@mysql-replica:3306/<имя базы прода>` | перекрывает прод-`DATABASE_URL` |
| `MIRROR_MYSQL_ROOT_PASSWORD` | сгенерирован при настройке | root реплики |
| `MYSQL_IMAGE` | `mysql:8.0` → заменить на точную версию прода | реплика той же версии |
| `MIRROR_FILES_DIR` | `/etc/dokploy/compose/back-mirror-phxj10/files` | keys, storage, конфиги |
| `GOTENBERG_REPLICAS` | `2` (после переключения — по ядрам) | конвертация |
| `MYSQL_REPLICA_BIND` | `127.0.0.1` (для обратной репликации — IP WireGuard зеркала) | порт реплики |
| `MIRROR_GHCR_OWNER`, `MIRROR_IMAGE_TAG` | не задавать (дефолт `savchuckvadim`, `mirror`) | образы |
| `CORS_ORIGIN` | из прод-`.env`; тестовые домены — только если фронт будет ходить в зеркало | фронты |
| `LOG_CLICKHOUSE_ENABLED` | compose ставит `false`; ClickHouse на зеркале нет | логи |

Если приложения на проде ходят в БД не root-пользователем — заведите
того же пользователя на реплике (`MIRROR_DB_APP_USER` в `mirror.env`,
создаётся `seed-replica.sh`) и подставьте его в `MIRROR_DATABASE_URL`.

---

## 4. Файлы на сервере зеркала (`<files>`)

```
/etc/dokploy/compose/back-mirror-phxj10/files/
  keys/key.json          # сервисный аккаунт Yandex — копия с прода
  storage/               # пусто; наполнит sync-storage.sh
  mysql/replica.cnf      # из infra/mirror/mysql/replica.cnf
  redis/redis.conf       # из infra/mirror/redis/redis.conf (на запись!)
```

Владелец — root (контейнеры приложений работают от root). `redis.conf`
монтируется на запись: `promote.sh` делает `CONFIG REWRITE`. Поменяли
конфиг в репо — скопировать на сервер заново (`scp`), Dokploy его не трогает.

---

## 5. Первый деплой и проверка (ожидание, без данных)

1. Actions → «Deploy mirror» → Run workflow, `sync=latest` (или дождаться
   прод-деплоя после пуша в `monorepo`).
2. В Dokploy: Deployments → лог без ошибок; Preview Compose показывает
   labels Traefik у приложений с доменами.
3. `curl https://<short>.m.april-app.ru/api/health` для всех 12 →
   `{"status":"ok","role":"standby"}` (ответ может быть обёрнут
   `ResponseInterceptor`).
4. Swagger: `https://<short>.m.april-app.ru/docs/api`.
5. Логи приложений: предупреждение «Режим ожидания (APP_ROLE=standby)» с
   перечнем остановленных кронов и очередей; ошибок записи в БД при
   старте быть не должно. Если какое-то приложение пишет на старте — это
   дефект (обернуть под `APP_ROLE`), заводим задачу.
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
4. **Боевые домены:** `dokploy-domains.sh prod` — заводит
   `api.<short>.april-app.ru` на те же сервисы. Заранее их не добавляем:
   пока DNS смотрит на прод, Let's Encrypt сертификат не выпустит, а
   повторные неудачные попытки упираются в лимиты.
5. **Dokploy → Environment:** `APP_ROLE=active` (при необходимости
   `GOTENBERG_REPLICAS` по ядрам) → **Redeploy**. Кроны и очереди
   включаются; в логах/Telegram — отчёт о кронах без предупреждения о
   режиме ожидания.
6. **DNS в Selectel:** A-записи `api.<short>.april-app.ru` → `62.113.100.217`.
   Traefik выпустит сертификаты на боевые домены через 1–3 минуты после
   того, как DNS начнёт отвечать новым адресом.
7. **Отключить cron `sync-storage.sh`** на зеркале (иначе он перезапишет
   новые файлы старыми с прода).
8. **Проверки:** health всех приложений (`role: active`); тестовый
   исходящий вебхук Битрикса (например, ХО v2 на тестовой сделке); отчёт в
   kpi-report-sales; вход в админку; рефреш OAuth-установки маркетплейса.
9. Сообщить команде. Вебхуки Битрикса, пришедшие в окно переключения,
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
   cron-задачи.

---

## 9. Учения и регламент

- **Код зеркала догоняет прод сам:** каждый успешный прод-деплой
  `monorepo` запускает «Deploy mirror». Проверять раз в неделю, что
  последний запуск зелёный (Actions → Deploy mirror). Красный из-за
  упавшего прода — нормально, зеркало остаётся на прошлой версии.
- **Откат зеркала:** образы `:mirror-prev` хранят предыдущую версию;
  перетегировать их в `:mirror` и Redeploy.
- **Раз в квартал — учения без повышения реплики:** на зеркале
  восстановить последний дамп в отдельный временный MySQL (`docker run
  mysql:<ver>`), поднять один тестовый стек с `APP_ROLE=active` и
  `MIRROR_DATABASE_URL` на него, прогнать smoke на тестовых доменах,
  снести. Реплику при учениях не трогать.
- **Ежемесячно:** `check-lag.sh` зелёный, свежий дамп в `BACKUP_DIR`/S3,
  `sync-storage.sh` без ошибок, место на диске под binlog/relay-log,
  версия MySQL на проде не ушла вперёд реплики.

---

## 10. Когда закроем репозитории (private)

План — в `ai/tasks/2026-10-14-mirror-dokploy-dr-plan.md`, раздел 10.
Что затрагивает зеркало:

- **Код:** Dokploy уже ходит в репо по deploy key, при закрытии ничего
  не меняется (если deploy key добавлен).
- **Образы:** видимость пакетов GHCR от видимости репо не зависит. Если
  пакеты тоже закрыть — в Dokploy Settings → Registry добавить
  `https://ghcr.io` с classic PAT `read:packages` (кнопка Test), а на
  проде задать секрет `GHCR_PAT` (прод-workflow уже умеет логиниться).
- **Минуты Actions:** у приватного репо они платные сверх лимита тарифа;
  job `wait-prod` занимает раннер на всё время прод-деплоя.
