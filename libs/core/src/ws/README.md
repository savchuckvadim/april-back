# WebSocket (socket.io) в монорепе

Единый socket.io-шлюз для «серверных пушей» браузеру: тяжёлый расчёт идёт
в фоне (Bull-очередь), результат прилетает клиенту по сокету, а не по
HTTP-ответу. Живёт в `@lib/core` (@Global-модуль) — любой backend-модуль
инжектит `WsService` без импортов.

## Архитектура

```
Браузер (WSClient)  ──socket.io(websocket)──►  WsGateway ── WsService
   .emit / .on                                  (handle*)    (Map socketId→Socket,
                                                              server, rooms)
```

- **Gateway** `ws.gateway.ts` — `@WebSocketGateway({ cors: true })`, namespace
  по умолчанию `/`, **без авторизации** (любой клиент принимается).
  `handleConnection`/`handleDisconnect` регистрируют/убирают сокет в
  `WsService`. Инбаунд-хендлеры: `room:join` / `room:leave` (см. Комнаты).
- **Service** `ws.service.ts` — держит `Map<socketId, Socket>` и `server`.
  ⚠️ **In-memory, одна реплика**: без `@socket.io/redis-adapter` состояние
  и комнаты не шарятся между инстансами. Сейчас деплой single-replica.
- **Клиент** `@workspace/ws` (`front/packages/ws`) — `WSClient(userId, domain,
  host)`; `userId`/`domain` пока НЕ шлются в handshake (auth закомментирован),
  подключение анонимное, транспорт только `websocket`. API: `on/off/emit/
  disconnect`, геттер `.id`, публичный `.socket`.
- **Хост WS = хост REST** kpi-report-sales: во фронте `resolveWsHost()` =
  `NEXT_PUBLIC_KPI_SALES_API_URL` (`app/model/store.ts`).

## Два способа доставки

### 1. Per-socketId (основной паттерн — отчёты)

Клиент кладёт свой `socket.id` в тело REST-запроса (`safeSocketId()` во
фронте); воркер очереди по завершении зовёт `WsService.sendToClient(socketId,
{ event, data })` — прилетает ровно тому браузеру, что запросил. Комнаты НЕ
используются.

Потребители:
| Событие | Откуда шлётся | Кто слушает (kpi-sales) |
|---|---|---|
| `sales-finance:closed-sales:done` / `:error` | `sales-finance/queue/sales-finance.processor.ts` | `entities/finance/model/listeners/finance-ws.listener.ts` |
| `sales-finance:hot-clients:done` / `:error` | там же | там же |
| `sales-user-report:progress` / `:done` | `user-report/queue/sales-user-report.processor.ts` | `entities/user-report/model/listeners/app.listener.ts` |

Инициализация во фрейме: `appInit` → `initWSClient(userId, domain)` +
`setAppData`; listeners поднимаются по `appActions.setAppData`
(`start-store-listeners.ts`), ждут коннекта (`waitForConnection`), навешивают
`.on(...)`. **Публичная страница `/share` WS НЕ поднимает** (у неё HTTP).

### 2. Комнаты (presence публичных ссылок)

Generic-примитив (ADDITIVE, per-socketId потоки не трогает):
- Gateway `@SubscribeMessage('room:join' | 'room:leave')` → `client.join/leave`.
- `WsService.emitToRoom(room, event, data)` → `server.to(room).emit`.

Presence публичных ссылок (`share-link`):
- Владелец во фрейме вступает в СВОЮ комнату `share-presence:{domain}:{creatorId}`
  (`report-links/model/listeners/share-presence.listener.ts`) и слушает
  `share:presence`.
- Публичный зритель шлёт HTTP-heartbeat (`POST /kpi-report/share/public/:token/
  ping`, через Next-прокси — WS у публики НЕ поднимаем!); контроллер после
  `presence.heartbeat` эмитит `share:presence {token, online}` в комнату
  владельца (`share-link-public.controller.ts` + `lib/presence-room.util.ts`).
- В событии — **только счётчик**, никаких данных отчёта.
- **Уход зрителя мгновенный**: страница шлёт `navigator.sendBeacon` на
  `POST /kpi-report/share/public/:token/leave` при `pagehide`/скрытии вкладки
  → бэк `ZREM` зрителя из ZSET сразу и пушит новый счётчик владельцу (не ждём
  протухания TTL 45с). TTL остаётся backstop'ом на случай, если beacon не
  дошёл (краш/сеть). Поллинг списка в диалоге — второй backstop.

## Правила / каветы

- Новые серверные пуши — через `sendToClient` (адресно) или `emitToRoom`
  (комната). НЕ городить свой gateway на том же namespace.
- Публику к WS НЕ подключаем: снимок и heartbeat идут через Next-прокси, бэк
  наружу не светится.
- Multi-replica потребует `@socket.io/redis-adapter` (иначе комнаты/`clients`
  Map разъедутся по инстансам). Отметить перед горизонтальным масштабированием.
- `WSClient` handshake анонимный — не полагаться на identity из сокета;
  identity идёт в теле REST-запроса.

## Как протестировать / логи

- **Логи gateway**: `room:join`/`room:leave` логируются (id + комната);
  `WsService.sendToClient` логирует адрес и событие.
- **Presence-смоук** (node + socket.io-client, one-shot): owner-сокет
  `emit('room:join', 'share-presence:{domain}:{creatorId}')`, слушает
  `share:presence`; шлём 2 HTTP-`/ping` с разными `viewerId` → приходят
  `{online:1}`, `{online:2}`; заодно проверяем, что владелец НЕ получает
  чужих `sales-finance:*` (per-socketId изоляция).
- **Регресс отчётов**: открыть отчёт/вкладку Финансы во фрейме — данные
  приходят по WS как раньше (per-socketId); presence-комнаты на это не влияют.
