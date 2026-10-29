# @lib/vendor-settings — контракт и реестр настроек вендора

Лист-библиотека без Nest-модуля (как `@lib/ai-presets`): токен DI
`VENDOR_SETTINGS_READER`, интерфейс `VendorSettingsReader` и реестр
`VENDOR_SETTINGS` — какие настройки уровня April можно задать в админке,
их русские названия, описания, инструкции «где взять» и проверки.

Ключ настройки = имя переменной окружения, которую она перекрывает:
значение из админки (таблица `vendor_settings`) важнее env, пусто — действует
env. Секреты хранятся зашифрованными и наружу отдаются маской.

| Группа | Ключи |
|---|---|
| Исходящий прокси за рубеж | `EGRESS_PROXY_URL`, `EGRESS_PROXY_TOKEN` (секрет), `EGRESS_PROXY_HOSTS` |
| Ключи AI-сервисов приложения | `GROQ_API_KEY`, `CLOUDRU_API_KEY` (секреты) |
| Модуль поддержки | `ANTHROPIC_API_KEY` (секрет; подключение модуля — следующий шаг) |

Реализация читателя (БД + env + кэш в минуту + шифрование) и админ-роуты —
в `libs/portal-lib/store/vendor-settings` (`VendorSettingsModule` глобальный,
`VendorSettingsAdminModule` только в apps/admin). Потребители
(`EgressProxyService`, `LlmEndpointResolverService`, Whisper-сервис, чек-лист
админки) инжектят читатель через `@Optional() @Inject(VENDOR_SETTINGS_READER)`
и без него работают по env, как раньше (`envOnlyReader`).

Добавить настройку = строка в `VENDOR_SETTINGS` (+ чтение её в потребителе);
миграций не нужно.
