# presentation-flow — смарт «Презентации»

Сайд-поток event-sales: ведёт элементы смарт-процесса **«Презентации»**
(`pres_sales`) отдельной очередью ПОСЛЕ основного отчёта менеджера.
Архитектурно — полное зеркало [`../zpr-flow`](../zpr-flow/README.md)
(сознательно: чинится одно — чинится одинаково в обоих), поэтому здесь
описаны ОТЛИЧИЯ, а общие механики — по ссылкам на README ЗПР.

Важно: смарт живёт ПАРАЛЛЕЛЬНО сделкам воронки «ОП Презентации» — сделки
продолжает вести основной flow, смарт их не заменяет и не отменяет
(легаси-список «ОП Презентации» ведёт Laravel-хук — решение владельца
27.08). Что умеет элемент, чего не умеет сделка: своя история
комментариев, СВОЙ снимок анкеты «5К»/«Хвост» на каждую презентацию,
раздельные «назначил»/«провёл», счётчик переносов.

---

## Бизнес-процесс словами

Презентация проходит больше состояний, чем ЗПР — у неё есть контур
СОГЛАСОВАНИЯ и явный исход отчёта (`outcome`):

```
  заявка (руками) ──► на согласовании (руками)
        │                   │
        ▼                   ▼
   ┌──────────── «Запланирована» pres_plan ◄─── план (kind='plan')
   │                        │
   │ перенос (outcome       │ отчёт (kind='report', outcome)
   │  = expired)            │
   ▼                        ├────────────────┬───────────────────┐
«Перенос» pres_pending      ▼                ▼                   ▼
(открытая, живёт дальше) «Проведена»    «Отказ после        «Не состоялась»
                         pres_success    презентации»        pres_noresult
                                         pres_rejected
```

Открытые стадии — ЧЕТЫРЕ (заявка, на согласовании, план, перенос), и они
берутся из константы смарта `PRESENTATION_OPEN_STAGE_CODES`, а не
перечисляются в коде: забытая стадия означала бы, что отчёт по ждущей
согласования заявке заводит спонтанный дубль.

1. **План** (`kind='plan'`): создаётся элемент в «Запланирована» с
   раздельными «кто назначил» (`PRES_PLAN_RESPONSIBLE`) и «кто проводит»
   (`PRES_RESPONSIBLE`); элемент привязывается к план-задаче.
2. **Отчёт** (`kind='report'`): исход приезжает полем `outcome`
   ([lib/presentation-outcome.ts](lib/presentation-outcome.ts) — правило
   «исход → код стадии» живёт там, это продуктовая таблица):
   - `done/success` → «Проведена» + дата проведения + снимок анкеты
     «5К»/«Хвост» + причина отказа не пишется;
   - `fail` → «Отказ после презентации» (если встреча состоялась) или
     «Не состоялась» + снимок причины отказа (`PRES_FAIL_REASON`, enum по
     коду справочника);
   - `noresult` → «Не состоялась»;
   - `expired` (перенос) → элемент живёт дальше в «Переносе»: счётчик
     `PRES_MOVE_COUNT` +1, `PRES_MOVE_DATE` = когда перенесли,
     `PRES_NEXT_CALL_DATE` = на когда (два РАЗНЫХ факта — легаси-список
     хранил только второй).
3. **Спонтанная** (`isSpontaneous` или открытого элемента нет): элемент
   создаётся сразу в стадии исхода с `PRES_IS_SPONTANEOUS='Y'`. Спонтанная
   НЕ закрывает чужой открытый элемент — как unplanned pres-сделка.

Итоговый enum `PRES_RESULT` пишется на каждом закрытии/переносе (числовым
id значения справочника — Битрикс не принимает код).

### Анкеты — два разных механизма

- **Снимок «5К»/«Хвост»** (`job.survey`) — состояние клиента на момент
  ЗАВЕРШЁННОЙ презентации; на переносе НЕ пишется (её ещё не было).
- **Ответы портальной анкеты** (`job.answers`) — пишутся и на переносе:
  перенос это тоже отчёт менеджера, элемент открыт, и ответы в нём честны.
  На переносе едут обе анкеты (`plan`+`report`): план-джоба у переноса нет
  вовсе, новым планом стал этот же элемент.

---

## Как джоб попадает сюда

Тот же конвейер, что у ЗПР (см.
[README ЗПР → «Как джоб попадает сюда»](../zpr-flow/README.md)):
`EventReportPostFlowService` → билдер
[presentation-flow-job.builder.ts](../event-report/services/post-flow/presentation-flow-job.builder.ts)
→ очередь `EVENT_SALES_PRESENTATION_FLOW` →
[processor](presentation-flow.processor.ts) →
[use-case](use-cases/presentation-flow.use-case.ts). Специфика джоба
презентаций: `outcome`, `isSpontaneous`, `tmcDealId`,
`planResponsibleId`, `failReasonCode`, `survey`.

---

## Карта модулей: куда идти при ремонте

