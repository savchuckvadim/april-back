# Записи каталога хуков

Один файл — один хук (`<code>.entry.ts`, `export const X_ENTRY: HookCatalogEntry`).
Семейные индексы (`*.family.ts`) собирают записи в массивы, реестр
`../hook-catalog.ts` их склеивает.

Правила:
- факты только из README модулей (`apps/event-sales/src/**`), `SALES_HOOKS_GUIDE.md`,
  `LEAD_REQUEST_FLOW.md`, `ai/tasks/2026-09-16-lead-to-work-hook-guide.md`,
  `front/docs/cold-hook-v2.md` и статей `ai/tasks/kb-garant/articles`;
- `settings[].key` — camelCase-ключ схемы настроек, `pbxFields[].code` — код из
  `PBX_SALES_EVENT_FIELDS`, `stages[].code` — код шаблона стадий; всё это
  проверяет `__tests__/hook-catalog.spec.ts`;
- markdown — подмножество GFM (заголовки `##`, списки, таблицы, `код`, **жирный**,
  ссылки); без HTML.
