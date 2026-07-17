# Call Analysis Module

AI-анализ телефонных звонков из CRM Bitrix24: транскрибация → анализ → подтверждение в Bitrix.

## Что делает модуль

Берёт записи звонков из активностей (`activity`) сделки в Bitrix24, расшифровывает их через **Vibecode Whisper**, прогоняет расшифровку через **BitrixGPT** для извлечения структурированного результата (резюме, итог, настроение клиента, договорённости и т.д.), и возвращает обратно в Bitrix:

1. **Комментарий в таймлайне сделки** — форматированное BBCode-сообщение с резюме и расшифровкой
2. **Задача на подтверждение** для ответственного — с чек-листом (был ли звонок результативным, запланирован ли следующий контакт, подтверждение данных AI)
3. **Уведомление в чат** ответственного — с прямой ссылкой на задачу

Полностью повторяет логику фронтового приложения `event-sales` (где менеджер вручную заполнял форму после звонка), но автоматически на основе расшифровки.

## Архитектура

```
call-analysis/
├── clients/
│   └── vibecode.client.ts          # HTTP-клиент Vibecode (Whisper + LLM)
├── services/
│   └── call-analysis-bitrix.service.ts  # обёртка над BitrixService (НЕ @Injectable)
├── use-cases/
│   └── call-analysis.use-case.ts   # оркестратор всего флоу
├── controllers/
│   └── call-analysis.controller.ts # REST endpoints
├── dto/
│   ├── call-sales-analysis.dto.ts  # результат анализа
│   └── call-analysis-request.dto.ts # входные DTO
└── call-analysis.module.ts
```

### Почему `CallAnalysisBitrixService` не `@Injectable()`

В проекте `BitrixService` создаётся через `PBXService.init(domain)` для каждого портала (домена) отдельно — у разных клиентов разные вебхуки. Если хранить `this.bitrix` в синглтоне с `@Injectable()`, при параллельных запросах от разных порталов возникает **race condition** (один портал перезатирает инстанс другого).

Поэтому `CallAnalysisBitrixService` создаётся через `new CallAnalysisBitrixService(bitrix)` внутри use-case'а после `pbx.init(domain)`. См. `CLAUDE.md` и `BITRIX_DOMAIN_MODULE_GUIDE.md`.

## Конфигурация

Переменная окружения в `.env`:

```env
BITRIX_VIBE_TEST=vibe_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Ключ выпускается в личном кабинете [vibecode.bitrix24.tech](https://vibecode.bitrix24.tech).

Используемые модели:
- **Транскрибация**: `bitrix/deepdml/faster-whisper-large-v3-turbo-ct2` (бесплатная)
- **Анализ**: `bitrix/bitrixgpt-5.5` (структурированный вывод JSON schema)

## API

### POST `/call-analysis/deal`

Анализирует последние N звонков по сделке.

**Тело запроса** (`AnalyzeDealCallsDto`):
```json
{
  "domain": "april-garant.bitrix24.ru",
  "dealId": 12345,
  "limit": 3
}
```

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| `domain` | string | да | Домен портала Bitrix24 |
| `dealId` | number | да | ID сделки |
| `limit` | number | нет | Сколько последних звонков обработать (по умолчанию 3) |

**Ответ**: `CallSalesAnalysisDto[]` — массив результатов по каждому звонку.

### POST `/call-analysis/activity`

Анализирует один конкретный звонок (активность).

**Тело запроса** (`AnalyzeActivityDto`):
```json
{
  "domain": "april-garant.bitrix24.ru",
  "activityId": 98765,
  "dealId": 12345
}
```

**Ответ**: `CallSalesAnalysisDto` — результат анализа.

## Структура результата (`CallSalesAnalysisDto`)

```ts
{
  activityId: number;          // ID активности-звонка
  dealId: number;              // ID сделки
  transcript: string;          // полная расшифровка
  confirmationTaskId?: number; // ID созданной задачи на подтверждение
  analysis: {
    summary: string;                  // краткое резюме
    wasProductive: boolean;           // был ли звонок результативным
    callOutcome: 'заинтересован' | 'отказ' | 'перенос' | 'нет_ответа' | 'другое';
    nextCallPlanned: boolean;         // запланирован ли следующий контакт
    nextCallDate: string | null;      // YYYY-MM-DD или null
    nextCallGoal: string | null;
    clientSentiment: 'positive' | 'neutral' | 'negative';
    clientNeeds: string[];            // выявленные потребности
    objections: string[];             // возражения
    keyPoints: string[];              // ключевые моменты
    agreedActions: string[];          // договорённости
  }
}
```

## Внутренний pipeline

`CallAnalysisUseCase.processAudioFile()` для каждого аудиофайла выполняет:

1. `bx.downloadAudioBuffer(downloadUrl)` — скачивание файла (требует предварительного `batch.file.get` для получения свежего `DOWNLOAD_URL`)
2. `vibecode.transcribeAudio(buffer, fileName)` — расшифровка через Whisper
3. `vibecode.analyzeTranscript(transcript)` — JSON-структурированный анализ через BitrixGPT
4. `bx.saveAnalysisToTimeline(...)` — комментарий в таймлайн сделки
5. `bx.createConfirmationTask(...)` — задача с чек-листом для ответственного
6. `bx.notifyResponsible(...)` — IM-уведомление со ссылкой на задачу

## Пример использования из кода

```ts
@Injectable()
export class SomeService {
    constructor(private readonly callAnalysis: CallAnalysisUseCase) {}

    async analyzeDealCalls(domain: string, dealId: number) {
        const results = await this.callAnalysis.forDeal({
            domain,
            dealId,
            limit: 5,
        });

        console.log(`Проанализировано звонков: ${results.length}`);
        for (const r of results) {
            console.log(`Активность ${r.activityId}: ${r.analysis.callOutcome}`);
        }
    }
}
```

Не забудь импортировать `CallAnalysisModule` в свой модуль:

```ts
@Module({
    imports: [CallAnalysisModule],
    providers: [SomeService],
})
export class MyModule {}
```

## Ограничения и заметки

- **Время выполнения**: транскрибация ~30 секунд аудио = 5–15 секунд. На батче из 3+ звонков HTTP-запрос может занять несколько минут — для боевого использования рекомендуется обернуть в очередь (`QueueNames.CALL_ANALYSIS` уже зарезервировано).
- **Размер аудио**: модуль скачивает файл целиком в Buffer. Для очень длинных звонков (>50 MB) это может потребовать много памяти.
- **Цена**: Whisper-модель бесплатна, BitrixGPT тарифицируется по токенам — см. кабинет Vibecode.
- **Язык анализа**: system-prompt и `enum`-значения зафиксированы на русском. Для другого языка нужно править `CALL_ANALYSIS_SCHEMA` и `ANALYSIS_SYSTEM_PROMPT` в `vibecode.client.ts`.
- **Webhook от Bitrix** (`ONVOXIMPLANTCALLEND`) не подключён — пока только ручной триггер через REST.

## TODO / Phase 2

- [ ] Очередь Bull для асинхронной обработки (использовать `QueueNames.CALL_ANALYSIS`)
- [ ] Webhook `ONVOXIMPLANTCALLEND` для автоматического запуска после завершения звонка
- [ ] Хук на завершение задачи подтверждения → отправка результата в исходный flow `event-sales`
- [ ] Тесты (unit + интеграционные с моком Vibecode)
- [ ] Метрики: количество обработанных звонков, средняя длительность транскрибации, стоимость
