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
| `openai-compatible` | любой OpenAI-совместимый endpoint: Cloud.ru Evolution, Yandex AI Studio, свой vLLM/Ollama | креды портала `llmBaseUrl / llmKey / llmModelName` важнее env `LLM_FALLBACK_BASE_URL / LLM_FALLBACK_API_KEY / LLM_FALLBACK_MODEL`, а тот — важнее `CLOUDRU_API_KEY` контура 1 |
| `ai-rag` | модели оркестратора контура 1 (GigaChat, Cloud.ru, Ollama, OpenAI) через `LlmOrchestratorService.complete`: без RAG, схема дописывается в промпт, ответ разбирается как JSON | модель — `LLM_AI_RAG_MODEL`, иначе `llmModel` портала, иначе gigachat; **в порядок по умолчанию не входит** — `LLM_PROVIDER_ORDER=vibecode,openai-compatible,ai-rag` после проверки согласия на выборке |

Порядок — настройка портала `llmProviderOrder` (админка → настройки AI портала;
`LlmProviderOrderResolver`), иначе env `LLM_PROVIDER_ORDER` (по умолчанию
`vibecode,openai-compatible`). Портал со своим ключом в ключах портала
(`llmKey / llmBaseUrl / llmModelName`) ставит `['openai-compatible', 'vibecode']`
и платит за токены сам; остальные идут как приложение. Поменять порядок =
переключить основной провайдер без выкладки.
`LLM_FALLBACK_JSON_MODE=json_object` — для моделей без strict JSON schema
(схема дописывается в системный промпт). `LLM_FALLBACK_TIMEOUT_MS` — таймаут (180 000).

## Поведение при сбоях

- Ошибка провайдера → следующий по порядку; отказали все — одна ошибка со всеми
  причинами (`LLM недоступна для call_focus_form (домен): vibecode — HTTP 502 …;
  openai-compatible — не настроен …`).
- Предохранитель (`LlmCircuitBreakerService`): `LLM_CIRCUIT_FAILURES` (5)
  временных сбоев (5xx/429/408/сеть/таймаут) за `LLM_CIRCUIT_WINDOW_SEC` (600) →
  провайдер на паузе `LLM_CIRCUIT_COOLDOWN_SEC` (300), шлюз сразу идёт к запасному;
  переходы «отключён» / «снова отвечает» — в телеграм один раз на все реплики.
  Постоянные ошибки (400 схема, 401 ключ, 402/403 квота) предохранитель не
  считает — они про настройку портала.
- Если на паузе все настроенные провайдеры — пробуем их по порядку (полуоткрытое
  состояние): попытка лучше гарантированного отказа.
- Без Redis состояние предохранителя живёт в памяти процесса; ошибка Redis —
  провайдер считается включённым.
