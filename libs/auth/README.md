# @lib/auth — переиспользуемая авторизация

Библиотека авторизации для приложений монорепо (`apps/*`). Сейчас закрывает
единственного администратора (**SuperUser**), чьи учётные данные лежат в `.env`.
Спроектирована с заделом под будущую клиентскую авторизацию (пользователь,
привязанный к `client` + `portal` Bitrix).

> Не путать с `@lib/bitrix-auth` — та про OAuth-токены приложения **к самому
> Bitrix**, а не про авторизацию наших пользователей.

## Что внутри

- **Модель:** Login/Password → JWT. `POST /auth/login` принимает учётные данные,
  возвращает access-токен. Защищённые эндпоинты валидируют `Authorization: Bearer <token>`.
- **Гарды:** ручные `CanActivate` на `@nestjs/jwt` (без passport). Регистрируются
  глобально (`APP_GUARD`) — поэтому **все эндпоинты приложения защищены по умолчанию**.
- **Выключатель:** `AUTH_ENABLED` (по умолчанию `false`). Выключено → всё работает
  как раньше, в `request.user` подставляется системный субъект.
- **SSO между приложениями:** общий `AUTH_JWT_SECRET` у admin и pbx-install →
  токен, выданный одним, валиден в другом. Это НЕ микросервис: общий лишь код +
  секрет, у каждого приложения свой процесс/DI.

## Подключение

Один раз в корневом модуле приложения:

```ts
import { AuthModule } from '@lib/auth';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true /* ... */ }),
        AuthModule.forRoot(), // опции читаются из .env (см. ниже)
        // ...
    ],
})
export class AppModule {}
```

`AuthModule` — `@Global` и регистрирует глобальные гарды (`JwtAuthGuard` →
`RolesGuard`). Опции собираются из `process.env` **на этапе DI** (через
`useFactory`), уже после загрузки `ConfigModule`.

## Переменные окружения

Общие (в корневом `/.env`, одинаковые для всех приложений → SSO):

| Переменная           | По умолчанию | Назначение                                            |
| -------------------- | ------------ | ----------------------------------------------------- |
| `AUTH_ENABLED`       | `false`      | Глобальный выключатель авторизации.                   |
| `AUTH_JWT_SECRET`    | dev-фолбэк   | Секрет подписи JWT (общий для admin/pbx-install).     |
| `AUTH_JWT_EXPIRES_IN`| `12h`        | Время жизни access-токена.                            |
| `SUPERUSER_LOGIN`    | —            | Логин администратора.                                 |
| `SUPERUSER_PASSWORD` | —            | **bcrypt-хэш** пароля (не открытый текст).            |

Защита страницы Swagger UI (per-app, в `apps/<app>/.env`) — реализована в
`bootstrapApp` (`@lib/core`):

| Переменная             | По умолчанию | Назначение                          |
| ---------------------- | ------------ | ----------------------------------- |
| `SWAGGER_AUTH_ENABLED` | `false`      | HTTP Basic-защита страницы доков.   |
| `SWAGGER_USER`         | —            | Логин для входа в Swagger UI.       |
| `SWAGGER_PASSWORD`     | —            | Пароль для входа в Swagger UI.      |

Генерация bcrypt-хэша пароля:

```bash
pnpm run auth:hash -- 'ваш-пароль'
```

## Публичный API (`index.ts`)

```ts
import {
    AuthModule,            // подключение в корневом модуле
    Public,                // @Public()  — открыть эндпоинт (пропустить гард)
    Roles,                 // @Roles(Role.SUPER_USER) — ограничение по роли
    CurrentUser,           // @CurrentUser() / @CurrentUser('login')
    Role,                  // enum ролей
    type AuthUser,         // субъект из request.user
    AuthService,           // вход/представление субъекта
    AuthTokenService,      // sign/verify JWT (для будущей клиентской auth)
} from '@lib/auth';
```

### Примеры

```ts
// Открытый эндпоинт (без токена):
@Public()
@Post('webhook')
handleWebhook() { /* ... */ }

// Только для SuperUser:
@Roles(Role.SUPER_USER)
@Get('admin/stats')
stats(@CurrentUser() user: AuthUser) { /* ... */ }
```

## Эндпоинты

| Метод | Путь            | Доступ   | Описание                              |
| ----- | --------------- | -------- | ------------------------------------- |
| POST  | `/api/auth/login` | `@Public` | Вход SuperUser, выдаёт access-токен.  |
| GET   | `/api/auth/me`    | Bearer    | Данные текущего субъекта.             |

`GET /api/health` всегда открыт (см. `publicPaths` в опциях) — нужен для
docker healthcheck.

