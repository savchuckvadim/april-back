# Bitrix IM Bridge

Модуль-мост между чатами Bitrix24 и Telegram.

Функции:
- получает входящие события мессенджера Bitrix24;
- пересылает сообщения в Telegram;
- отправляет ответы из Telegram обратно в исходный диалог Bitrix.

## Архитектура

Входные точки вынесены в use-case слой:
- `StartBridgeUseCase` - запуск моста для домена;
- `PollDomainUseCase` - ручной polling одного домена;
- `PollScheduledDomainsUseCase` - периодический polling;
- `HandleTelegramWebhookUseCase` - обработка входящих Telegram update.

Оркестрация последовательности действий:
- `BridgeOrchestratorService`.

Отдельные сервисы:
- `BitrixImApiService` - вызовы Bitrix REST;
- `BridgeUserResolverService` - определение bridge user ID (hook -> email -> current user);
- `BitrixImEventFilterService` - фильтры системных/бот-сообщений + whitelist;
- `BitrixImEventDataService` - парсинг payload события;
- `TelegramReplyRouterService` - маршрутизация reply и `/r <текст>`;
- `BitrixImBridgeStateService` - Redis-состояние (offset, reply context);
- `BitrixImBridgeCronService` - cron-обертка.

## Как работает

1. Scheduler активируется только при `WITH_SCHEDLER=true`.
2. На старте домены берутся из `PortalStoreService` (все порталы из portal-store).
3. По каждому домену выполняется:
   - определение bridge user ID;
   - подписка на `im.v2.Event.subscribe`.
4. Каждые 10 минут выполняется polling через `im.v2.Event.get`.
5. Обрабатывается `ONIMV2MESSAGEADD`:
   - фильтрация (system/bot/whitelist);
   - пересылка в Telegram;
   - сохранение контекста для ответа.
6. Ответ из Telegram уходит в Bitrix через `im.message.add`.

## Режимы ответа из Telegram

- Ответом на пересланное сообщение (через `reply_to_message`).
- Командой `/r <текст>` без reply - используется последний контекст чата Telegram.

Пример:

```text
/r Принял, проверю и отпишусь.
```

## HTTP endpoints

- `POST /commands/bitrix-im-bridge/start`
  - вручную запускает подписку и добавляет домен в scheduler.
- `POST /commands/bitrix-im-bridge/poll`
  - вручную запускает один цикл polling.
- `POST /commands/bitrix-im-bridge/telegram/webhook`
  - endpoint для Telegram webhook.

## Переменные окружения

Обязательные:
- `WITH_SCHEDLER=true`
- `TELEGRAM_BOT_TOKEN=<token>`
- `TELEGRAM_ADMIN_CHAT_ID=<chat_id>`

Опциональные:
- `BITRIX_IM_BRIDGE_USER_EMAIL=savchuckvadim@gmail.com`
- `BITRIX_IM_BRIDGE_PORTAL_WHITELIST=gsr.bitrix24.ru,april-garant.bitrix24.ru`
- `BITRIX_IM_BRIDGE_PORTAL_DENYLIST=garant.bitrix24.ru`
- `BITRIX_IM_BRIDGE_USER_WHITELIST=11,127,187`
- `BITRIX_IM_BRIDGE_IGNORE_SYSTEM=true`
- `BITRIX_IM_BRIDGE_IGNORE_BOTS=true`
- `BITRIX_IM_BRIDGE_NOTIFY_INCOMING_EVENTS=true`
- `BITRIX_IM_BRIDGE_POLL_LIMIT=100`

## Константы Bitrix REST

Строковые имена методов вынесены в:

`services/bitrix/constants/bitrix-im-rest-methods.ts`

Там же есть краткие комментарии по каждому методу:
- `BX_IM_V2_EVENT_SUBSCRIBE_METHOD`
- `BX_IM_V2_EVENT_GET_METHOD`
- `BX_IM_DIALOG_MESSAGES_GET_METHOD`
- `BX_IM_MESSAGE_ADD_METHOD`
