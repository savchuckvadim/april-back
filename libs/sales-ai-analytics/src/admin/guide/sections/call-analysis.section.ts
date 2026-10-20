import {
    CALL_REPORT_ACTIVE_RISK_FLAG_CODES,
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_RISK_FLAG_ITEMS,
    CALL_REPORT_TYPE_PROFILES,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { KNOWLEDGE_KINDS } from '@lib/ai-rag/domain/types/knowledge-kind-registry';
import { AI_ANALYSIS_SERIES_START } from '../../../contracts/versions.types';
import { AI_GUIDE_ENDPOINT } from '../ai-guide.endpoints';
import { AI_GUIDE_PAGE } from '../ai-guide.links';
import type {
    AiGuideKnowledgeKindRef,
    AiGuideSection,
} from '../ai-guide.types';

/** Таблица типов звонков — из справочника смарта, не руками. */
const callTypesTable = (): string =>
    [
        '| Код | Название | База знаний (kind) | В средней оценке |',
        '|---|---|---|---|',
        ...CALL_REPORT_CALL_TYPE_ITEMS.map(item => {
            const profile = CALL_REPORT_TYPE_PROFILES[item.CODE];
            const outside =
                item.CODE === 'event_invite'
                    ? 'нет — отдельная колонка'
                    : item.CODE === 'other' || item.CODE === 'irrelevant'
                      ? 'нет'
                      : 'да';
            return `| \`${item.CODE}\` | ${item.VALUE} | \`${profile.knowledgeKind}\` | ${outside} |`;
        }),
    ].join('\n');

/** Действующие риск-флаги — из справочника, с русскими названиями. */
const activeRiskFlagsList = (): string =>
    CALL_REPORT_RISK_FLAG_ITEMS.filter(item =>
        (CALL_REPORT_ACTIVE_RISK_FLAG_CODES as readonly string[]).includes(
            item.CODE,
        ),
    )
        .map(item => `- \`${item.CODE}\` — ${item.VALUE}`)
        .join('\n');

/** Kind'ы инструкций разбора по типам — уникальные значения профилей. */
const analysisKinds = (): AiGuideKnowledgeKindRef[] => {
    const seen = new Set<string>();
    const refs: AiGuideKnowledgeKindRef[] = [];
    for (const item of CALL_REPORT_CALL_TYPE_ITEMS) {
        const kind = CALL_REPORT_TYPE_PROFILES[item.CODE].knowledgeKind;
        if (seen.has(kind)) continue;
        seen.add(kind);
        refs.push({
            kind,
            note: `Инструкция глубокого разбора звонков типа «${item.VALUE}» (${item.CODE}).`,
        });
    }
    return refs;
};

/**
 * Раздел «Разбор звонков»: конвейер event-sales, типы звонков и реестр,
 * риск-флаги с доказательствами, версии и серии сравнимости, переразбор
 * истории. Факты — README call-report и ai-analytics, план
 * 2026-10-19-ai-focus-plan (этапы 1A–3), contracts/versions.types.
 */
export const CALL_ANALYSIS_SECTION: AiGuideSection = {
    code: 'call-analysis',
    title: 'Разбор звонков',
    summary:
        'Конвейер разбора: скан телефонии → транскрипция → тип звонка → глубокий разбор → карточка смарта; типы и реестр, риск-флаги с цитатой, версии и серии сравнимости, переразбор истории.',
    theory: `## Что это
Разбор звонка — то, из чего состоит вся аналитика: одна запись \`ais\` типа \`agent-analysis\` на звонок (оценки разделов разговора по шкале 1–10, тип звонка, возражения, следующий шаг, риск-флаги с цитатами, расход токенов) плюс карточка смарт-процесса «AI-анализ звонков» на портале. Делает его приложение event-sales (\`call-report\`), а kpi-report-sales только читает готовые записи.

## Как работает
1. **Скан.** Планировщик раз в \`scanIntervalMinutes\` (ночью — \`nightScanIntervalMinutes\`) берёт звонки портала через \`voximplant.statistic.get\` за окно \`windowHours\`, отсеивает короче \`minDurationSec\`, уже обработанные (\`dedup_key\`) и чужих сотрудников (пилот \`allowedUserIds\` или \`salesOnly\`), не больше \`maxPerRun\` за проход.
2. **Транскрипция** с таймкодами и ролями; паспорт звонка — сущность CRM, стадия, менеджер, «свои названия» организации (\`ownOrgNames\`), чтобы модель не читала своё имя как чужой бренд.
3. **Тип звонка** — дешёвый классификатор (\`classifyEnabled\`, kind \`call-classify\` замещает встроенную инструкцию; реестр типов — kind \`call-type-registry\`). Разговор не про работу менеджера с уверенностью выше \`irrelevantConfidence\` — тип \`irrelevant\`, дорогие шаги не идут.
4. **Глубокий разбор** (\`deepAnalysisEnabled\`, модель \`deepAnalysisModel\`) — несколько фокус-проходов и синтез по профилю типа: инструкция kind \`call-analysis-<тип>\`, норма разговора \`sales-script\`, регламент \`sales-regulation\`, факты о продукте \`product-facts\`, плейбук возражений \`objection-playbook\`, методология презентации \`presentation-playbook\`, эталоны оценок \`call-etalon\` (ведёт April). Строгость определения презентации — \`presentationStrictness\`.
5. **Запись и карточка.** Приём нормализует результат, пишет \`ais\` (токены и цена по \`llm_price_per_1k\`) и, при \`createSmartEnabled\`, элемент смарта (поля CALL_TYPE, RISK_FLAGS, оценки). Значение перечисления, которого нет на портале, writer пропускает с warn — лечится повторным \`POST call-report/install-smart\`.
6. **Дополнительно** по настройкам портала: ночной ревизор (\`revisorEnabled\`), утренняя сверка презентаций (\`presentationAuditEnabled\`), проверка по документам компании (\`complianceReviewEnabled\`), недельный Excel (\`weeklyReportEnabled\`).

### Типы звонков
${callTypesTable()}

Тип «Приглашение на мероприятие» (\`event_invite\`, 21.10.2026) — отдельная колонка матрицы со своим n и оценкой, но вне корзин, средней оценки менеджера и отдела, норм, плана дня и советов; KPI-факт — «Приглашение на семинар». Свои мероприятия портала (названия, даты, сценарий) — документ kind \`call-analysis-event-invite\`; граница «приглашение / презентация» при необходимости — документ \`call-classify\`.

### Риск-флаги
Действующие (только они спрашиваются у модели и показываются руководителю, каждый — с дословной цитатой \`riskEvidence\`):
${activeRiskFlagsList()}

Флаг без доказательства приём снимает; отменённые «обещание» и «негатив клиента» отбрасываются даже если модель их вернула, в витрине не показываются и в старых данных. В день звонка РОПу уходят только \`conflict\` и \`compliance\`; \`door_closed\` — в повестку понедельника. Ночной ревизор флаги не ставит: поле RISK_FLAGS карточки пишет только разбор звонка.

### Версии и серии сравнимости
У каждого разбора пять версий: промпт, рубрика, хэш реестра типов, атрибуция менеджера, классификатор. Смена версии по существу рвёт ряд (\`comparableFrom\` сдвигается). Решение владельца 19–20.10.2026: всё накопленное — **одна серия от ${AI_ANALYSIS_SERIES_START}**; минорная правка (определения флагов, новый тип, формулировки без смены шкалы) получает новую дату в строке версии и запись в таблицу серий (\`PROMPT_SERIES_START\`, \`VERSION_FIELD_SERIES_START\`) — ряд не рвётся. Правка по существу — новая дата без записи — ряд рвётся.

### Переразбор истории
\`POST admin/ai-analytics/reanalyze\` пересчитывает старые разборы пилота текущей версией промпта: кандидаты — активные записи другой версии или без версий; новая запись копирует ссылки старой, старая становится \`superseded\`; Битрикс не трогается, алерты не шлются. Сначала \`dryRun\` (кандидаты и оценка стоимости), потом запуск; статус и отчёт согласия версий (ICC, сдвиг оценок по старой версии) — \`GET admin/ai-analytics/reanalyze-status\`.

## Когда срабатывает
- Новый звонок попадает в разбор на ближайшем скане (до интервала сканирования), если длиннее порога и сотрудник в периметре.
- Изменение настроек AI портала действует со следующего тика планировщика (до 30 минут), без деплоя.
- Документы базы знаний портала подмешиваются в следующий разбор сразу после загрузки; старые разборы не меняются — для них есть переразбор.

## Где смотреть результат
- «Статистика → AI» (все порталы) и «Карточка портала → Статистика → AI» — текст разбора, оценки, цитаты, версии.
- Карточка смарта «AI-анализ звонков» на портале — то, что видит руководитель в Битриксе.
- Расход — \`GET admin/ai-analytics/cost\`; статус переразбора — \`reanalyze-status\`.
- Логи event-sales: warn «значение перечисления отсутствует» = нужен \`install-smart\`.

## Что подготовить
1. Включить конвейер (\`enabled\`), выбрать пилот или весь ОП, выставить \`minDurationSec\`.
2. Установить смарт из карточки портала (вкладка смартов) или \`POST call-report/install-smart\`; после выкладок — повторить.
3. Загрузить документы базы знаний портала: скрипт, регламент, факты о продукте, инструкции по типам; свои мероприятия — \`call-analysis-event-invite\`.
4. Заполнить \`ownOrgNames\` — как менеджеры называют свою компанию клиенту.
5. Решить про дорогие контуры: ревизор, сверка презентаций, проверка по документам, недельный отчёт.

## Риски
- Разбор — расход модели на каждый звонок: ревизор и проверка по документам удваивают его; смотрите \`cost\`.
- Смена промпта по существу рвёт ряды — согласуйте с владельцем, какие правки минорные.
- Переразбор не трогает Битрикс: карточки старых разборов на портале остаются прежними, обновляется только витрина.
- Строгость презентации \`strict\` по умолчанию: содержательный рассказ без привязки к задачам клиента презентацией не считается — ожидания РОПа могут отличаться.`,
    settings: [
        {
            key: 'aiAnalyticsDefinitions',
            note: 'Определения событий портала (горячий клиент, стадии решения, результативный звонок) — читаются и разбором, и витриной.',
        },
    ],
    portalAiSettings: [
        { field: 'enabled', note: 'Главный выключатель конвейера портала.' },
        {
            field: 'deepAnalysisEnabled',
            note: 'Без глубокого разбора нет оценок разделов — только резюме.',
        },
        {
            field: 'createSmartEnabled',
            note: 'Карточка смарта на портале; запись ais пишется в любом случае.',
        },
        {
            field: 'classifyEnabled',
            note: 'Тип звонка от дешёвого классификатора; выключено — тип по приору стадии.',
        },
        { field: 'salesOnly', note: 'Периметр: только отдел продаж.' },
        { field: 'allowedUserIds', note: 'Пилот — явный список сотрудников.' },
        {
            field: 'minDurationSec',
            note: 'Порог длительности; короче — не разбирается.',
        },
        { field: 'windowHours', note: 'Как далеко назад ищет скан.' },
        { field: 'maxPerRun', note: 'Защита от лавины после простоя.' },
        {
            field: 'staleMinutes',
            note: 'Через сколько зависшая обработка перезапускается.',
        },
        { field: 'scanIntervalMinutes', note: 'Частота скана днём.' },
        {
            field: 'nightScanIntervalMinutes',
            note: 'Частота скана ночью (окно nightStartHour–nightEndHour).',
        },
        { field: 'nightStartHour', note: 'Начало ночного окна, МСК.' },
        { field: 'nightEndHour', note: 'Конец ночного окна, МСК.' },
        { field: 'llmModel', note: 'Модель резюме и рекомендаций.' },
        { field: 'deepAnalysisModel', note: 'Модель глубокого разбора.' },
        {
            field: 'irrelevantConfidence',
            note: 'Порог гейта «не наш разговор» — выше него дорогие шаги не идут.',
        },
        {
            field: 'presentationStrictness',
            note: 'Что считать презентацией: strict / normal / soft.',
        },
        {
            field: 'ownOrgNames',
            note: 'Свои названия организации — чтобы модель не снижала оценку за «чужой бренд».',
        },
        {
            field: 'revisorEnabled',
            note: 'Ночной свод по сделкам и лидам (дорого).',
        },
        {
            field: 'presentationAuditEnabled',
            note: 'Утренняя сверка отчёта менеджера с разбором презентации.',
        },
        {
            field: 'complianceReviewEnabled',
            note: 'Проверка по документам компании после разбора (лишний вызов модели).',
        },
        { field: 'weeklyReportEnabled', note: 'Недельный Excel по звонкам.' },
        {
            field: 'weeklyReportRecipients',
            note: 'Кому уходит недельный отчёт.',
        },
        {
            field: 'weeklyReportFolderId',
            note: 'Папка Диска для файла отчёта.',
        },
        { field: 'weeklyReportDelivery', note: 'Чат, задача или уведомление.' },
    ],
    params: [
        { code: 'min_duration_sec' },
        { code: 'min_duration_sec_by_type' },
        { code: 'presentation_canon' },
        { code: 'presentation_confirmed_only' },
        { code: 'productive_call_definition' },
        { code: 'llm_price_per_1k' },
        { code: 'retest_budget_calls' },
    ],
    knowledgeKinds: [
        ...analysisKinds(),
        {
            kind: KNOWLEDGE_KINDS.callClassify,
            note: 'Полностью замещает встроенную инструкцию определения типа; коды фиксированы схемой.',
        },
        {
            kind: KNOWLEDGE_KINDS.callTypeRegistry,
            note: 'JSON реестра типов и профилей; без документов — встроенный CALL_REPORT_TYPE_PROFILES.',
        },
        { kind: KNOWLEDGE_KINDS.salesScript },
        { kind: KNOWLEDGE_KINDS.salesRegulation },
        { kind: KNOWLEDGE_KINDS.productFacts },
        { kind: KNOWLEDGE_KINDS.objectionPlaybook },
        { kind: KNOWLEDGE_KINDS.presentationPlaybook },
        {
            kind: KNOWLEDGE_KINDS.callEtalon,
            note: 'Калибровка шкалы; ведёт April, клиенту недоступно.',
        },
        {
            kind: KNOWLEDGE_KINDS.general,
            note: 'Подмешивается к любому kind.',
        },
    ],
    endpoints: [
        AI_GUIDE_ENDPOINT.installSmart,
        AI_GUIDE_ENDPOINT.reanalyze,
        AI_GUIDE_ENDPOINT.reanalyzeStatus,
        AI_GUIDE_ENDPOINT.cost,
    ],
    adminPages: [
        AI_GUIDE_PAGE.aiSettings,
        AI_GUIDE_PAGE.knowledge,
        AI_GUIDE_PAGE.smarts,
        AI_GUIDE_PAGE.statisticsAi,
        AI_GUIDE_PAGE.portalStatisticsAi,
    ],
    related: [
        'enable-and-push',
        'people-and-targets',
        'feedback-reliability',
        'launch-after-release',
    ],
};
