/**
 * Ручки, на которые ссылается путеводитель, — одним списком, чтобы путь,
 * тело и назначение не расходились между разделами. Пути — без префикса
 * `/api`; `{domain}` в теле и query подставляет фронт.
 *
 * Ручки `admin` живут в `SalesAiAnalyticsAdminModule` (SUPER_USER);
 * `kpi-report-sales` и `event-sales` — в своих приложениях, из админки до
 * них клиента нет: фронт показывает Swagger приложения и готовое тело.
 */
import type { AiGuideEndpoint } from './ai-guide.types';

export const AI_GUIDE_ENDPOINT = {
    backfill: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/backfill',
        action: 'backfill',
        body: '{"domain":"{domain}","from":"2024-11","to":"2026-09"}',
        when: 'После выкладки, которая меняет расчёт закрытых месяцев; после переразбора истории; при первом включении прогноза (24 месяца истории).',
        purpose:
            'Ставит по джобе ритма backfill на каждый месяц диапазона в очередь sales-kpi-report. Уже посчитанные периоды раннер пропускает, диапазон шире 24 месяцев отклоняется (backfill-range-too-wide). Ответ — месяцы и поставленные джобы; сам расчёт идёт в воркере kpi-report-sales.',
    },
    recompute: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/recompute',
        action: 'recompute',
        body: '{"domain":"{domain}","rhythm":"monthly","monthKey":"2026-09","steps":["calls","stage-history","forecast-log-replay","forecast-backtest"]}',
        when: 'Нужно пересчитать конкретный период с forceRefresh или прогнать отдельные шаги (воспроизведение журнала прогноза, бэктест).',
        purpose:
            'Одна джоба снапшотов с forceRefresh = true: период переписывается, прошлые версии становятся superseded. jobId несёт метку момента — повтор не проглатывается очередью. steps — белый список кодов шагов; пусто — все шаги ритма.',
    },
    etlStatus: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/etl-status',
        action: 'etl-status',
        query: 'domain={domain}&days=7',
        when: 'Проверить, прошёл ли ночной конвейер и что в нём упало или пропущено.',
        purpose:
            'Журналы прогонов ai-analytics-etl-run за окно days: шаги с длительностями, строками и вызовами Bitrix, пропущенные и упавшие шаги, предупреждения санити-панели, дрейф входов; сверху сводка ok / partial / failed.',
    },
    forecastBacktest: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/forecast-backtest',
        action: 'forecast-backtest',
        query: 'domain={domain}&months=6',
        when: 'После догона истории и шага forecast-backtest — решить, включать ли ступень прогноза.',
        purpose:
            'Последние months снапшотов проверки точности прогноза: status гейта и причины, shadowMonths (всего теневых месяцев) и replayedMonths (восстановленных по истории), покрытие вилки, отношение ошибок к простым прогнозам, pinball.',
    },
    stageHistoryProbe: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/stage-history/probe',
        action: 'stage-history-probe',
        query: 'domain={domain}&months=12',
        when: 'Перед включением аналитики на новом портале и когда ожидание от пайплайна пустое (pipelineExpected = null).',
        purpose:
            'Проверяет доступность crm.stagehistory.list и глубину истории переходов сделок: enough = true — путь сделки и рёбра воронки считаются по живым данным; иначе шаг stage-history деградирует штатно.',
    },
    reanalyze: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/reanalyze',
        action: 'reanalyze',
        body: '{"domain":"{domain}","from":"2026-07-21","to":"2026-10-21","dryRun":true}',
        when: 'После смены версии промпта — пересчитать старые разборы пилота текущей версией. Сначала dryRun, затем запуск.',
        purpose:
            'Ставит джобу CALL_REPORT_REANALYZE (воркер event-sales). Кандидаты — транскрипции периода сотрудников списка (по умолчанию пилот allowedUserIds), у которых активный разбор другой версии промпта или без версий. Новая запись копирует ссылки старой, старая — superseded; Битрикс не вызывается, алерты не шлются. Квота на часть и бюджет 45 минут, продолжения ставятся сами.',
    },
    reanalyzeStatus: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/reanalyze-status',
        action: 'reanalyze-status',
        query: 'domain={domain}&from=2026-07-21&to=2026-10-21',
        when: 'После dryRun — оценить кандидатов и стоимость; во время прогона — ждать finished: true; после — прочитать согласие версий.',
        purpose:
            'Статус call-report-reanalysis-run по периоду (кандидаты, сделано, сбои, пропуски по причинам, токены и цена, оценка dryRun) и отчёты ai-analytics-version-agreement: по старой версии промпта — пары, ICC/σ, сдвиг общего балла и разделов.',
    },
    smartBackfill: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/smart-backfill',
        body: '{"domain":"{domain}","mode":"period","from":"2026-10-13","to":"2026-10-30","dryRun":true}',
        when: 'Карточки разборов остались без полей при целых разборах в БД (запись полей упала — инцидент 13–30.10.2026) или нужно переложить старые разборы свежими правилами раскладки.',
        purpose:
            'Ставит джобу CALL_REPORT_SMART_BACKFILL (воркер event-sales): разбор берётся из записи ais и раскладывается по полям существующего элемента смарта так же, как при приёме; модель не вызывается, новые элементы не создаются. Режим period — все карточки периода, pending — только с неудавшейся записью полей (их же подбирает ночной крон 22:30 МСК). dryRun — только подсчёт.',
    },
    smartBackfillStatus: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/smart-backfill-status',
        query: 'domain={domain}&mode=period&from=2026-10-13&to=2026-10-30',
        when: 'После запуска — ждать finished: true; в любой момент — сколько карточек ждут записи полей (pending).',
        purpose:
            'Статус call-report-smart-backfill-run по ключу (кандидаты, записано, сбои, без элемента, пропуски по причинам), последний прогон домена и pending — карточки с элементом и in_report = false за окно крона.',
    },
    cost: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/cost',
        action: 'cost',
        query: 'domain={domain}&month=2026-10',
        when: 'Раз в месяц и после массовых операций (переразбор, test-retest) — сверить расход модели.',
        purpose:
            'Токены и стоимость вызовов LLM за месяц из колонок ais (tokens_count, price) по типам записей, включая agent-analysis и agent-analysis-retest. estimated = true — цена реестра нулевая или записи без стоимости, числа — оценка.',
    },
    feedback: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/feedback',
        action: 'feedback',
        query: 'domain={domain}&from=2026-10-01&to=2026-10-31',
        when: 'Проверить, доходят ли рассылки и как руководители реагируют на витрину.',
        purpose:
            'Записи ai-analytics-feedback за период: реакции витрины (view, useful, not_useful, disagree), факты доставки (alert_sent, alert_handled, digest_sent, agenda_sent), слепые метки руководителя (rop_mark) — по видам и менеджерам.',
    },
    goldenSet: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/golden-set',
        action: 'golden-set',
        query: 'domain={domain}',
        when: 'После смены версии промпта — есть ли отчёт согласия оценщика для текущей версии.',
        purpose:
            'Отчёты ai-analytics-golden-report портала по версиям промпта: пары разборов, квота, σ_llm и её источник (measured / configured), runAvailable.',
    },
    goldenSetRun: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/golden-set/run',
        action: 'golden-set-run',
        body: '{"domain":"{domain}","quota":300}',
        when: 'После смены версии промпта, когда накопилось достаточно разборов текущей версии (90 дней).',
        purpose:
            'Ставит джобу CALL_REPORT_RETEST: разборы текущей версии повторяются тем же фокус-разбором, пары сводятся в отчёт согласия. Один запуск на домен в сутки, бюджет 45 минут; без очереди в сборке — dispatched: false с причиной.',
    },
    retention: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/retention/run',
        action: 'retention',
        body: '{"domain":"{domain}","dryRun":true}',
        when: 'Посмотреть, что подлежит удалению по срокам хранения снапшотов.',
        purpose:
            'Считает план ретенции по дескрипторам типов (forecast 180 дней, etl-run 90, brief 30, зёрна — по числу записей; бессрочные не трогаются). Физического удаления пока нет: dryRun = false вернёт delete-not-available и deleted = 0.',
    },
    audit: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/audit',
        body: '{"domain":"{domain}","months":6,"save":true}',
        when: 'Перед включением витрины на портале и раз в месяц — на каких данных строится аналитика.',
        purpose:
            'Синхронный аудит по живой БД (нужен ai_analytics_audit_enabled): покрытие менеджеров, разборы по ячейкам, шум типов, длительности, версии. При save пишет снапшот ai-analytics-audit.',
    },
    poolStatus: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/pool-status',
        query: 'domain={domain}',
        when: 'Портал дал согласие на пул — проверить, вошёл ли он и что даёт пул.',
        purpose:
            'Последний снапшот ai-analytics-pool: статус, число порталов с согласием и в пуле, обезличенные вердикты, β пула с I², готовность к уровню E2.',
    },
    qualityLink: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/quality-link',
        query: 'domain={domain}',
        when: 'Понять, связана ли оценка разговора с ближним исходом на этом портале.',
        purpose:
            'Последний снапшот ai-analytics-quality-link: β внутри / между менеджерами / общая с интервалами, надёжность, калибровка, плацебо и гейт публикации.',
    },
    recommendationEffect: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/recommendation-effect',
        query: 'domain={domain}',
        when: 'Перед включением ступени «рекомендации» — работают ли советы.',
        purpose:
            'Последний снапшот эффекта советов: выдано / выполнено / несогласий, «до/после» по шагам воронки, гейт L5 с причинами.',
    },
    cacheReset: {
        app: 'kpi-report-sales',
        method: 'POST',
        path: 'ai-analytics/cache/reset',
        action: 'cache-reset',
        body: '{"domain":"{domain}","requesterUserId":"<ваш bitrix-id>","scope":"all"}',
        when: 'После выкладки, которая меняет сигналы или форму ответа, и после переразбора/догона истории — иначе пульс и повестка отдадут старый расчёт до истечения TTL (час / 15 минут).',
        purpose:
            'Удаляет ключи кэша модуля по домену: scope = pulse | agenda | settings | overview | attention | kpi-month | plans — соответствующий раздел, all — всё, включая периметры доступа. Только руководители уровня cup | op (requesterUserId).',
    },
    installSmart: {
        app: 'event-sales',
        method: 'POST',
        path: 'call-report/install-smart',
        action: 'install-smart',
        body: '{"domain":"{domain}"}',
        when: 'При подключении портала и после каждой выкладки, добавившей значения в перечисления смарта (door_closed в RISK_FLAGS, event_invite в CALL_TYPE).',
        purpose:
            'Создаёт смарт-процесс «AI-анализ звонков» по const-конфигу и добавляет отсутствующие поля; повторный вызов идемпотентно доливает недостающие значения enum-полей (enumItemsAdded). До него разбор пишется, но без новых значений в карточке (warn в логе).',
    },
    launchStatus: {
        app: 'admin',
        method: 'GET',
        path: 'admin/ai-analytics/launch-status',
        query: 'domain={domain}',
        when: 'После выкладки и по ходу запуска — что уже сделано и что нажать дальше (панель «Запуск AI после выкладки» читает её сама).',
        purpose:
            'Сводка одним ответом: настройки (AI-аналитика, разбор звонков, пилот), смарт (есть ли door_closed и event_invite), журнал прогонов (backfill / monthly / nightly), прогноз (теневые месяцы, из истории, статус проверки, флаг показа), последний переразбор с прогрессом, расход модели за месяц. У каждого блока state (done | todo | running | unknown) и текст «что сделать дальше».',
    },
    cacheResetAdmin: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/cache/reset',
        body: '{"domain":"{domain}","scope":"all"}',
        when: 'После выкладки и после переразбора или догона истории — кнопка «Сбросить кэш витрины AI».',
        purpose:
            'Та же очистка, что у ai-analytics/cache/reset приложения kpi-report-sales, но из админки (SUPER_USER, без requesterUserId): строки app_cache и ключи Redis витрины по домену. Ответ — deletedDb, deletedRedis и итог словами.',
    },
    stageFlags: {
        app: 'admin',
        method: 'POST',
        path: 'admin/ai-analytics/stage-flags',
        body: '{"domain":"{domain}","forecast":true}',
        when: 'Проверка точности прогноза вернула pass — кнопка «Показать прогноз в отчёте».',
        purpose:
            'Мёржит forecast_stage_enabled / recommendations_stage_enabled в JSON ai_analytics_model_params портала, остальные ключи не трогает. Битый JSON — 400 с текстом (ничего не перезаписывается); прогноз без pass — 409 с причинами, force = true — обход для разработчика. После смены флага кэш витрины портала сбрасывается.',
    },
    installAicall: {
        app: 'admin',
        method: 'POST',
        path: 'admin/pbx/smarts/install-aicall',
        body: '{"domain":"{domain}"}',
        when: 'При подключении портала и после выкладки, добавившей значения перечислений смарта, — кнопка «Обновить смарт AI-анализа».',
        purpose:
            'Тот же use-case, что у call-report/install-smart приложения event-sales: создаёт смарт «AI-анализ звонков», доливает недостающие поля и значения перечислений (enumItemsAdded); повтор безопасен.',
    },
    push: {
        app: 'kpi-report-sales',
        method: 'POST',
        path: 'ai-analytics/push',
        action: 'push',
        body: '{"domain":"{domain}","requesterUserId":"<ваш bitrix-id>","kind":"digest_all","recipients":[<ваш bitrix-id>]}',
        when: 'Проверить доставку рассылки руками, не дожидаясь утреннего слота («отправить себе»).',
        purpose:
            'Синхронно выполняет тот же код, что крон: kind = agenda | digest | digest_all, date — день в TZ портала (по умолчанию сегодня), recipients — кому отправить вместо адресатов настроек (отметки доставки при этом не пишутся). Только руководители.',
    },
} as const satisfies Record<string, AiGuideEndpoint>;

export type AiGuideEndpointKey = keyof typeof AI_GUIDE_ENDPOINT;
