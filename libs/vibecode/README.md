# @lib/vibecode — точка доступа к VibeCode API

Переиспользуемая библиотека доступа к [vibecode.bitrix24.tech](https://vibecode.bitrix24.tech)
(AI-платформа Bitrix): транскрибация звонков и структурированный
LLM-анализ. Единственное место в монорепе, которое ходит в VibeCode —
любые новые потребители подключают её, а не пишут свои fetch'и.

## Подключение

```ts
import { VibecodeModule } from '@lib/vibecode';

@Module({
    imports: [VibecodeModule],
})
export class SomeModule {}
```

С импортом приезжают:

| Сервис | Что делает |
|---|---|
| `VibeCodeClient` | HTTP-клиент: `transcribeAudio` (Whisper), `analyzeTranscript` (структурированный анализ звонка со strict JSON-схемой, flow-коды event-sales), `classifyCall` (тип звонка + роль собеседника + confidence; инструкция подменяема параметром) |
| `VibeKeyResolverService` | Резолюция API-ключа по домену портала |

## Ключи — только из БД портала

Ключ VibeCode пер-портальный: `Portal.keys.vibeKey` (хранится шифрованно,
заводится в админке `admin/portal/:portalId/keys`). `VibeKeyResolverService.resolve(domain)`
отдаёт расшифрованный ключ (кэш в памяти 60с, `invalidate()` после смены
ключа). Env-переменной ключа НЕТ (BITRIX_VIBE_TEST выпилен 2026-07-23) —
у каждого клиента свои ключи и квоты.

Все методы клиента принимают ключ явным параметром `apiKey` — клиент
сам не знает домена и не хранит ключей:

```ts
const apiKey = await this.vibeKeyResolver.resolve(domain);
const text = await this.vibecode.transcribeAudio(buffer, fileName, apiKey);
```

## Конфигурация (env потребителя)

| Переменная | Default | Что |
|---|---|---|
| `VIBECODE_TRANSCRIBE_TIMEOUT_MS` | 600000 | таймаут транскрибации (длинные файлы Whisper обрабатывает минутами) |
| `VIBECODE_ANALYSIS_TIMEOUT_MS` | 180000 | таймаут chat/completions |

## Модели

- Транскрибация: `bitrix/deepdml/faster-whisper-large-v3-turbo-ct2`
- Анализ/классификация: `bitrix/bitrixgpt-5.5`

## Потребители в монорепе

- конвейер call-report (`TranscriptionProviderModule` — Whisper-транскрибация
  коротких звонков, классификация типа звонка);
- ручной флоу call-analysis (`CallAnalysisModule` — анализ звонков сделки
  с задачей-подтверждением);
- очередь bitrix-transcribe (транскрибация по запросу из Bitrix-приложения).

Старые пути импорта из `@lib/call-lib` работают через шимы обратной
совместимости; новый код импортирует из `@lib/vibecode`.

## Зависимости

Только `@lib/portal-lib/store` (ключи портала). В `apps/*` библиотека не
смотрит — переносится в любой app импортом модуля.
