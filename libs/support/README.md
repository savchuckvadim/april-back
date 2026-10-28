# @lib/support — поддержка клиентов April

План: `ai/tasks/2026-10-26-support-plan.md`.

## Мониторинг линии поддержки (`src/monitor`)

Бот смотрит открытую линию портала (april-dev, «Поддержка Апрель», `CONFIG_ID = 9`) и оповещает:

| Событие | Когда |
|---|---|
| Новый диалог | Сразу, при первом просмотре |
| Клиент ждёт ответа | `support_monitor_remind_minutes` (10) минут без ответа сотрудника |
| Клиент ждёт долго | `support_monitor_escalate_minutes` (30) минут — срочный повтор |

Каналы: колокольчик (`im.notify.system.add`) сотрудникам портала оповещений (april-garant) и Telegram-чат поддержки (отдельный бот). Оповещения идут круглосуточно (решение владельца 26.10.2026). Напоминание «клиент ждёт» — только оператору, который взял диалог, если он сопоставлен в `support_monitor_operator_map` («оператор линии: сотрудник колокольчика»); новый диалог и срочный повтор — всем.

Доступ к порталам — только вебхук (`PBXService.initWebhook`): OAuth тестовой маркетплейс-установки на april-dev не видит диалоги линии (28.10.2026).

### Слои

```
monitor/
  domain/          чистые правила, без Битрикса
    support-dialog.types.ts     диалог, сообщение, память, оповещение
    support-signal.rules.ts     что слать и что запомнить (decideSupportDialog)
    support-signal.formatter.ts тексты колокольчика (BB-код) и Telegram (HTML)
    support-text.util.ts        текст Битрикса → обычный текст
  application/
    support-monitor-tick.service.ts  такт: прочитать → решить → разослать → запомнить
    support-signal.dispatcher.ts     каналы и доставка
    support-monitor-settings.service.ts + support-monitor-options.ts  настройки портала
    support-monitor.report.ts        отчёт такта
  infrastructure/
    support-line.reader.ts      две пачки: Session.list по статусам, хвосты чатов
    support-dialog.mapper.ts    сессия + хвост → доменный диалог
    support-bell.notifier.ts    колокольчик (per-call инстанс Битрикса)
    support-telegram.notifier.ts Telegram-чат поддержки (env)
    support-monitor.store.ts    Redis: память, лок, окно просмотра, окно тревог
  admin/                         предпросмотр для админки
  support-monitor.module.ts      ТОЛЬКО сервисы
  support-monitor.admin.module.ts ТОЛЬКО контроллер (apps/admin)
```

Крон — `apps/bot/src/support-monitor/support-monitor.scheduler.ts`: тик раз в минуту, линия — не чаще `support_monitor_poll_minutes` (3) минут.

### Правила ожидания

- Ждёт ли клиент — по сообщениям, а не по статусу сессии. Статус `answered` Битрикс ставит и при переводе диалога, когда клиенту никто не писал (диалог №71, 26.10.2026).
- Ожидание считается от ПЕРВОГО сообщения клиента после последнего ответа сотрудника. Системные сообщения и боты линии ответом не считаются.
- Сообщения прошлых сессий того же чата не учитываются: у клиента один чат на все обращения.
- Каждое событие — одно оповещение. Память — Redis, 7 дней, отдельно для «только считать» и боевого режима.
- Ни один канал не принял оповещение — оно не запоминается, следующий просмотр повторит.

### Методы Битрикса

- `imopenlines.v2.Session.list` — `bitrix.imOpenlinesV2Session` / `bitrix.batch.imOpenlinesV2Session`.
- `im.v2.Chat.Message.tail` — `bitrix.imV2ChatMessage` / `bitrix.batch.imV2ChatMessage`. Метода нет в официальной документации, форма ответа снята с живого портала 26.10.2026. Выбран вместо `im.dialog.messages.get` по правилу «где есть v2 — берём v2». Читает и чаты, где пользователь ключа не участник.

### Настройки

Админка → портал линии → «Портал (общие)» → «Поддержка: оповещения о диалогах линии». Описание ключей — там же, внутренняя документация категории.

Env приложения bot: `SUPPORT_TELEGRAM_BOT_TOKEN`, `SUPPORT_TELEGRAM_CHAT_ID` (см. `apps/bot/.env.example`).

## Стойка поддержки (`src/desk`) — Support API

Для техспециалиста и ИИ (план, раздел 2а). Сервис `SupportDeskService`, ручки — `apps/bot/src/support-api` под ключом `x-support-api-key` (env `SUPPORT_API_KEYS=имя:ключ`, отдельно от `AGENT_API_KEYS`: этот API пишет клиентам).

| Ручка | Что делает |
|---|---|
| `GET /api/support/dialogs` | Открытые диалоги линии: кто ждёт и сколько, ссылки на диалог и карточку CRM |
| `GET /api/support/dialogs/:chatId` | Переписка чата (`im.v2.Chat.Message.tail`), роли авторов, клиент и его портал |
| `POST /api/support/dialogs/:chatId/reply` | Ответ клиенту ТОЛЬКО после «да» человека: `confirmedBy` уходит в журнал и копией в Telegram-чат поддержки |
| `POST /api/support/tasks` | Задача на исправление на портале колокольчика со ссылкой на диалог |

Портал линии — `domain` или первый портал с включённым мониторингом.

Ответ уходит от имени пользователя ключа портала линии через `im.message.add`. Отказ в доступе — ключ не участник диалога: `imopenlines.session.join` и одна повторная попытка, оператор диалога не меняется. **Отправка на живой линии не проверялась:** первую отправку — в тестовом диалоге №71 с согласия владельца.

