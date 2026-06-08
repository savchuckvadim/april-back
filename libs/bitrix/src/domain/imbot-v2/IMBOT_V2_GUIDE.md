# Гайд: модуль `imbot-v2` (чат-боты Bitrix 2.0)

Документация по **актуальной** ветке REST API ботов Bitrix — `imbot.v2.*` — и по тому, как
пользоваться ею через типизированный слой `libs/bitrix` (`bitrix.imBotV2*`). Только v2.
Источник истины — официальная документация Bitrix (`apidocs.bitrix24.com`, раздел Chatbots 2.0),
ссылки в конце. Всё, что помечено «**аналитика**», — мои рекомендации по применению в нашем проекте.

> Доступ к Bitrix — всегда через инстанс из `PBXService.init(domain)` (правило `CLAUDE.md`).
> Никаких `this.bitrix` в `@Injectable()`-сервисах. Инстанс — один на вызов, по `domain`.

---

## 0. Что есть в модуле (typed API)

Каждый домен доступен из инстанса `bitrix` как обычный и batch-сервис:

| Домен | Сервис | REST-методы |
|---|---|---|
| Бот | `bitrix.imBotV2Bot` | `Bot.register / unregister / update / get / list` |
| Сообщения | `bitrix.imBotV2Message` | `Chat.Message.send / update / delete / get / getContext / read / Reaction.add / Reaction.delete` |
| Команды | `bitrix.imBotV2Command` | `Command.register / unregister / update / answer / list` |
| Чаты + UI | `bitrix.imBotV2Chat` | `Chat.add / get / leave / setOwner / update / manager.add / manager.delete / user.add / user.delete / user.list / inputAction.notify / textField.enabled` |
| Файлы | `bitrix.imBotV2File` | `File.upload / download` |
| События | `bitrix.imBotV2Event` | `Event.get` (polling) |
| Ревизия API | `bitrix.imBotV2Revision` | `Revision.get` |
| Передача оператору | `bitrix.imOpenlinesSession` | `imopenlines.bot.session.*` (отдельный namespace, для открытых линий) |

Batch-аналоги: `bitrix.batch.imBotV2Message.send(cmd, data)` и т.д.

---

## 1. Алгоритм подключения бота

### 1.1. Авторизация (два режима — выбираем по типу интеграции)

По документации Bitrix у `imbot.v2` есть два способа авторизации:

- **OAuth (приложение Marketplace / локальное приложение портала).** Токен — `auth`.
  `botToken` **не нужен**: бот привязывается к приложению по `client_id`. **Это наш случай** —
  у нас OAuth-приложение, установленное на клиентские порталы; `PBXService` уже отдаёт инстанс с
  нужным токеном по `domain`.
- **Webhook (входящий вебхук).** В URL зашит токен, `botToken` **обязателен** в каждом вызове.
  Подходит для быстрых тестов и одиночных интеграций.

> **Аналитика.** Для мультипортальной платформы берём **OAuth** — не нужно хранить `botToken`
> на каждый бот, доступ уже инкапсулирован в `PBXService`. `botToken` оставляем опциональным
> полем интерфейсов на случай вебхук-режима.

### 1.2. Режим доставки событий (`eventMode`)

При регистрации указывается `eventMode`:

- **`fetch`** (по умолчанию) — события копятся в очереди, мы их забираем `Event.get` (polling).
  **Публичный URL не нужен.**
- **`webhook`** — Bitrix сам шлёт POST на `webhookUrl` при каждом событии. Нужен публичный эндпоинт.

Подписка на события `ONIMBOTV2*` создаётся/обновляется/снимается **автоматически** при
`Bot.register / update / unregister` — ручной `event.bind` не нужен (и вреден).

> **Аналитика.** Для MVP и для интеграции «своего агента» проще **`fetch`** (как в `bitrix-im-bridge`):
> крон дёргает `Event.get` по каждому порталу, без публичной инфраструктуры. На рост нагрузки
> переключаемся на `webhook`, поменяв `eventMode` + `webhookUrl` через `Bot.update`.

### 1.3. Шаги (наш typed API)

```ts
// domain известен заранее (портал клиента)
const { bitrix } = await this.pbxService.init(domain);

// 1) Регистрация бота (идемпотентно — см. раздел 2.1)
const res = await bitrix.imBotV2Bot.register({
    fields: {
        code: 'april_support_bot',        // стабильный уникальный код в рамках приложения
        properties: {
            name: 'Apri Bot',
            workPosition: 'AI-ассистент',
        },
        type: 'bot',                      // bot | supervisor | personal | openline (см. 1.4)
        eventMode: 'fetch',               // fetch (polling) | webhook
        // webhookUrl: 'https://<наш-домен>/bot/events',  // только при eventMode='webhook'
    },
});
const botId = (res.result as { botId?: number }).botId; // сохраняем botId (в БД — позже, см. примечание)

// 2) Регистрация slash-команды (опционально)
await bitrix.imBotV2Command.register({
    botId,
    fields: { command: 'report', title: { ru: 'Отчёт', en: 'Report' }, common: true },
});

// 3a) fetch-режим: забираем события (по крону)
const events = await bitrix.imBotV2Event.get({ botId, offset: lastOffset, limit: 100 });

// 3b) Ответ в диалог
await bitrix.imBotV2Message.send({
    botId,
    dialogId: 'chat5',                    // 'chat{chatId}' для группы или '{userId}' для лички
    fields: { message: 'Привет! Чем помочь?' },
});
```

