# Каталог хуков и автоматики ОП (`@lib/portal-lib/hooks`)

Единственный источник правды для раздела админки «Хуки и автоматика»:
что за хук, кто его зовёт, какие параметры, настройки портала, PBX-поля
и стадии задействованы, что установить и как проверить. Плюс живое
состояние портала (готовность) и мониторинг операций.

## Слои

| Слой | Где | Что |
|---|---|---|
| Каталог | `catalog/` | Статические записи `HookCatalogEntry` (одна на хук), реестр `HOOK_CATALOG`, карта базы знаний `kb-docs.ts`, связи «настройка → хуки/поля» (`lib/setting-relations.ts`), сводный реестр PBX-полей (`lib/pbx-field-registry.ts`) |
| Готовность | `readiness/` | `HookReadinessService` читает слепок PortalDB (поля лида/сделки/компании, стадии лида через лид-якорь `btx_categories` + `btx_stages`, стадии воронки `sales_base`) и настройки event-sales; оценка — чистая `evaluateHookReadiness` |
| Мониторинг | `monitoring/` | `HookOperationsService` читает операции sales-хуков из `app_cache` (app `event-sales-hooks`, group `operation`) — то же, что фрейм поллит по `operationId`; окно — последний час-два (TTL час + ежечасная чистка) |
| Админ-API | `admin/` | `HooksAdminModule`: `GET admin/hooks`, `admin/hooks/:code`, `admin/portal/:id/hooks`, `admin/portal/:id/hooks/operations`, `admin/portal/:id/hooks/:code`. Подключается ТОЛЬКО в `apps/admin` |

Настройки приложений (`store/app-settings`) берут из каталога связи
категорий и ключей с хуками и полями и теорию категорий
(`PortalAppSettingGroup.theory`) — админка показывает их в разделе
«Настройки приложений». Импорты между `store/app-settings` и `hooks`
только точечные (файлы), не через индексы, — иначе цикл.

## Как добавить хук

1. Файл `catalog/entries/<code>.entry.ts` по образцу `lead-to-work.entry.ts`:
   факты — из README модуля в `apps/event-sales/src/**`, `SALES_HOOKS_GUIDE.md`,
   `LEAD_REQUEST_FLOW.md`, статей `ai/tasks/kb-garant/articles`.
2. Зарегистрировать в семейном индексе (`*.family.ts`) или в `hook-catalog.ts`.
3. `npx jest libs/portal-lib/hooks` — тест реестра проверяет, что коды
   настроек, полей, стадий, статей и связанных хуков существуют.

Правила записи: markdown — подмножество GFM (`##`, списки, таблицы,
`код`, **жирный**, ссылки), без HTML; `required: true` у поля/стадии —
только если без них хук теряет основную функцию (graceful-пропуск = не
обязательное); `role: 'gate'` — рубильник крона.

## База знаний

`catalog/kb-docs.ts` — карта «ключ статьи → id документа» в «Базе знаний
2.0» портала вендора. Идентификаторы восстановлены по порядку создания
дерева скриптом `ai/tasks/kb-garant/kb-structure.run.js` и сверены с
известной ссылкой (#33 = m10). Проверить: `node ai/tasks/kb-garant/kb-structure.run.js --check`
(печатает дерево с номерами; нужен `.env` с `API_ONLINE_URL`/`API_ONLINE_KEY`).
Если документы пересоздавались — обновить карту.

## Ограничения

- Готовность считается по слепку PortalDB, в Битрикс не ходит: поле,
  поставленное мимо установщика, здесь «не установлено».
- Мониторинг видит только операции семейства sales-hooks (у cold-hook и
  кронов операций в app-cache нет) и только за время жизни статуса.
- Каталог статический: новый параметр хука в коде нужно вписать в запись.
