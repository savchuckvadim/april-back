# СКАП: импорт статистики в смарт-процесс

Крон-конвейер: выгрузки СКАП (zip / csv) из папки «СКАП. Загрузка» на Диске
группы отдела сервиса → смарт «СКАП» (элемент = **логин клиента × месяц**) +
полный съём сессий и подписок в БД. План и все решения:
`ai/tasks/skap-import-pipeline-plan.md`.

## Поток

```
SkapImportScheduler (тик 30 мин, Redis-лок, интервал per-портал)
  → Bull SKAP_IMPORT / SKAP_IMPORT_RUN (jobId={domain}:run)
    → SkapImportRunUseCase (тайм-бюджет ≤ maxRunMinutes, default 180)
      → SkapDiskService: группа из PortalDB (callings, group=service) → папка → листинг
      → SkapFileRepository.syncDiskFiles (новые/перезалитые → pending)
      → SkapFileImportFlow (по файлу): распаковка → формат-гвард (header-map)
        → матчинг: компания по UF_CRM_USER_CARDNUM (фундамент!) →
          сделка service_base по датам договора → контакт по email-логину
        → SkapSmartWriterService: upsert по xmlId=skap_{card}_{login}_{YYYY-MM}
        → skap_import_items / skap_sessions / skap_subscriptions (dedup_key)
        → сессии месяца — комментарием в таймлайн элемента
      → SkapRunNotifierService: Telegram-дайджест + im-notify
```

## Слои

| Где | Что |
|---|---|
| `libs/portal-lib/pbx/pbx-skap-smart` | типизация смарта (const), descriptor, resolveInfo/mirrorFields |
| `libs/skap-lib` | формат-гвард (3 формата V1), store-репозитории, writer, events, notifier, установщик |
| `apps/event-service/src/skap` | конвейер: cron, queue, диск, матчинг, run use-case + ручные `/parse`-эндпоинты |
| `apps/admin/src/skap` | мониторинг: runs/files/items, retry, reprocess-skipped |

## Настройки (portal_app_settings, app=skap — из админки, без деплоя)

`enabled`, `group_id` (0 = группа сервиса из PortalDB), `folder_id` (кэш),
`scan_interval_minutes` (60 на обкатке → 10080 еженедельно),
`max_run_minutes` (180 — «не более 3 часов»), `max_files_per_run`,
`max_history_years` (3; 0 = без лимита),
`notify_user_ids` (Bitrix ID получателей сводки в портале через запятую;
пусто — только Telegram-дайджест в админ-чат бэка),
`digest_level` (all / errors / off).

Env: `SKAP_IMPORT_CONCURRENCY` (default 2) — параллельные домены воркера.

## Идемпотентность (3 уровня)

1. БД: unique `dedup_key` (items/sessions/subscriptions), upsert.
2. Очередь: `jobId={domain}:run`.
3. Bitrix: `xmlId` элемента + батч-поиск перед созданием.

Перезаливка файла (детект по UPDATE_TIME/size) → сброс в pending → update,
не дубль.

## Защита от смены формата

Парсинг по ИМЕНАМ колонок (`SKAP_*_COLUMNS_V1`): перестановка/новые колонки —
работаем + ворнинг; пропала обязательная — файл `error_format` + немедленный
Telegram-алерт; нет заголовка — позиционный fallback. Новая версия формата =
константа + тест в `libs/skap-lib/src/format`.

## Запуск на портале (чеклист)

1. Миграции skap_* накатаны (`ai/tasks/skap-import-tables.sql` → Laravel).
2. Группа сервиса установлена (pbx-install, группы звонков, «ОС Звонки»).
3. Смарт установлен: админка → галерея смартов → «СКАП» (kind=skap),
   либо `POST admin/pbx/smarts/install-const {kind:'skap', domain}`.
4. В админке настроек приложений: app=skap → `enabled=true`.
5. Пользователи кладут выгрузки в «СКАП. Загрузка» (папка создастся сама):
   zip годовой структуры (`месяц год/РП/*.csv`) или файлы по месяцам —
   месяц берётся из имени папки («август 2024») или файла («2024-08»).

## Портальная поверхность (фронт kpi-service)

`apps/kpi-report-service` → `POST /skap/run {domain}` (кнопка «пересчитать»,
джоб в очередь) и `GET /skap/status?domain=` (running / pendingFiles /
lastRun / **folderUrl** — индикатор обновления + маленькая ссылка
«Хранилище СКАП» на папку Диска рядом с кнопкой; фронт поллит пока идёт).
folderUrl кэшируется в настройках при первом прогоне (DETAIL_URL папки).
Админ-поверхность — `apps/admin` (`admin/skap/*`: runs/files/items, retry,
reprocess, run).

## Тесты

- `libs/skap-lib/src/format/__tests__` — формат-гвард: синтетика всегда;
  фикстурные тесты скипаются, если рядом нет живой папки
  `apps/event-service/src/skap/example/` (в git не хранится);
- `libs/skap-lib/src/store/__tests__` — синк файлов, dedup;
- `libs/portal-lib/pbx/pbx-skap-smart/__tests__` — конфиг смарта, ключи.