## Как временно отключить авторизацию

Выставить `AUTH_ENABLED=false` (или убрать переменную) — гарды начнут пропускать
все запросы, подставляя системного субъекта в `request.user`. Перевыпуск кода не
требуется.

## Тесты

```bash
pnpm jest libs/auth
```

Покрыто: выпуск/проверка токена, вход SuperUser (верные/неверные креды,
несконфигурированный SuperUser), поведение гардов (`@Public`, выключенная auth,
`publicPaths`, валидный/невалидный Bearer), проверка ролей.

## Задел на будущее (клиентская авторизация)

`AuthUser` уже содержит опциональные `clientId` / `portalId`, `Role.CLIENT`
зарезервирована, `AuthTokenService` экспортируется наружу. Когда понадобится вход
клиентов (привязка к `client` + `portal`), достаточно добавить соответствующий
сервис входа и стратегию валидации, не меняя контракт гардов и декораторов.
Существующая клиентская auth в `apps/back/src/apps/bitrix-app-client/auth` —
отдельная и этой библиотекой не затрагивается.

### Когда выделять отдельное auth-приложение (микросервис)

`bitrix-app-client` планируется вынести в `apps/*`. **Это не повод делать
отдельный auth-сервис.** Объединяющий слой — это **библиотека** `@lib/auth`, а не
сетевой сервис:

- **Сейчас / при выносе клиента:** новый app подключает `@lib/auth` так же, как
  admin и pbx-install, и добавляет клиентский login-флоу (`Role.CLIENT`) в эту
  библиотеку. Общий `AUTH_JWT_SECRET` → токен валиден во всех приложениях без
  сетевого вызова (проверка токена уже живёт в библиотеке). Это де-факто единый
  auth, но без оверхеда микросервиса.
- **Отдельное auth-приложение оправдано позже**, когда появятся: централизованный
  отзыв сессий/токенов, единый UI входа на несколько бэкендов, управление
  пользователями, роль OAuth-провайдера. Тогда это приложение **выпускает**
  токены, остальные — только **проверяют** (тем же кодом из `@lib/auth`). Переход
  из текущей схемы минимальный: централизуется лишь выпуск + хранилище
  пользователей.

Вывод: пока — проще (общая библиотека + общий секрет); выделенный auth-app — это
следующий этап, к которому архитектура уже подготовлена.
```


## Portal-context сессия фрейма Bitrix24 (`portal-session/`)

Для приложений, которые живут во фрейме Bitrix24 и принимают `domain` и
`requesterUserId` в теле запроса (kpi-report-sales → ai-analytics): подписи
запроса раньше не было, тело можно было подменить. Теперь фронт обменивает
`access_token` + `domain` из `BX24.getAuth()` на JWT библиотеки, а guard
сверяет тело с сессией.

- `PortalSessionApiModule` — ручка `POST auth/portal-session` (тело
  `PortalSessionOpenDto`: `domain`, `accessToken`, `memberId?`). Сервер
  проверяет токен живым REST-вызовом `profile` на портале
  (`BitrixProfileClient`, без зависимости от libs/bitrix) и выпускает JWT
  `role=CLIENT` с claim-ами `domain`, `bitrixUserId`, `isAdmin`
  (`PortalSessionService`). Подключается один раз в корневом модуле
  приложения.
- `PortalSessionModule` — сервисная половина (сервис + `PortalSessionGuard`);
  импортируется feature-модулями, чьи ручки помечены
  `@PortalSessionProtected()` (guard + описания 401/403 в Swagger).
- Guard требует `Authorization: Bearer <jwt>` роли CLIENT и сверяет
  `body.domain` с `domain` токена, `body.requesterUserId` — с `bitrixUserId`.
  Токен без claim-а домена к ручкам с доменом в теле не допускается.
- Режим `PORTAL_SESSION_GUARD_MODE` (`AuthModuleOptions.portalSession.guardMode`):
  `off` — проверок нет; `report` (по умолчанию) — нарушения в лог, запрос
  проходит (выкатка бэка раньше фронта); `enforce` — 401 / 403. Не зависит
  от `AUTH_ENABLED`.
- Секрет подписи общий (`AUTH_JWT_SECRET` / `APP_SECRET_KEY`), поэтому
  сессия, открытая одним приложением, валидна в другом; срок —
  `AUTH_JWT_EXPIRES_IN`.

Отличие от сессии маркетплейса (`apps/pbx`): одноразовый код не нужен —
фронт получает AUTH_ID от SDK фрейма сам, а не через redirect-URL роутера.
Тесты: `libs/auth/src/portal-session/__tests__/`.
