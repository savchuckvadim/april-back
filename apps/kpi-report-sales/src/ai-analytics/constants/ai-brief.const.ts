/**
 * Константы ручки AI-резюме (план Фазы 2, поток 18 `p2-api-brief`): TTL
 * кэша, опции джобы, состав пакета фактов, тексты причин шаблона и
 * правила учёта расхода вызова модели.
 *
 * Магических строк в коде резюме нет (ai/rules/pbx-typing.md): коды
 * фактов, виды и единицы приходят из контракта библиотеки
 * (`AI_BRIEF_FACT_KINDS`, `AI_BRIEF_FACT_UNITS`), типы снапшота — из
 * реестра снапшотов.
 */
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_BRIEF_TEMPLATE_REASONS,
    type AiBriefFactKind,
    type AiBriefFactUnit,
    type AiBriefTemplateReason,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsReadinessMode } from './ai-analytics.const';

/**
 * TTL кэша резюме, секунды: ready — 6 часов (план §3.4), error — конверт
 * ошибки процессора на 120 с (промах не ставит джобу заново сразу после
 * падения — как у обзора).
 */
export const AI_BRIEF_TTL_SECONDS = {
    ready: 6 * 60 * 60,
    error: 120,
} as const;

/**
 * Опции Bull-джобы резюме (план §5.3): приоритет пользовательской джобы,
 * без ретраев, таймаут 120 с — LLM отвечает за минуту или не отвечает.
 */
