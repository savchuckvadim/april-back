import { AI_GUIDE_ENDPOINT } from '../ai-guide.endpoints';
import { AI_GUIDE_PAGE } from '../ai-guide.links';
import type { AiGuideSection } from '../ai-guide.types';

/**
 * Раздел «Прогноз отдела»: теневой журнал, воспроизведение по истории,
 * бэктест, гейты и флаги ступеней Фазы 4, соседние снапшоты (связь
 * качества, пул, эффект советов). Факты — README ai-analytics («Фаза 4»),
 * журнал плана 2026-10-19 (19.10 — forecast-log-replay), owner-runbook §3.
 */
export const FORECAST_SECTION: AiGuideSection = {
    code: 'forecast',
    title: 'Прогноз отдела',
    summary:
        'Теневой журнал прогноза, воспроизведение по истории, проверка точности (бэктест) и флаг ступени forecast_stage_enabled; рядом — связь качества с результатом, пул порталов, эффект советов.',
    theory: `## Что это
Прогноз отдела — оценка продаж месяца с вилкой, которую витрина показывает руководителю **только после проверки точности**. До этого прогноз считается «в тени»: каждый ночной прогон пишет в журнал \`ai-analytics-forecast-log\`, что модель сказала бы сегодня, а в закрытом месяце факт сверяется с этими записями. Ступень включается флагом реестра \`forecast_stage_enabled\` (слой портала) — вручную, после \`pass\` бэктеста.

## Как работает
1. **Теневой журнал.** Ночью по дням: прогноз отдела на конец месяца по модели прошлого закрытого месяца, продажам по CLOSEDATE, открытым эпизодам из истории стадий (ожидание от пайплайна), темпу прошлого месяца и среднему за три месяца.
2. **Воспроизведение по истории** (\`forecast-log-replay\`, 19.10.2026) — чтобы не ждать девять месяцев тени: шаг восстанавливает журнал закрытого месяца по дням «как в ночь на d» по данным, известным к d; такие дни помечены \`replayed: true\`, живые дни ночного прогона не затираются. Честная деградация: нет KPI по дням — темп прошлого месяца; нет истории стадий — \`pipelineExpected: null\`.
3. **Бэктест** (\`forecast-backtest\`) — по журналам за 12 месяцев: покрытие вилки (цель \`forecast_coverage_target\`, уровень \`forecast_interval_level\`), отношение ошибок к простым прогнозам «по темпу» и «среднее-3» (порог \`forecast_mase_max\`: меньше единицы — прогноз лучше простого), pinball. Гейт L4: не меньше \`forecast_shadow_min_months\` теневых месяцев (9, можно снизить до 3) и \`forecast_backtest_min_months\` месяцев с фактом (6, от 3). В ответе \`shadowMonths\` — всего, \`replayedMonths\` — из них восстановленных.
4. **Решение.** \`status: pass\` → владелец ставит \`forecast_stage_enabled: true\` в \`ai_analytics_model_params\` портала; витрина начинает показывать прогноз.

Рядом живут снапшоты той же Фазы 4: **связь качества с результатом** (\`quality-link\`: β внутри / между менеджерами, плацебо, гейт публикации серией пересчётов), **пул порталов** (\`pool\`: обезличенные прайоры для порталов с короткой историей, только с согласием), **эффект советов** (\`recommendation-effect\`: до/после по шагам воронки, гейт ступени \`recommendations_stage_enabled\`).

## Когда срабатывает
- Теневой журнал пишется каждым ночным прогоном при включённой AI-аналитике портала; воспроизведение и бэктест — шаги ритмов \`monthly\` и \`backfill\`.
- Чтобы нарисовать историю быстро: \`backfill\` на 24 месяца (старые → новые; запустить второй раз — первые месяцы окна дорисуются, когда появится модель) → \`recompute\` последнего закрытого месяца со steps \`calls\`, \`stage-history\`, \`forecast-log-replay\`, \`forecast-backtest\` → \`GET forecast-backtest\`.
- Флаг ступени читается при каждом запросе витрины — включение видно сразу (после сброса кэша).

## Где смотреть результат
- \`GET admin/ai-analytics/forecast-backtest\` и карточка «Точность прогноза» на странице «Модель и обратная связь»: статус, причины, покрытие, отношение ошибок, теневые месяцы.
- \`GET admin/ai-analytics/stage-history/probe\` — хватает ли истории стадий для ожидания от пайплайна.
- \`etl-status\` — прошли ли шаги \`forecast-log-replay\` / \`forecast-backtest\` и не пропущены ли они по причине.
- В витрине — блок прогноза отдела (после включения флага).

## Что подготовить
1. История стадий сделок на портале (\`crm.stagehistory.list\`) и KPI по дням — без них вилка шире, а ожидание от пайплайна пустое.
2. Закрытые месяцы с фактом продаж (\`sales-finance\`, CLOSEDATE) за 6–9 месяцев.
3. Решить пороги: оставить 9 / 6 или снизить до 3 (\`forecast_shadow_min_months\`, \`forecast_backtest_min_months\` — слой global, меняются в коде; см. реестр).
4. Согласовать с владельцем включение флага после \`pass\`.

## Риски
- Включить прогноз без \`pass\` — руководители увидят вилку, которую никто не проверял.
- Восстановленные месяцы честнее, чем ничего, но они не знают о данных, которых не было в \`ais\` на момент d: разборы, добавленные переразбором позже, в них учитываются.
- Повторный \`backfill\` без \`forceRefresh\` пропускает уже посчитанные месяцы — для пересчёта нужен \`recompute\`.`,
    settings: [
        {
            key: 'aiAnalyticsModelParams',
            note: 'Здесь ставится forecast_stage_enabled: true после pass бэктеста.',
        },
        {
            key: 'aiAnalyticsPoolOptIn',
            note: 'Согласие на пул — прайоры для портала с короткой историей.',
        },
    ],
    portalAiSettings: [],
    params: [
        {
            code: 'forecast_stage_enabled',
            note: 'Единственный ручной шаг: включить после pass бэктеста.',
        },
        { code: 'forecast_shadow_min_months' },
        { code: 'forecast_backtest_min_months' },
        { code: 'forecast_interval_level' },
        { code: 'forecast_coverage_target' },
        { code: 'forecast_mase_max' },
        { code: 'recommendations_stage_enabled' },
        { code: 'pool_opt_in' },
        { code: 'pool_min_portals' },
    ],
    paramGroups: ['phase4', 'phase4-advice'],
    knowledgeKinds: [],
    endpoints: [
        AI_GUIDE_ENDPOINT.backfill,
        AI_GUIDE_ENDPOINT.recompute,
        AI_GUIDE_ENDPOINT.forecastBacktest,
        AI_GUIDE_ENDPOINT.stageHistoryProbe,
        AI_GUIDE_ENDPOINT.qualityLink,
        AI_GUIDE_ENDPOINT.poolStatus,
        AI_GUIDE_ENDPOINT.recommendationEffect,
    ],
    adminPages: [
        AI_GUIDE_PAGE.model,
        AI_GUIDE_PAGE.settingsModel,
        AI_GUIDE_PAGE.audit,
    ],
    related: ['model-and-data', 'launch-after-release', 'feedback-reliability'],
};
