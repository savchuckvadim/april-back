import { AI_GUIDE_ENDPOINT } from '../ai-guide.endpoints';
import { AI_GUIDE_PAGE } from '../ai-guide.links';
import type { AiGuideSection } from '../ai-guide.types';

/**
 * Раздел «Обратная связь и надёжность»: реакции витрины и факты доставки,
 * золотой набор test-retest, согласие версий после переразбора, расход
 * модели, ретенция. Факты — admin-контроллеры feedback-cost, golden-set,
 * reanalyze, retention; план 2026-10-19 (этап 1A «токены»).
 */
export const FEEDBACK_RELIABILITY_SECTION: AiGuideSection = {
    code: 'feedback-reliability',
    title: 'Обратная связь и надёжность',
    summary:
        'Реакции руководителей и факты доставки (feedback), надёжность оценщика (golden-set / test-retest), согласие версий, стоимость и токены, ретенция снапшотов.',
    theory: `## Что это
Три вопроса, на которые должна отвечать эксплуатация: **доходит ли** (рассылки и реакции на витрину), **можно ли верить оценкам** (повторяемость оценщика и согласие версий) и **сколько это стоит** (токены и рубли по порталу). Всё это — записи \`ais\` с типами \`ai-analytics-feedback\`, \`ai-analytics-golden-report\`, \`ai-analytics-version-agreement\` и колонки \`tokens_count\` / \`price\` у самих снапшотов.

## Как работает
**Обратная связь.** Витрина пишет реакции руководителя (\`view\`, \`useful\`, \`not_useful\`, \`disagree\`), push-контур — факты доставки (\`alert_sent\`, \`alert_handled\`, \`digest_sent\`, \`agenda_sent\`), слепая проверка «три звонка недели» — метки \`rop_mark\`. \`GET admin/ai-analytics/feedback\` сводит их по видам и менеджерам за период (UTC, обе даты включительно); записи чужой формы показаны числом \`skipped\`, замещённые — \`superseded\`.

**Надёжность оценщика (test-retest).** Один и тот же звонок разбирается дважды одной версией; пары сводятся в отчёт согласия \`ai-analytics-golden-report\` (по одному на версию промпта, хранится бессрочно): ICC, σ оценщика. Измеренная σ_llm вытесняет дефолт реестра \`sigma_llm_default\` (\`sigmaSource: measured\`). Запуск — \`POST admin/ai-analytics/golden-set/run\`: разборы текущей версии за 90 дней, не больше квоты \`retest_budget_calls\` (300), один запуск на домен в сутки, бюджет 45 минут.

**Согласие версий.** После переразбора истории отчёт \`ai-analytics-version-agreement\` сравнивает старый и новый разбор по парам: ICC/σ и средний сдвиг «новая − старая» общего балла и разделов в разбивке по старой версии промпта (\`agreement[].byOldPromptVersion\` в \`reanalyze-status\`). По нему владелец решает, объявлять ли старые серии совместимыми на других порталах.

**Стоимость.** Фокус-вызовы, синтез и цельный разбор идут через вызовы с учётом usage; сумма токенов и цена (\`llm_price_per_1k\` слоя портала) пишутся в колонки записи. \`GET admin/ai-analytics/cost\` считает месяц одним чтением по типам (\`agent-analysis\`, \`agent-analysis-retest\`, резюме, …). \`estimated = true\` — цена в реестре нулевая («не задана») или записи без стоимости: числа — оценка, не факт биллинга. У порталов, где токены раньше не писались, оценка dryRun переразбора в первый раз честно пустая.

**Ретенция.** \`POST admin/ai-analytics/retention/run\` считает по дескрипторам типов, что подлежит удалению (forecast 180 дней, etl-run 90, brief 30, зёрна — по числу записей; golden-report, settings-audit, rop-mark, feedback, settings — бессрочно), удерживая актуальную запись ключа и две последние версии. Физического удаления пока нет.

## Когда срабатывает
- Реакции и факты доставки пишутся в момент действия; сводка — по запросу.
- Test-retest запускается вручную после смены версии промпта; повтор в тот же день отклоняется (jobId по дате).
- Отчёт согласия версий считается по окончании каждой части переразбора; новый прогон другого окна того же домена замещает отчёт того же ключа.
- Расход виден сразу: записи несут цену в момент записи.

## Где смотреть результат
- Страница «Модель и обратная связь» — карточка «Обратная связь»; «Аудит данных» — блок «Надёжность оценщика (test-retest)».
- \`GET admin/ai-analytics/golden-set\`, \`GET admin/ai-analytics/cost\`, \`GET admin/ai-analytics/reanalyze-status\` (поле \`agreement\`).
- Чат админов — сводка ретенции при \`dryRun: false\` (решение В8).

## Что подготовить
1. Задать цену \`llm_price_per_1k\` в \`ai_analytics_model_params\` портала — иначе стоимость только оценочная.
2. Накопить 90 дней разборов текущей версии перед test-retest (иначе пар мало, σ останется из реестра).
3. Договориться, кто смотрит \`feedback\` и как часто: пустые \`alert_sent\` при включённых алертах — признак, что получатели не заданы.

## Риски
- Test-retest и переразбор — массовый расход модели: сверяйте \`cost\` до и после.
- Низкая ICC оценщика (ниже \`dq_score_icc_min\`) означает, что сравнивать менеджеров по оценкам рано — витрина покажет «мало данных» в карточках с доказательностью.
- Оценка стоимости dryRun берётся по средним за 30 дней: у портала с другой моделью или длиной звонков она может сильно отличаться от факта.`,
    settings: [
        {
            key: 'aiAnalyticsModelParams',
            note: 'Цена llm_price_per_1k и квота retest_budget_calls живут здесь (слой портала).',
        },
        {
            key: 'aiAnalyticsRopUserIds',
            note: 'Чьи реакции и метки rop_mark ожидаются в сводке.',
        },
    ],
    portalAiSettings: [
        {
            field: 'deepAnalysisModel',
            note: 'Модель глубокого разбора определяет расход токенов и цену.',
        },
        {
            field: 'allowedUserIds',
            note: 'Пилот — объём разборов, из которого берётся выборка test-retest и переразбора.',
        },
    ],
    params: [
        { code: 'llm_price_per_1k' },
        { code: 'retest_budget_calls' },
        { code: 'sigma_llm_default' },
        { code: 'golden_kappa_min' },
        { code: 'dq_score_icc_min' },
        { code: 'audit_samples_per_manager' },
        { code: 'audit_samples_per_month' },
        { code: 'evidence_gate_card' },
        { code: 'evidence_gate_advice' },
    ],
    paramGroups: ['dq'],
    knowledgeKinds: [],
    endpoints: [
        AI_GUIDE_ENDPOINT.feedback,
        AI_GUIDE_ENDPOINT.goldenSet,
        AI_GUIDE_ENDPOINT.goldenSetRun,
        AI_GUIDE_ENDPOINT.reanalyzeStatus,
        AI_GUIDE_ENDPOINT.cost,
        AI_GUIDE_ENDPOINT.retention,
    ],
    adminPages: [
        AI_GUIDE_PAGE.model,
        AI_GUIDE_PAGE.audit,
        AI_GUIDE_PAGE.settingsModel,
    ],
    related: ['call-analysis', 'model-and-data', 'enable-and-push'],
};
