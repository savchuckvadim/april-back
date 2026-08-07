/**
 * Устранённый дубликат (2026-08-05).
 *
 * Раньше здесь лежала байт-в-байт копия доменного справочника event-полей
 * (1332 строки), и при добавлении поля легко было обновить только одну из
 * копий. Единственный источник правды теперь — pbx-domain:
 * `libs/portal-lib/pbx/domain/src/field/type/sales/event/pbx-sales-event-field.type.ts`.
 *
 * Файл сохранён как re-export, чтобы не ломать существующие импорты через
 * barrel `@lib/portal-lib/pbx` (app-type/field/index.ts).
 *
 * ВНИМАНИЕ: konstructor-справочник рядом (`../konstructor/…`) уже разошёлся
 * с доменной копией (enum vs литералы, состав полей) — его дедупликация
 * требует отдельной сверки и здесь сознательно не выполнялась.
 */
export * from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