export const AI_ANALYTICS_BRIEF_JOB_OPTIONS = {
    priority: 1,
    attempts: 1,
    timeout: 120_000,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** TTL счётчика квоты: сутки с запасом на разницу TZ портала и контейнера. */
export const AI_BRIEF_QUOTA_TTL_SECONDS = 26 * 60 * 60;

/** Тип и адресация ais-записи резюме (ключ периода — packHash). */
export const AI_BRIEF_SNAPSHOT_RECORD = {
    TYPE: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
    APP: AI_ANALYTICS_SNAPSHOT_APP,
    PROVIDER: AI_ANALYTICS_SNAPSHOT_PROVIDER,
} as const;

/** Коды фактов пакета (плана §4 таблица состава evidence pack). */
export const AI_BRIEF_FACT_CODES = {
    alerts: 'alerts',
    attention: 'attention',
    funnelGap: 'funnel_gap',
    planVsFactSales: 'plan_vs_fact_sales',
    pipelineFromStage: 'pipeline_from_stage',
    disciplineNextStep: 'discipline_next_step',
    callsOverThreshold: 'calls_over_threshold',
    airtime: 'airtime',
    forecastP50: 'forecast_p50',
    dataQuality: 'data_quality',
} as const;
export type AiBriefFactCode =
    (typeof AI_BRIEF_FACT_CODES)[keyof typeof AI_BRIEF_FACT_CODES];

/** Описание факта пакета: вид (он же приоритет обрезки), единица, подпись. */
export interface AiBriefFactSpec {
    kind: AiBriefFactKind;
    unit: AiBriefFactUnit;
    /** Подпись факта для модели; сборщик может уточнить её (ребро, тип). */
    title: string;
    /** Место в таблице состава пакета (1 — первым уходит в модель). */
    priority: number;
}

/**
 * Состав пакета: ровно десять кодов таблицы плана в её порядке.
 *
 * ⚠ Обрезка `trimEvidencePack` сортирует по ВИДУ факта
 * (`AI_BRIEF_FACT_PRIORITY`: alert → deviation → finance → discipline →
 * telephony → data-quality), а внутри вида сохраняет порядок входа.
 * Порядок этой таблицы совпадает с порядком видов везде, кроме
 * `forecast_p50`: по смыслу он финансовый (`finance`), поэтому при
 * обрезке по байтам выживает вместе с продажами, хотя в таблице стоит
 * девятым. Числа фактов это не меняет — меняется только то, что
 * отбрасывается первым при переполнении 4 КБ.
 */
export const AI_BRIEF_FACT_SPECS: Record<AiBriefFactCode, AiBriefFactSpec> = {
    [AI_BRIEF_FACT_CODES.alerts]: {
        kind: 'alert',
        unit: 'count',
        title: 'Сигналов риска за период',
        priority: 1,
    },
    [AI_BRIEF_FACT_CODES.attention]: {
        kind: 'deviation',
        unit: 'count',
        // По кэшу обзора считаются менеджеры с сигналом (в строке лежит
        // старшая карточка менеджера), поэтому подпись — про менеджеров,
        // а не про карточки: число резюме обязано сходиться с вкладкой.
        title: 'Менеджеров с сигналом «Внимание»',
        priority: 2,
    },
    [AI_BRIEF_FACT_CODES.funnelGap]: {
        kind: 'deviation',
        unit: 'share',
        title: 'Наибольший разрыв к норме по воронке',
        priority: 3,
    },
    [AI_BRIEF_FACT_CODES.planVsFactSales]: {
        kind: 'finance',
        unit: 'count',
        title: 'Продаж закрыто',
        priority: 4,
    },
    [AI_BRIEF_FACT_CODES.pipelineFromStage]: {
        kind: 'finance',
        unit: 'count',
        title: 'Ожидание продаж из пайплайна',
        priority: 5,
    },
    [AI_BRIEF_FACT_CODES.disciplineNextStep]: {
        kind: 'discipline',
        unit: 'share',
        title: 'Доля звонков с назначенным шагом и датой',
        priority: 6,
    },
    [AI_BRIEF_FACT_CODES.callsOverThreshold]: {
        kind: 'telephony',
        unit: 'count',
        title: 'Разобрано звонков длиннее порога',
        priority: 7,
    },
    [AI_BRIEF_FACT_CODES.airtime]: {
        kind: 'telephony',
        unit: 'sec',
        title: 'Эфирное время отдела',
        priority: 8,
    },
    [AI_BRIEF_FACT_CODES.forecastP50]: {
        kind: 'finance',
        unit: 'count',
        title: 'Прогноз продаж месяца (P50)',
        priority: 9,
    },
    [AI_BRIEF_FACT_CODES.dataQuality]: {
        kind: 'data-quality',
        unit: 'count',
        title: 'Замечаний к качеству данных',
        priority: 10,
    },
};

/**
 * Подпись факта `attention` при промахе кэша обзора: запасной источник —
 * утечки рёбер снапшота прогноза, а не карточки вкладки, и подпись
 * говорит об этом прямо (числа резюме проверяются по вкладке).
 */
export const AI_BRIEF_ATTENTION_LEAKS_TITLE = 'Утечек воронки в прогнозе';

/** Порядок сборки фактов — порядок таблицы состава пакета. */
export const AI_BRIEF_PACK_ORDER: readonly AiBriefFactCode[] = Object.keys(
    AI_BRIEF_FACT_SPECS,
)
    .map(code => code as AiBriefFactCode)
    .sort(
        (a, b) =>
            AI_BRIEF_FACT_SPECS[a].priority - AI_BRIEF_FACT_SPECS[b].priority,
    );

/**
 * Режимы готовности, при которых факт `forecast_p50` попадает в пакет
 * (таблица состава: «только при readiness ≥ forecast»). Режим `kpi-only`
 * прогноза не даёт по построению.
 */
export const AI_BRIEF_FORECAST_MODES = [
    'forecast',
    'recommendations',
] as const satisfies readonly AiAnalyticsReadinessMode[];

/** Верхняя граница строк выборок снапшотов сборщиком пакета. */
export const AI_BRIEF_SNAPSHOT_LIMIT = 500;

/** Тексты причин шаблонного резюме (подпись под резюме на витрине). */
export const AI_BRIEF_TEMPLATE_REASON_TEXTS: Record<
    AiBriefTemplateReason,
    string
> = {
    [AI_BRIEF_TEMPLATE_REASONS.noLlmKey]:
        'Резюме собрано по шаблону: у портала не заведён ключ VibeCode.',
    [AI_BRIEF_TEMPLATE_REASONS.quotaExceeded]:
        'Резюме собрано по шаблону: исчерпана дневная квота вызовов модели ' +
        '(brief_quota_per_day).',
    [AI_BRIEF_TEMPLATE_REASONS.invalidPayload]:
        'Резюме собрано по шаблону: ответ модели не разобрался по строгой схеме.',
    [AI_BRIEF_TEMPLATE_REASONS.factcheckFailed]:
        'Резюме собрано по шаблону: после проверки фактов осталось меньше двух ' +
        'буллетов.',
    [AI_BRIEF_TEMPLATE_REASONS.llmUnavailable]:
        'Резюме собрано по шаблону: модель не ответила.',
};

/**
 * Системный промпт резюме. Правила совпадают с факт-чеком
 * (`factCheckBullets`): числа только из пакета, ссылки только на его
 * коды, без причинности и слова «значимо».
 */
export const AI_BRIEF_SYSTEM_PROMPT =
    'Ты помощник руководителя отдела продаж. По пакету фактов собери ' +
    'короткое резюме периода строго по JSON-схеме. Правила: каждое число ' +
    'в тексте обязано присутствовать в пакете фактов; каждый буллет ' +
    'ссылается на коды фактов пакета в factRefs; не больше 30 слов в ' +
    'буллете; не утверждай причин и следствий («из-за», «привело», ' +
    '«поэтому»); не используй слова «значимо», «статистически», ' +
    '«достоверно»; пиши по-русски, по делу, без вводных.';

/**
 * Символов на токен в оценке расхода по длине (usage провайдера не
 * пришёл). Оценка грубая и помечается `estimated` — точный расход даёт
 * только ответ провайдера.
 */
export const AI_BRIEF_CHARS_PER_TOKEN = 4;

/** Знаков после запятой в цене вызова, ₽. */
export const AI_BRIEF_PRICE_DECIMALS = 4;

/** Ключ подавления повторных Telegram-оповещений: домен + код ошибки. */
export const AI_BRIEF_ALERT_KEY_PREFIX = 'ai-analytics:brief' as const;