| Файл | Ответственность | Идти сюда, когда… |
|---|---|---|
| [use-cases/presentation-flow.use-case.ts](use-cases/presentation-flow.use-case.ts) | Гейт «смарт установлен?», подготовка прогона, роутинг plan/report, привязка к задаче | джоб пропускается целиком; элемент не привязался к задаче |
| [services/pres-element-writer.service.ts](services/pres-element-writer.service.ts) | ЗАПИСЬ: create/close/move/spontaneous, лента, PRES_RESULT | элемент создался/закрылся/перенёсся не так |
| [services/pres-element-lookup.service.ts](services/pres-element-lookup.service.ts) | ЧТЕНИЕ: какой открытый элемент «тот самый» | закрылась чужая презентация; дубль вместо закрытия |
| [services/pres-stage.resolver.ts](services/pres-stage.resolver.ts) | СТАДИИ: аксессор, открытые, stageId исхода | не та стадия; «не считается открытой» |
| [services/pres-element-fields.builder.ts](services/pres-element-fields.builder.ts) | ПОЛЯ: UF-ключи, setUf/setEnum, снимок 5К, причина отказа, ответы анкеты | значение/enum не записались; ответ не доехал |
| [services/pres-element-links.builder.ts](services/pres-element-links.builder.ts) | СВЯЗИ: три контура + `PRES_TMC_DEAL` + флаг `PRES_IS_OUR_REQUEST` | пустые связи; пустой «Клиент»; нет вкладки |
| [services/pres-backlink.service.ts](services/pres-backlink.service.ts) | Обратная ссылка `op_presentations` на сделке/компании | из сделки не видно её презентаций |
| [presentation-flow.processor.ts](presentation-flow.processor.ts) | Bull-воркер: гейт повтора, WS `presentation-flow:done` | джоб дважды / фронт не получил done |
| [dto/presentation-flow-job.dto.ts](dto/presentation-flow-job.dto.ts) | Контракт джоба | нужно новое поле из контекста |
| [lib/presentation-outcome.ts](lib/presentation-outcome.ts) | ПРОДУКТОВАЯ таблица «outcome → стадия/результат/перенос?» | меняются правила исходов |
| [lib/presentation-survey-snapshot.ts](lib/presentation-survey-snapshot.ts) | Состав снимка «5К»/«Хвост» | меняется состав снимка |
| [types/presentation-flow-run.type.ts](types/presentation-flow-run.type.ts) | `PresentationFlowRun` + имя потока `pres-flow` | — |

Реестр смарта:
[`libs/portal-lib/pbx/pbx-presentation-smart`](../../../../../libs/portal-lib/pbx/pbx-presentation-smart/type/pbx-presentation-smart.type.ts)
— коды полей/стадий, типы `PresentationSmartFieldCode` /
`PresentationSmartStageCode`, `PRESENTATION_OPEN_STAGE_CODES`.

---

## Ключевые механики — общие с ЗПР

Описаны один раз в [README ЗПР](../zpr-flow/README.md), здесь работают
байт-в-байт так же:

1. **Резолв элемента от ПРИВЯЗКИ ЗАДАЧИ** (`T{hex}_{id}` из
   `UF_CRM_TASK`), эвристика по клиенту — только фолбэк для легаси; слово
   задачи финально. Единственное отличие — `isSpontaneous` пропускает
   поиск вовсе (спонтанная фиксирует НОВУЮ презентацию).
2. **Три контура связи**: наши crm-поля / родители `parentId*` /
   системный «Клиент» `companyId`+`contactIds`. У презентаций к первому
   контуру добавлены `PRES_TMC_DEAL` (связь с ТМЦ-сделкой напрямую — после
   отказа от pres-сделок обходной путь исчезнет) и флаг
   `PRES_IS_OUR_REQUEST` при наличии лида.
3. **Формат crm-значений по настройкам поля** (`buildCrmLinkValue`) и
   толерантное чтение обоих поколений (`hasCrmLink`).
4. **Идемпотентность**: jobId `{operationId}:presentation:{kind}` + гейт
   повторной доставки.
5. **Честные деградации**: skipped без смарта (+WARN о потере ответов),
   отчёт без смены стадии при недоустановленной воронке, дотяжка
   `baseDealId` по компании, WARN вместо падения на украшениях.

---

## Тесты

Плоско в [`__tests__/`](__tests__/):

- `presentation-flow.use-case.spec.ts` — флоу целиком через `handle()`
  (гейт, план, все исходы отчёта, перенос, спонтанная, согласование,
  привязка задачи ПОБЕЖДАЕТ свежий открытый, any-match эвристики,
  контракт listAll: серверный фильтр стадий + узкий select);
- `presentation-flow.processor.spec.ts` — гейт повтора и WS;
- `presentation-survey-snapshot.spec.ts` — состав снимка «5К»/«Хвост».

Правила исходов и общие примитивы связей покрыты в своих модулях
(`lib/presentation-outcome` — внутри use-case-спеки;
[`const-smart-registry/__tests__/crm-link-value.spec.ts`](../../../../../libs/portal-lib/pbx/const-smart-registry/__tests__/crm-link-value.spec.ts)).
