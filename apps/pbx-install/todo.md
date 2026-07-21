# Проблема: не записываются created_at / updated_at

Причина: основной бэкенд — Laravel, он ставит таймстампы на уровне приложения
(Eloquent), у колонок нет DB-дефолта. NestJS-бэкенд пишет в ту же БД через Prisma,
который сам эти поля не заполняет → NULL → ошибки (measure, portalMeasure, contract,
portalContract, portal и др.).

## Сделано (централизованно)

- Расширение Prisma `laravel-timestamps` в `libs/core/src/prisma/laravel-timestamps.extension.ts`:
  на create/createMany/upsert → created_at + updated_at; на update/updateMany → updated_at.
  Только для моделей, у которых эти колонки есть (по DMMF). Явные значения не перетираются.
  Не трогает схему → переживает `prisma db pull`, не лезет в Laravel-миграции.
- Подключено в `PrismaService` (через Proxy, чтобы сохранить хуки жизненного цикла Nest).
- Покрыто тестами (`libs/core/src/prisma/__tests__/laravel-timestamps.spec.ts`).

## Ремонт существующих NULL-строк (пока только portal_measure)

- Эндпоинт `POST /pbx-portal-measure/backfill-timestamps` — заполняет NULL created_at/updated_at
  у существующих строк. Идемпотентно.
  (repo → service → use-case → controller, покрыто тестом).




## Осталось / на потом

- Бэкфилл NULL для остальных моделей (agents, rqs, contract, portal_contracts, portal) — по мере надобности,
  по тому же паттерну.
- // проверить все поля в rpa — ОТДЕЛЬНАЯ задача (непагинированный userfieldconfig.list),
  см. docs/tasks/rpa-smart-field-monitoring-pagination.md



при инсталяции филдов для сущности добавить в таблицу и везде
и в установку битрикс isMultiple

при неустановке этого признака в битрикс все падает
в шаблонных данных в таблиуцах
последним столбцом будет добавлена isMultiple
