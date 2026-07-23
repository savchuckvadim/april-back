# @lib/ai-rag — LLM-анализ с RAG (провайдеры, оркестратор, база знаний)

Библиотека LLM-анализа: несколько провайдеров за единым интерфейсом,
RAG-контекст из базы знаний, объединённый анализ звонка одним вызовом.

## Состав

| Часть | Файлы | Что |
|---|---|---|
| Оркестратор | `application/llm-orchestrator.service.ts` | выбор провайдера по `LlmModel` (gigachat/openai/ollama/fake); методы `resume`, `recomendation`, `analyzeCall` |
| Провайдеры | `infrastructure/providers/*` | реализуют `LlmProvider`; GigaChat — основной (семафор `GIGACHAT_CONCURRENCY`, map-reduce длинных транскриптов) |
| Объединённый анализ | `application/combined-call-analysis.service.ts` | резюме+рекомендации ОДНИМ вызовом (маркеры секций, парсинг кодом, fallback на два вызова); порог `GIGACHAT_COMBINED_MAX_CHARS` (default 12000) |
| База знаний | `infrastructure/knowledge/*`, `knowledge-content.service.ts` | файлы по (source: shared/домен, kind); клиентская база перекрывает общую; текст для промптов/агента |
| Вектор-стор | `infrastructure/vector-store/*` | in-memory индекс с персистом на диск, ключ = (провайдер, source, kind, hash контента) |
| Промпты | `domain/prompts/*` | системные промпты resume/recomendation/combined, map-reduce промпты |

## Подключение

```ts
import { AiRagModule } from '@lib/ai-rag';
// imports: [AiRagModule] → LlmOrchestratorService, KnowledgeContentService,
// KnowledgeStorageService (+ контроллеры /ai-rag/*)
```

## База знаний: соглашение по kind

Kind — свободный слаг (`[a-z][a-z0-9-]*`), загрузка:
`POST /ai-rag/knowledge/{kind}` (общая) или с `domain` (клиентская).
Занятые контуром звонков kind'ы:

| Kind | Кто читает |
|---|---|
| `resume`, `recomendation` | RAG-контекст объединённого анализа (контур 1) |
| `call-classify` | подменная инструкция классификатора (замещает дефолт) |
| `call-analysis-<тип>` | инструкция глубокого анализа типа звонка (ночной агент, из `knowledgeKind` профиля типа) |
| `call-type-registry` | JSON-реестр типов звонков: общий документ + клиентский поверх; без документов — встроенный реестр (`CallTypeRegistryService` в call-lib) |
| `general` | общие материалы (подмешиваются к любому kind) |

Реестр kind'ов с описаниями — `GET /admin/ai-rag/knowledge/kinds`
(`KNOWN_KNOWLEDGE_KINDS`); текстовое редактирование документов —
`POST /admin/ai-rag/knowledge/{kind}/text` (upsert .md/.txt/.json без
multipart, с `domain` — в клиентскую базу).

## Env

`GIGACHAT_API_KEY`, `GIGACHAT_CONCURRENCY` (2),
`GIGACHAT_COMBINED_MAX_CHARS` (12000),
`GIGACHAT_CHUNK_TRANSCRIPT_OVER_CHARS` (900, порог map-reduce),
`OPENAI_API_KEY`, `OLLAMA_BASE_URL`, `AI_RAG_VECTORSTORE_PATH`.
