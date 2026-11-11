# @lib/llm-gateway — шлюз структурных LLM-вызовов

Зачем: весь «умный» разбор звонков (классификация, глубокий разбор, три
фокуса и синтез, ночной ревизор, проверка по регламенту, сверка презентаций)
ходил напрямую в VibeCode Битрикса. Если VibeCode ломается или резко дорожает,
спрыгнуть было некуда. Шлюз делает провайдера настройкой
(план `ai/tasks/2026-10-28-ai-provider-resilience-plan.md`).

## Как пользоваться

```ts
imports: [LlmGatewayModule]
constructor(private readonly llm: StructuredLlmGateway) {}

const { result, usage, model, provider } =
    await this.llm.structuredCompletionWithUsage(
        systemPrompt, userContent, 'call_focus_form', SCHEMA, domain, { model },
    );
```

Сигнатуры повторяют `VibeCodeClient.structuredCompletion*`, только пятый
аргумент — **домен портала**, а не ключ: ключи и endpoint'ы шлюз резолвит сам.
`provider` в ответе — кто реально ответил (`LLM_PROVIDER_AIS_CODE` даёт код для
колонки `provider` таблицы ais).

## Провайдеры и порядок

| Код | Что это | Настройка |
|---|---|---|
| `vibecode` | VibeCode Битрикса, BitrixGPT | `Portal.keys.vibeKey` (админка → ключи портала) |
| `openai-compatible` | любой OpenAI-совместимый endpoint: Cloud.ru Evolution, Groq, Yandex AI Studio, свой vLLM/Ollama | креды портала `llmBaseUrl / llmKey / llmModelName` важнее своего запасного поставщика `LLM_FALLBACK_BASE_URL / LLM_FALLBACK_API_KEY / LLM_FALLBACK_MODEL` («Настройки приложения»), а тот — важнее `CLOUDRU_API_KEY` контура 1; последним — `GROQ_API_KEY` (Groq, `openai/gpt-oss-120b`, за рубежом — через прокси; пресет в `@lib/ai-presets`) |
| `ai-rag` | модели оркестратора контура 1 (GigaChat, Cloud.ru, Ollama, OpenAI) через `LlmOrchestratorService.complete`: без RAG, схема дописывается в промпт, ответ разбирается как JSON | модель — `LLM_AI_RAG_MODEL`, иначе `llmModel` портала, иначе gigachat; **в порядок по умолчанию не входит** — `LLM_PROVIDER_ORDER=vibecode,openai-compatible,ai-rag` после проверки согласия на выборке |

Порядок — настройка портала `llmProviderOrder` (админка → настройки AI портала;
`LlmProviderOrderResolver`), иначе env `LLM_PROVIDER_ORDER` (по умолчанию
`vibecode,openai-compatible`). Портал со своим ключом в ключах портала
(`llmKey / llmBaseUrl / llmModelName`) ставит `['openai-compatible', 'vibecode']`
и платит за токены сам; остальные идут как приложение. Поменять порядок =
переключить основной провайдер без выкладки.
`LLM_FALLBACK_JSON_MODE=json_object` — для моделей без strict JSON schema
(схема дописывается в системный промпт). `LLM_FALLBACK_TIMEOUT_MS` — таймаут (180 000).

## Настройки — в админке

С 11.11.2026 настройки шлюза задаются в «Настройках приложения» админки
(`@lib/vendor-settings`, реестр `vendor-settings.llm.ts`): значение из админки
важнее env с тем же именем, читатель кэширует таблицу на минуту — правка
действует без выкладки и перезапуска. Env — только запасной путь.

| Группа в админке | Ключи |
|---|---|
| Ключи AI-сервисов приложения | `CLOUDRU_API_KEY`, `GROQ_API_KEY`, свой запасной поставщик `LLM_FALLBACK_BASE_URL / _API_KEY / _MODEL / _JSON_MODE / _TIMEOUT_MS` |
| Разборы звонков: очередь к модели, ожидание и предохранитель | `VIBECODE_ANALYSIS_TIMEOUT_MS` (180 000, 30 000–300 000), `LLM_VIBECODE_KEY_CONCURRENCY` (6), `LLM_VIBECODE_CONCURRENCY` (12), `LLM_CIRCUIT_FAILURES` (5), `LLM_CIRCUIT_WINDOW_SEC` (600), `LLM_CIRCUIT_COOLDOWN_SEC` (300) |

