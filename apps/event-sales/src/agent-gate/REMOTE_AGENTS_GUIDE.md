# Удалённые агенты-аналитики звонков: подключение, скиллы, ключи

Инструкция для настройки внешнего «мозга» (OpenClaw / claude-code на своём
сервере), который постфактум глубоко анализирует звонки поверх нашего
конвейера и наполняет смарт-процесс «AI-анализ звонков».

## Как устроено (два контура)

```
Контур 1 (наш бэк, apps/event-sales, автоматика):
  cron 30 мин → voximplant.statistic.get (длинные звонки)
    → дедуп (transcriptions.dedup_key) → очередь CALL_REPORT
    → транскрибация (длинные → Yandex, короткие → Vibecode Whisper)
    → GigaChat RAG (resume + recomendation)
    → БД (transcriptions + ais) + резюме в таймлайн сделки

Контур 2 (ваш сервер, OpenClaw/claude-code, по расписанию агента):
  GET  /api/agent/calls                 ← какие звонки ждут анализа
  GET  /api/agent/calls/{id}            ← пакет: транскрипт + GigaChat +
                                          сделка/компания/контакт + кандидаты
                                          записей отчётов (sales_history)
  GET  /api/agent/knowledge/...         ← скрипты/материалы по типу звонка
  POST /api/agent/calls/{id}/analysis   → push-back: анализ агента
    → у нас: запись в ais + элемент смарт-процесса со всеми связями
```

Base URL — приложение event-sales (env `GLOBAL_PREFIX=api`), т.е.
`https://<host-event-sales>/api/agent/...`.

## 1. Ключи доступа (защита эндпоинтов + изоляция порталов)

Все `/api/agent/*` закрыты guard'ом по заголовку `x-agent-api-key`.