MCP для Claude Code — `scripts/mcp/april-support.mjs` (без зависимостей, stdio), подключён локально: `claude mcp get april-support`. Ключ — env `APRIL_SUPPORT_KEY`. Навык — `.claude/skills/client-support-reply`.

Контекст клиента сейчас: портал клиента, карточка CRM на april-dev и переписка. Журналов ошибок по порталу клиента нет: читателя журналов ClickHouse в бэке пока нет.

## Путеводитель в админке (`src/guide`)

`GET /api/admin/support/guide` — тексты раздела «Поддержка» админки (концепция, как пользоваться, алгоритм, ключи, что не сделано) и чек-лист «что осталось, чтобы заработало» по настройкам портала линии. Тексты — `support-guide.content.ts`, коды настроек в них проверяет тест. Страница — `front/apps/admin/modules/entities/support`.

Ошибки портала клиента для ИИ — `GET /api/support/errors?domain=` (журналы ClickHouse через `@lib/logger/query`).

### Проверка на живой линии

- `POST admin/support-monitor/preview { "domain": "april-dev.bitrix24.ru" }` — что ушло бы сейчас. Ничего не шлёт и не запоминает.
- Режим «только считать» пишет каждое событие в журнал bot один раз.

## ИИ-помощник на сервере (`src/assistant`) и Telegram-вход (`src/telegram-bot`)

Решение владельца 28.10.2026: OpenClaw не нужен; подписка Claude — только в Claude Code на компьютере техспециалиста (с телефона — Remote Control или Channels); в сервер подписку не кладём (правила Anthropic). Серверный «мозг» — шлюз LLM `@lib/llm-gateway`: VibeCode Битрикса по ключу портала линии (april-dev, рубли), запасной OpenAI-совместимый — env `LLM_FALLBACK_*`, Anthropic по ключу — позже, через евро-сервер владельца. Контракт, который не меняется при смене провайдера, — стойка поддержки и Support API.

```
assistant/
  domain/
    support-assistant.types.ts    разбор (SupportAnalysis) и черновик (SupportDraft)
    support-assistant.schema.ts   strict JSON-схема support_dialog_analysis + parseSupportAnalysis
    support-assistant.prompt.ts   системный промпт (правила ответа из базы знаний, карточки частых проблем) и сборка контекста
    support-assistant.format.ts   HTML для Telegram: черновик, список диалогов, подсказки
    support-dialog.lookup.ts      «разбери Соломатову»: номер чата/сессии, имя в любом падеже, портал
  application/support-assistant.service.ts  analyze → черновик в Redis; revise; send (ТОЛЬКО после «да»); createTask; discard
  infrastructure/support-draft.store.ts     Redis: черновики (сутки) и привязка «сообщение Telegram → черновик»
  support-assistant.module.ts              ТОЛЬКО сервисы
telegram-bot/
  domain/support-telegram.update.ts    типы обновления Telegram (snake_case, как в Bot API)
  domain/support-telegram.commands.ts  команды: /help, /dialogs, «что в поддержке», /analyze, «разбери …»; callback_data `sa:<action>:<draftId>`
  domain/support-telegram.keyboard.ts  кнопки: «Отправить клиенту», «Задача разработчику» (если нужен), «Убрать»
  application/support-telegram-bot.service.ts  обработка обновлений
  support-telegram-bot.module.ts       ТОЛЬКО сервис; вебхук — apps/bot/src/support-telegram
```

Правила:

- Клиенту пишет только `send` после явного «да» человека: в Telegram это кнопка «Отправить клиенту» (в журнал и копию в чат уходит имя нажавшего), в Claude Code — слово «да». Правка черновика — ответом на сообщение с ним; бот показывает новый черновик с кнопками.
- Команды принимаются из чата поддержки (`SUPPORT_TELEGRAM_CHAT_ID`) и в личке от его участников (`getChatMember`, кэш 10 минут). Чужие чаты молча пропускаются.
- Контекст разбора: переписка (`im.v2.Chat.Message.tail`, 30 сообщений) и ошибки наших приложений по порталу клиента за 24 ч (`LogQueryService`); журналов нет — разбираем без них.
- Модель не знает текстов базы знаний — только названия карточек частых проблем (`SUPPORT_FREQUENT_PROBLEMS`); тексты статей — следующий шаг.
- Telegram ждёт быстрый ответ: вебхук отвечает сразу, обработка в фоне; ошибка — «Не получилось: …» в тот же чат.

Вебхук (apps/bot): `POST /api/support/telegram/webhook`, секрет в заголовке `X-Telegram-Bot-Api-Secret-Token` (env `SUPPORT_TELEGRAM_WEBHOOK_SECRET`); `SupportTelegramWebhookRegistrar` при старте регистрирует `SUPPORT_TELEGRAM_WEBHOOK_URL` в Telegram (не на `APP_ROLE=standby`). В группе без выключенного режима приватности (BotFather `/setprivacy`) бот видит только команды вида `/analyze 769`.

Support API: `POST /api/support/dialogs/:chatId/analyze` — тот же разбор для Claude Code; MCP-инструмент `support_dialog_analyze`.

Чек-лист админки: пункт «модель настроена» — `StructuredLlmGateway.availability(lineDomain)`; ссылка на ключи портала.

**Вживую не проверялось** (28.10.2026): разбор моделью и кнопки — нужны VibeCode-ключ на april-dev и env вебхука на сервере.