> **Примечание про БД.** `botId` (и при вебхуках — `botToken`) нужно где-то хранить, чтобы
> переиспользовать. Таблицы в БД создаёт владелец БД отдельно — **здесь мы их не трогаем**.

### 1.4. Типы ботов (`fields.type`) — влияет на видимость сообщений

| Тип | Поведение |
|---|---|
| `bot` (по умолчанию) | Отвечает на упоминание `@bot` в группах и на личные сообщения |
| `supervisor` | Видит **все** сообщения в чатах, где состоит, без упоминания |
| `personal` | Как `supervisor` (полный контекст), но скрыт из поиска у части пользователей. Рекомендован для AI-ассистентов |
| `openline` | Для открытых линий (внешние клиенты) |

`Chat.Message.get` по `replyId` и `Chat.Message.getContext` доступны **только** для `supervisor` и
`personal`. Для AI-ассистента, которому нужен контекст группового диалога, берём `personal`.

---

## 2. Создание и управление ботами

| Действие | Метод | Заметки |
|---|---|---|
| Создать | `bitrix.imBotV2Bot.register({ fields })` | `code` уникален в рамках приложения; вернёт `botId` |
| Список | `bitrix.imBotV2Bot.list()` | Все боты приложения на портале — основа идемпотентности |
| Получить | `bitrix.imBotV2Bot.get({ botId })` | |
| Обновить | `bitrix.imBotV2Bot.update({ botId, fields })` | Сменить имя, `eventMode`, `webhookUrl` |
| Удалить | `bitrix.imBotV2Bot.unregister({ botId })` | Снимает подписку на события |
| Ревизия API | `bitrix.imBotV2Revision.get()` | Проверка совместимости перед новыми методами |

### 2.1. Идемпотентная установка (аналитика)

Чтобы повторная установка приложения не плодила ботов:

1. `bitrix.imBotV2Bot.list()` → ищем бота с нашим `code`.
2. Есть → берём его `botId` (при необходимости `Bot.update`).
3. Нет → `Bot.register`.

Так установка безопасна при переустановке приложения на портал.

### 2.2. Лимиты (из документации Bitrix)

| Лимит | Значение |
|---|---|
| Ботов на приложение | **100** |
| Rate limit | **2 запроса/сек** на приложение (429 → экспоненциальный backoff) |
| Размер файла `File.upload` | 100 МБ |
| Длина сообщения | 20 000 символов |
| Событий за `Event.get` | 1–1000 (по умолчанию 100) |

---

## 3. Несколько ботов в одном приложении на портал

Это **штатный сценарий**: до **100 ботов на приложение**. Каждый бот независим.

- Регистрируем `Bot.register` **N раз с разными `code`** (`april_sales_bot`, `april_support_bot`, ...).
  Каждый возвращает свой `botId`.
- В OAuth-режиме все они привязаны к нашему приложению по `client_id` — отдельные `botToken` не нужны.
- Все вызовы (`Message.send`, `Command.register`, `Event.get`) принимают `botId` — указываем нужный.
- Подписки на события у каждого бота свои (управляются его `register/update/unregister`).

> **Аналитика.** Держим реестр `code → botId` на портал (в БД — когда появятся таблицы; пока в памяти/
> по `Bot.list`). Один бот = один сценарий/функционал. Для разных линий/отделов — разные боты с
> разными `code` и, при необходимости, разными `type` (например, `personal` для ассистента отдела и
> `openline` для внешней поддержки). В `fetch`-режиме polling идёт по каждому `botId` отдельно
> (свой `offset`).

### Важно про события при нескольких ботах

В `fetch`-режиме `Event.get` вызывается per-bot (`botId` обязателен) — события не смешиваются.
В `webhook`-режиме в payload приходит `botId` адресата — роутим по нему на нужный сценарий.

---

## 4. Стыковка со своим агентом (openclaw) — мультипортально

Идея: **один backend на все порталы**, агент общий, инстанс Bitrix — разный по `domain`.

```
Порталы A/B/C
   │  (fetch: крон Event.get  ИЛИ  webhook POST на наш эндпоинт)
   ▼
наш backend
   │  resolve портала: webhook → auth.domain;  fetch → знаем domain по реестру
   ▼
PBXService.init(domain) → bitrix (нужного клиента)
   │  нормализуем событие ONIMBOTV2MESSAGEADD → { domain, botId, dialogId, userId, text }
   ▼
openclaw (общий агент)  →  ответ
   ▼
bitrix.imBotV2Message.send({ botId, dialogId, fields:{ message, keyboard? } })
```

### 4.1. Цикл обработки (fetch-режим)