1. Сгенерируйте ключ на каждого агента:
   `openssl rand -hex 32` (или `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Пропишите в env event-sales (`apps/event-sales/.env` или прод-секреты):

   ```
   AGENT_API_KEYS=claw-gsr:9f2c...:gsr.bitrix24.ru,claw-garant:aa10...:april-garant.bitrix24.ru
   ```

   Формат записи: `имя:ключ[:domain1|domain2]` через запятую.
   - **Имя** попадает в `ais.provider` и в поле смарта «Имя агента» — видно,
     какой агент какой анализ сделал.
   - **Домены** (третья часть, опционально) — ИЗОЛЯЦИЯ ПОРТАЛОВ: ключ видит
     звонки, пакеты и клиентскую базу знаний ТОЛЬКО своих доменов (чужая
     транскрипция — 404, чужой domain-параметр — 403). На сервере с
     несколькими клиентами (gsr, april-garant) каждому агенту — свой ключ
     со своим доменом; ключ без доменов — полный доступ, только для
     доверенного общего оркестратора.
   - Отзыв ключа = убрать запись из env и перезапустить event-sales.
3. Агент шлёт заголовок в каждом запросе:

   ```
   x-agent-api-key: 9f2c...64hex
   ```

## 2. Контракт эндпоинтов (кратко; полный — в Swagger event-sales)

### GET /api/agent/calls?domain=&limit=20
Звонки со статусом done без анализа агента. Ответ: массив
`{ transcriptionId, domain, activityId, callId, callStartedAt, durationSec,
dealId, provider, textLength, hasAgentAnalysis }`.

### GET /api/agent/calls/{transcriptionId}
Полный пакет:
- `transcript` — текст звонка;
- `aiResults[]` — первичные анализы (`call-resume` / `call-recomendation`
  от GigaChat RAG);
- `deal` / `company` / `contact` — сырые поля Bitrix;
- `historyCandidates[]` / `kpiCandidates[]` — записи списков ОП История и
  ОП KPI в окне ±14 дней вокруг звонка. **Семантическое сопоставление**
  «какая запись отчётности относится к этому звонку» — задача скилла;
  выбранное вернуть в `historyItem` / `kpiItem` (id + confirmed/suspected),
  прочее связанное — в `relatedReportIds`;
- `dealCandidates` — активные сделки компании по воронкам ОП:
  `salesBase` (основная), `salesPresentation`, `salesXo` — кандидаты для
  `relatedDeals`;
- `companyFields[]` — словарь pbx-полей компании портала (code → UF-имя +
  enum-элементы): по нему расшифровываются сырые статусы компании
  (`op_prospects`, `op_work_status` и т.п.) из `company`.

В конвейер попадают только звонки менеджеров отдела продаж (фильтр
bx-department; выключается env `CALL_REPORT_SALES_ONLY=0`).

### GET /api/agent/knowledge/kinds → список типов материалов
### GET /api/agent/knowledge?kind=presentation&domain=... → список документов
### GET /api/agent/knowledge/all?kind=presentation&domain=... → **тексты всех
документов типа одним запросом** (сначала общие general, затем kind;
с `domain` — с перекрытием клиентской базой портала). Это основной
эндпоинт для скилла: перед анализом презентации заберите
`kind=presentation` нужного портала — там скрипты и методички.

### POST /api/agent/calls/{transcriptionId}/analysis
Тело (типизировано, валидируется):

```json
{
  "callType": "presentation",   // cold|call|presentation|decision|payment|other
  "productive": true,
  "interlocutorRole": "lpr",            // lpr|user|secretary|other
  "sentiment": "neutral",               // positive|neutral|negative
  "nextStep": { "set": true, "description": "Презентация, подключает главбуха", "date": "2026-07-24" },
  "priceDiscussed": false,
  "competitors": ["consultant"],        // закрытый справочник конкурентов
  "objectionCategories": ["price"],     // price|timing|need|trust|authority|hidden
  "riskFlags": [],                      // promise|conflict|compliance|client_negative
  "refusalCategory": null,              // price|competitor|no_decision|qualification_issue|execution_issue
  "talkRatioPct": 52,
  "questionsCount": 9,
  "weightedScore": 62,                  // Σ(score×relevance)/Σrelevance×10; можно не слать — посчитаем
  "scriptCompliance": 70,
  "coachingPriority": "planned",        // urgent|planned|none
  "summary": "…резюме агента…",
  "needsFound": true,
  "needs": ["судебная практика по 44-ФЗ"],
  "presentationDone": true,
  "productsOffered": ["Гарант Универсал"],
  "objections": [{ "objection": "дорого", "handling": "сравнение тарифов", "handled": true,
                    "category": "price", "quote": "у нас Консультант стоит, зачем второй",
                    "outcome": "continued" }],
  "sections": [
    { "section": "GREETING",     "relevance": 100, "score": 8, "analysis": "…", "advice": "…" },
    { "section": "NEEDS",        "relevance": 100, "score": 6, "analysis": "…", "advice": "…" },
    { "section": "PRESENTATION", "relevance": 100, "score": 5, "analysis": "…", "advice": "…" },
    { "section": "OBJECTIONS",   "relevance": 100, "score": 6, "analysis": "возражение «дорого» ← потребности выявлены поверхностно ← контакт формальный", "advice": "как ответить / альтернативы / что потренировать" },
    { "section": "PRICE",        "relevance": 0 },
    { "section": "CLOSING",      "relevance": 100, "score": 7 },
    { "section": "REFUSAL",      "relevance": 0 }
  ],
  "speechAnalysis": "Презентация без связок «свойство-связка-выгода»: перечислялись функции…",
  "recommendations": ["выслать КП", "перезвонить в четверг"],
  "score": 6,
  "scoreExplanation": "Хороший контакт, но презентация без выгод и цена не отработана…",
  "employeeRecommendations": "Потренировать связку свойство-выгода на 3 продуктах…",
  "relatedDeals": { "presentationDealId": 12346, "xoDealId": 12347 },
  "kpiItem":     { "itemId": "9001",  "status": "confirmed" },
  "historyItem": { "itemId": "10231", "status": "suspected" },
  "relatedReportIds": ["10234"],
  "agentVersion": "call-analyst-v3",
  "flow": {
    "report": { "resultStatus": "result" },
    "plan": { "isPlanned": true, "typeCode": "presentation",
              "name": "Провести презентацию", "deadlineDate": "2026-07-24" }
  },
  "extra": { "scriptCompliance": 80 }
}
```

Про `sections` — семь формализованных разделов (GREETING, NEEDS,
PRESENTATION, OBJECTIONS, PRICE, CLOSING, REFUSAL). `relevance` (0–100) —
насколько раздел вообще применим к ЭТОМУ типу звонка: в холодном звонке
«Работа по цене» = 0 (не оцениваем вовсе), а в звонке по решению/оплате
цена ОБЯЗАНА быть оценена, даже если менеджер не работал с ней совсем
(это и будет низкий score). Оценка `score` ставится только при
relevance > 0. `analysis` — разбор с причинными цепочками («возражение ←
слабые потребности ← слабый контакт»), `advice` — как надо было ответить,
альтернативы, что потренировать.

Результат push-back: запись в ais + элемент смарта со всеми полями и
связями (сделка-родитель, компания, контакт, менеджер, crm-связи на
сделки воронок, привязки к спискам, транскрипт кусками) + **дубль
краткого разбора в таймлайн сделки**.

`flow` — опциональный черновик события в кодах event-sales
(report.resultStatus: result|noresult|expired; noresultReasonCode:
secretar|nopickup|busy|…; plan.typeCode: cold|warm|presentation|hot|
moneyAwait|supply). Это «как агент заполнил бы отчёт менеджера»: копится
в БД (ais.report_result) для оценки качества и будущей автоотправки в
POST /event-sales/flow (переходное состояние — по утверждению менеджера);
сейчас в endpoint НЕ отправляется. Заполняйте всегда, когда уверены.

Ответ: `{ aiId, smartItemId, smartInstalled }`. Если смарт не установлен
на портале — анализ сохранится только в БД (`smartItemId: null`), элемент
можно будет долить позже повторным push-back.

## 3. Смарт-процесс на портале

Установка (идемпотентна, из const-конфига
`apps/event-sales/src/call-report/config/call-report-smart.config.ts`):

```
POST /api/call-report/install-smart  { "domain": "april-garant.bitrix24.ru" }
```

Состав полей будет меняться — это нормально: добавьте поле в конфиг и
повторите вызов, добавятся только отсутствующие. Элементы видны вкладкой
на карточке сделки (relations.parent DEAL) + список/канбан/фильтры Bitrix.

## 4. Настройка агента на OpenClaw

OpenClaw крутится на вашем сервере, скиллы — markdown-файлы с инструкциями.
Рабочая схема:

1. В конфиге агента заведите env: `APRIL_AGENT_URL`, `APRIL_AGENT_KEY`.
2. Скилл `call-analyst` (файл skills/call-analyst/SKILL.md), скелет:

   ```markdown
   # Скилл: глубокий анализ звонков Гарант

   Ты — аналитик звонков отдела продаж «Гарант».

   Алгоритм:
   1. GET $APRIL_AGENT_URL/api/agent/calls?limit=10 (заголовок x-agent-api-key: $APRIL_AGENT_KEY)
   2. Для каждого звонка: GET /api/agent/calls/{transcriptionId}
   3. Определи тип звонка (cold/warm/presentation/decision/payment/other).
   4. GET /api/agent/knowledge/all?kind={тип}&domain={domain} — скрипт этого
      типа звонка для этого портала. Сверь разговор со скриптом.
   5. Проанализируй: потребности, презентация, продукты, возражения и их
      отработка, рекомендации менеджеру, оценка 1-10.
   6. Из historyCandidates выбери записи отчётов, относящиеся к этому
      звонку по смыслу (сделка, дата, содержание) → relatedReportIds.
   7. POST /api/agent/calls/{transcriptionId}/analysis с результатом.
      В agentVersion передавай версию этого скилла.

   Критерии оценки (Гарант): проход секретаря vs разговор с ЛПР; факт
   презентации; результативность; работа с возражениями; договорённость
   о следующем шаге; зафиксированы ли контакты.
   ```

3. Запуск по расписанию — cron OpenClaw (например каждые 30–60 минут):
   «выполни скилл call-analyst». Дедуп на нашей стороне: уже
   проанализированные звонки в GET /agent/calls не возвращаются, а
   повторный push-back по звонку идемпотентен — вернётся уже сохранённый
   анализ, дубликатов ais-записей и смарт-элементов не будет (если смарт
   доустановили позже, ретрай дольёт недостающий элемент).

### Вариант на чистом claude-code (без OpenClaw)

crontab на сервере:

```
*/45 * * * * cd /opt/call-analyst && claude -p "$(cat skill.md)" --dangerously-skip-permissions >> log.txt 2>&1
```

где skill.md — та же инструкция; ключ и URL — в env процесса.

## 5. Самообучение скиллов

Два механизма, оба уже работают:

1. **Материалы у нас** — kind-папки базы знаний (`/api/agent/knowledge`).
   Загрузка: админка → «База знаний AI» (front/apps/admin, страница
   /ai-knowledge) или POST admin/ai-rag/knowledge/{kind}. Соглашение по
   kind: general (общее), cold, warm, presentation, decision, payment +
   свои. С `domain` — материалы конкретного портала-клиента (перекрывают
   общие). Агент всегда читает свежие версии — «дообучение» скилла =
   загрузка нового документа, без деплоя.
2. **Версия скилла** — поле `agentVersion` в push-back. Меняете промпт
   скилла — повышайте версию; потом по `ais.user_result->agentVersion`
   сравнивайте качество разборов между версиями.

## 6. Env-переменные конвейера (event-sales)

См. блок в `apps/event-sales/.env.example`: kill-switch
`CALL_REPORT_CRON_ENABLED`, allowlist `CALL_REPORT_DOMAINS`, пороги
длительности/бюджета, роутинг транскрибаторов
(`TRANSCRIPTION_PROVIDER=auto`, `TRANSCRIPTION_YANDEX_MIN_SEC`),
таймауты Vibecode, `AGENT_API_KEYS`.

## 7. Чек-лист запуска пилота

1. Применить env: `AGENT_API_KEYS`, `CALL_REPORT_DOMAINS=<пилотный домен>`,
   `CALL_REPORT_CRON_ENABLED=1`.
2. `POST /api/call-report/install-smart` для пилотного домена.
3. Смоук одного звонка: `POST /api/call-report/analyze`
   `{domain, activityId, dealId}` → проверить строку в transcriptions,
   две ais-записи GigaChat, резюме в таймлайне сделки.
4. Ручной скан: `POST /api/call-report/scan {domain}` → проверить очередь.
5. С сервера агента: `GET /api/agent/calls` c ключом → увидеть звонок,
   забрать пакет, сделать тестовый push-back → проверить элемент смарта
   на карточке сделки.
6. Включить cron агента.
