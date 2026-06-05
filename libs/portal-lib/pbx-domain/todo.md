вынести сюда блоком все модули которые связаны portal-db-bitrix
но не содержат сам битрикс перенести сюда
apps\back\src\modules\pbx-domain - это слой как раз записывать bitrixId
определенных сущностей в db
bitrixId в них уже как правило передают из вне

пример
есть приложение bitrix-install
оно наводит синхронизацию между битриксом и текущей библиотекой. текущая библиотека именно для записи и работы с нашей db
параллельно где то есть библиотека bitrix - это просто битрикс


пример два
после того как install произошлел
мы пользуемся тем что записали в db - берем через данный модуль по кодам различные сущности, их филды и тп
и потом достаем из них bitrixId чтобы взять или записать в конкретный битрикс
приложение например
apps\back\src\apps\event-sales
берет по идее из этого модуля данные типа таких apps\back\src\modules\pbx-domain\field\type\sales\event\pbx-sales-event-field.type.ts
чтобы взять чисто коды

потом по этим кодам из Portal(по domain) берет реальные bitrixId
и потом только с этими конкретными bitrixId может ходить уже в конкретный битрикс и что то делать с ним

причем одни и теже такие поляя, паттерны, коды, стадии и тд могут быть потом для подобной работы нужны для разных приложений отсюда
C:\Projects\April\april-next\back\apps


apps\back\src\modules\pbx-registry - вот это вообще удалить надо будет

apps\back\src\modules\pbx-sales-kpi-list - это должна остаться только типизиация филдов чтоб знать все их коды

---

# ПЛАН ПЕРЕХОДА (зафиксировано 2026-06-03)

## Назначение libs/pbx-domain
Чистый слой PortalDB: репозитории + Portal*Service + типы филдов/кодов/стадий.
Пишет/читает bitrixId сущностей в БД April. САМ В BITRIX НЕ ХОДИТ.
Зависит только от: libs/core (PrismaService @/core/prisma) + libs/bitrix (только enum
EUserFieldType, без вызовов) + libs/pbx (резолв по domain — нужен лишь install-сервисам,
которые сюда НЕ переезжают).

## Решение по данным (выбрано)
Вариант 1: общий libs/pbx-domain + libs/core(Prisma). apps/pbx-install ходит в ту же БД
напрямую через эту lib. Контракт через API/очередь — отклонён. Отдельный libs/prisma НЕ нужен
(PrismaService уже в libs/core, generated/prisma — клиент).

## Текущее состояние (что уже есть)
- nest-cli.json: 8 apps + 6 libs. libs/bitrix, libs/pbx, libs/core, libs/shared — выделены.
- apps/pbx-install — СКЕЛЕТ-КОПИЯ apps/back/src/modules/pbx-install, ещё НЕ развязан:
  - main.ts сломан (import ./bitrix.module — остаток), tsconfig outDir=dist/apps/bitrix.
  - нет app.module.ts.
  - импорты резолвятся в apps/back через @/modules/pbx-install/* и @/modules/pbx-domain.
- pbx-domain используется 126 раз по репо (admin, event-sales, kpi-list…) → место в lib.
- ПРОТЕЧКА СЛОЯ: field/services/install/* (pbx-field-entity-install, pbx-field-smart-install)
  тянут PBXService+BitrixService и сами ходят в Bitrix (@deprecated) → их в apps/pbx-install,
  НЕ в lib.

## Фазы (strangler, монолит держим зелёным, после каждой — pnpm run lint)
Ф0. Починить скелет pbx-install: рабочий main.ts (BigInt-патч, ValidationPipe,
    ResponseInterceptor, GlobalExceptionFilter, Swagger, CORS из apps/back/src/main.ts),
    app.module.ts, выправить outDir в tsconfig.app.json. Цель: app стартует.
Ф1. Выделить libs/pbx-domain: алиас @/modules/pbx-domain → libs/pbx-domain/src (как уже
    сделано для bitrix/pbx), project в nest-cli.json, перенести modules/pbx-domain БЕЗ
    install-сервисов. 126 потребителей не ломаются (алиас перенаправляем).
Ф2. Развязать apps/pbx-install: импорты @/modules/pbx-install/* → относительные/@app/pbx-install;
    install-сервисы из домена + portal-store сюда; затем удалить старую копию в apps/back.
Ф3. Чистка по todo: удалить pbx-registry (проверить 0 потребителей), ужать pbx-sales-kpi-list
    до типов, разобраться с @deprecated install-сервисами.
Ф4. Инфра/деплой: общий Redis для rate-limit Bitrix + кэша портала между процессами,
    Dockerfile/CI на pbx-install, маршрутизация /api/pbx-*.