```ts
// крон по каждому порталу/боту
const { bitrix } = await this.pbxService.init(domain);
const { result } = await bitrix.imBotV2Event.get({ botId, offset: lastOffset, limit: 100 });

for (const ev of result.events ?? []) {
    if (ev.event === 'ONIMBOTV2MESSAGEADD') {
        const payload = ev.data as { dialogId?: string; message?: string; userId?: number };
        // индикатор «печатает» (UX)
        await bitrix.imBotV2Chat.inputActionNotify({ botId, dialogId: payload.dialogId! });

        // ВАЖНО: голосовые Bitrix распознаёт сам — в payload приходит уже текст.
        const userText = payload.message ?? '';

        const answer = await this.openclaw.handle({ domain, userId: payload.userId, text: userText });

        await bitrix.imBotV2Message.send({
            botId,
            dialogId: payload.dialogId!,
            fields: { message: answer },
        });
    }
}
// двигаем offset (подтверждаем обработанные события следующим вызовом Event.get с новым offset)
lastOffset = result.lastId ?? lastOffset;
```

### 4.2. События, которые обрабатываем (имена из документации)

`ONIMBOTV2MESSAGEADD` (входящее сообщение), `ONIMBOTV2COMMANDADD` (slash-команда),
`ONIMBOTV2JOINCHAT` (бот добавлен — приветствие), `ONIMBOTV2DELETE` (бот удалён — чистка),
`ONIMBOTV2MESSAGEUPDATE` / `ONIMBOTV2MESSAGEDELETE`, `ONIMBOTV2REACTIONCHANGE`,
`ONIMBOTV2CONTEXTGET`.

### 4.3. Что отдаёт агент обратно

- Текст — `fields.message` (BB-коды: жирный, ссылки, цитаты).
- Кнопки — `fields.keyboard` (массив кнопок) для сценарных шагов.
- Карточки — `fields.attach` (блоки: текст/картинки/грид).
- «Печатает…» — `imBotV2Chat.inputActionNotify`; включить/выключить поле ввода — `textField.enabled`.

> **Аналитика.** «Мозг» (openclaw или Vibecode chat/completions) — серверный, общий на все порталы.
> В него передаём только нормализованный контекст `{ domain, botId, dialogId, userId, text,
> entityContext? }`. Привязка к конкретному клиенту — исключительно через `domain` → `PBXService`.
> Так «один агент общается со всеми пользователями всех порталов», но доступы Bitrix у каждого свои.

### 4.4. Передача живому оператору

Если бот ведёт первую линию открытой линии (`type: 'openline'`), передать диалог оператору —
через отдельный namespace `imopenlines` (scope `imopenlines`):

```ts
await bitrix.imOpenlinesSession.transfer({ CHAT_ID: chatId, QUEUE_ID: queueId, LEAVE: 'Y' });
// или завершить сессию бота:
await bitrix.imOpenlinesSession.finish({ CHAT_ID: chatId });
```

Для внутренних сотрудников (не открытая линия) проще «тихая» передача: бот замолкает и шлёт
менеджеру уведомление обычным `Message.send`.

---

## 5. Чек-лист запуска бота на портале

- [ ] OAuth-приложение установлено на портал (есть `domain` + доступ через `PBXService`).
- [ ] `bitrix.imBotV2Bot.list()` — проверили, что бота с нашим `code` ещё нет (идемпотентность).
- [ ] `bitrix.imBotV2Bot.register({ fields:{ code, properties.name, type, eventMode } })` → сохранили `botId`.
- [ ] (опц.) `bitrix.imBotV2Command.register(...)` — slash-команды.
- [ ] `fetch`: крон `Event.get` по `botId` с продвижением `offset`. `webhook`: эндпоинт + `webhookUrl`.
- [ ] Ответы — `Message.send`; UX — `inputActionNotify`.
- [ ] Несколько ботов — разные `code`, до 100 на приложение.
- [ ] Учли rate limit 2 rps/приложение (backoff на 429).

---

## Источники (Bitrix REST, Chatbots 2.0)

- [Chatbots 2.0 — обзор раздела](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/index.html) (типы ботов, режимы событий, лимиты, авторизация)
- [Quick Start](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/quick-start.html)
- [`imbot.v2.Bot.register`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/bots/bot-register.html)
- [`imbot.v2.Event.get`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/events/event-get.html) + [События `ONIMBOTV2*`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/events/events.html)
- [`imbot.v2.Chat.Message.send`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/messages/chat-message-send.html), [клавиатуры](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/messages/message-keyboards.html), [вложения](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/messages/attachments/index.html)
- [`imbot.v2.Command.register`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/commands/command-register.html)
- [`imbot.v2.File.upload` / `download`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/files/index.html)
- [`imbot.v2.Revision.get`](https://apidocs.bitrix24.com/api-reference/chat-bots/chat-bots-v2/imbot.v2/revision-get.html)
- [Открытые линии — боты (`imopenlines.bot.session.*`)](https://apidocs.bitrix24.com/api-reference/imopenlines/openlines/chat-bots/index.html)