Читает их `LlmGatewaySettingsService` (разбор и значения по умолчанию —
`llm-gateway-settings.util.ts`, диапазоны — `LLM_INTEGER_SETTING_RULES` реестра:
админка проверяет по ним же), срок ответа на разбор — `VibeCodeClient`. Число
вне диапазона (старое значение env) становится ближайшей границей, мусор —
значением по умолчанию. `LLM_PROVIDER_ORDER` и `LLM_AI_RAG_MODEL` пока в env.

## Поведение при сбоях

- Ошибка провайдера → следующий по порядку; отказали все — одна ошибка со всеми
  причинами (`LLM недоступна для call_focus_form (домен): vibecode — HTTP 502 …;
  openai-compatible — не настроен …`). Это `LlmUnavailableError`: в `failures` —
  сорвавшиеся вызовы по порядку попыток и временный ли сбой, в `primary` —
  основной поставщик (первый настроенный). `isTransientLlmError` считает её
  временной по ОСНОВНОМУ поставщику: его последняя попытка сорвалась временно
  или его не пустили (пауза, проба уже шла). Запасной основного не перекрывает:
  429 бесплатного Groq не делает временным негодный ответ VibeCode, 413
  запасного — постоянным таймаут VibeCode; по тексту судить нельзя. По этому
  признаку конвейер звонков не зовёт цельную страховку, когда фокус-разбор
  оборвался на поставщике (11.11.2026).
- Предохранитель (`LlmCircuitBreakerService`): `LLM_CIRCUIT_FAILURES` (5)
  временных сбоев (5xx/429/408/сеть/таймаут) за `LLM_CIRCUIT_WINDOW_SEC` (600) →
  провайдер на паузе `LLM_CIRCUIT_COOLDOWN_SEC` (300), шлюз сразу идёт к запасному;
  переходы «отключён» / «снова отвечает» — в телеграм один раз на все реплики.
  Постоянные ошибки (400 схема, 401 ключ, 402/403 квота) предохранитель не
  считает — они про настройку портала.
- Если на паузе все настроенные провайдеры — пробуем их по порядку (полуоткрытое
  состояние): попытка лучше гарантированного отказа. Проба — одна за раз на все
  реплики (`tryStartProbe` / `endProbe`, замок в Redis): остальные вызовы сразу
  получают отказ «проба уже идёт» и уходят в догон, а не стоят волной до
  таймаута у зависшего поставщика.
- Вызов, который ждал очереди к VibeCode, перед отправкой перепроверяет паузу
  (`LlmSendGuard.beforeSend`): поставщик встал на паузу, пока вызов ждал, —
  запрос не уходит (`LlmProviderPausedError`, сбоем не считается), шлюз идёт к
  следующему.
- Без Redis состояние предохранителя живёт в памяти процесса; ошибка Redis —
  провайдер считается включённым.

## Сколько запросов к VibeCode разом

Адаптер `vibecode` держит ограничитель (`llm-concurrency.util.ts`, 11.11.2026):
одновременно не больше `LLM_VIBECODE_KEY_CONCURRENCY` (6) запросов на ключ
портала и `LLM_VIBECODE_CONCURRENCY` (12) на процесс приложения, остальные ждут
слота по очереди. Пределы перечитываются на каждом вызове (`setLimits`): выросли —
ждущие сразу получают слоты, уменьшились — идущие доделываются, новые ждут.
Таймаут `VIBECODE_ANALYSIS_TIMEOUT_MS` начинается после
получения слота; ожидание — не сбой для предохранителя. Сколько вызов ждал,
адаптер отдаёт в `queueMs` ответа, журнал шлюза пишет это отдельно:
«ответ за N мс, ждал слота M мс».

## Прокси за рубеж

Адаптер `openai-compatible` ходит через `EgressProxyService` (@lib/egress-proxy):
если хост endpoint'а (например, `api.openai.com`, `api.groq.com`) перечислен в
`EGRESS_PROXY_HOSTS`, запрос уходит на наш прокси на европейском сервере;
Cloud.ru, Yandex AI Studio и свои vLLM — напрямую. Чек-лист готовности в админке
(`GET admin/portal/:portalId/ai-providers/readiness`, apps/admin) показывает для
каждого провайдера портала: настроен ли, чей ключ, хост и пойдёт ли через прокси;
`?probe=true` дополнительно делает GET /models.
