# @lib/ai-presets — облачные AI-сервисы «по одному ключу»

Лист-библиотека без Nest-модуля: константы и чистые функции, которые нужны
одновременно шлюзу LLM (`@lib/llm-gateway`), транскрибации (`call-lib`) и
чек-листу «Поставщики AI» в админке. Выделена отдельно, потому что между
`call-lib` и `llm-gateway` прямой зависимости нет (через `portal-lib` вышел бы
цикл), а дублировать имена env и адреса нельзя.

## Groq (`groq.preset.ts`)

| Env | Что | По умолчанию |
|---|---|---|
| `GROQ_API_KEY` | ключ из console.groq.com; без него пресет не участвует | — |
| `GROQ_MODEL` | модель разборов (`/chat/completions`) | `openai/gpt-oss-120b` |
| `GROQ_WHISPER_MODEL` | модель транскрибации (`/audio/transcriptions`) | `whisper-large-v3-turbo` |

Куда подключён:

- `envEndpointOf` в `@lib/llm-gateway` — запасной LLM, когда нет явных
  `LLM_FALLBACK_*` и `CLOUDRU_API_KEY` (Cloud.ru в РФ важнее);
- `whisperEnvSettingsOf` в `call-lib` — общий Whisper-совместимый резерв,
  когда нет явного `TRANSCRIPTION_WHISPER_BASE_URL`;
- чек-лист готовности в `apps/admin` — через те же две функции.

`api.groq.com` за рубежом: хост должен быть в `EGRESS_PROXY_HOSTS`
(`@lib/egress-proxy`), иначе из РФ не ответит. Лимит файла на бесплатном
тарифе Groq — 25 МБ (≈25 минут mp3), длинные записи резерв не вытянет.

## Модели облаков по хосту (`cloud-whisper-models.ts`)

`cloudWhisperModelOf(baseUrl)` — модель транскрибации по умолчанию, когда
портал задал в админке только адрес облака: Groq → `whisper-large-v3-turbo`,
OpenAI → `whisper-1`; свой сервер → `null` (берётся общий дефолт).
