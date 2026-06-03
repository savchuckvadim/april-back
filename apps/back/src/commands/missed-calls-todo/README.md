# Missed Calls Todo

Модуль каждые 10 минут проверяет пропущенные входящие звонки в портале
`gsirk.bitrix24.ru` (или в домене из `MISSED_CALLS_PORTAL_DOMAIN`).

Если звонок привязан к компании или лиду:
- создается todo-активность через `crm.activity.todo.add` для ответственного;
- ответственному отправляется сообщение в чат с перечнем сущностей.

## Условия запуска

- `WITH_SCHEDLER=true` - cron включен.
- если `WITH_SCHEDLER=false`, модуль ничего не выполняет.

## Настройки

- `MISSED_CALLS_PORTAL_DOMAIN=gsirk.bitrix24.ru`
- `MISSED_CALLS_LOOKBACK_MINUTES=20`

## Логика фильтрации звонков

- `TYPE_ID = 2` (звонок)
- `PROVIDER_ID = VOXIMPLANT_CALL`
- `DIRECTION = 2` (входящий)
- `COMPLETED = N`
- дополнительно отсеивается `STATUS = 2`
- сущность должна быть `COMPANY` или `LEAD`
