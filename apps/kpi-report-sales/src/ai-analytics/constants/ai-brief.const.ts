/**
 * Константы ручки AI-резюме (план Фазы 2, поток 18 `p2-api-brief`,
 * версия 2 «что изменилось и что делать»): TTL кэша, опции джобы, состав
 * пакета фактов, ожидание прошлого периода и правила учёта расхода.
 *
 * Магических строк в коде резюме нет (ai/rules/pbx-typing.md): коды
 * фактов, по которым шаблон строит действия и фокус, приходят из
 * библиотеки (`AI_BRIEF_ACTION_CODES`, `AI_BRIEF_FOCUS_CODES`), виды и
 * единицы — из контракта, типы снапшота — из реестра снапшотов. Тексты
 * (промпт, подписи причин и сравнений) — в `ai-brief-texts.const.ts`.
 */
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_BRIEF_ACTION_CODES,
    AI_BRIEF_FOCUS_CODES,
    type AiBriefFactKind,
    type AiBriefFactUnit,
} from '@lib/sales-ai-analytics';
import { AI_SANITY_RULES } from '../steps/sanity.types';
import type { AiAnalyticsReadinessMode } from './ai-analytics.const';
import { AI_ANALYTICS_OVERVIEW_JOB_OPTIONS } from './ai-overview.const';

export {
    AI_BRIEF_BASIS_TEXTS,
    AI_BRIEF_EMPTY_PERIMETER_MESSAGE,
    AI_BRIEF_SYSTEM_PROMPT,
    AI_BRIEF_TEMPLATE_FALLBACK_TEXT,
    AI_BRIEF_TEMPLATE_REASON_TEXTS,
} from './ai-brief-texts.const';

/**
 * TTL кэша резюме, секунды: ready — 6 часов (план §3.4), error — конверт
 * ошибки процессора на 120 с (промах не ставит джобу заново сразу после
 * падения — как у обзора), prev — факты прошлого периода сутки (прошлый
 * период закрыт, его числа не меняются).
 */
export const AI_BRIEF_TTL_SECONDS = {
    ready: 6 * 60 * 60,
    error: 120,
    prev: 24 * 60 * 60,
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

/**
 * Сколько джоба резюме ждёт обзоры периода и прошлого периода (та же
 * очередь, оба ожидания идут разом): меньше половины своего таймаута,
 * чтобы после ожидания осталось время на модель. Не дождалась — резюме
 * собирается без сравнения (fail-open).
 */
export const AI_BRIEF_OVERVIEW_WAIT_MS = 45_000;

/**
 * Опции джоб обзора, которые ставит джоба резюме: приоритет
 * пользовательской джобы — резюме ждёт их результата, и низкий приоритет
 * прогрева оставил бы его без сравнения при занятой очереди.
 */
export const AI_BRIEF_OVERVIEW_JOB_OPTIONS = AI_ANALYTICS_OVERVIEW_JOB_OPTIONS;

/** TTL счётчика квоты: сутки с запасом на разницу TZ портала и контейнера. */
export const AI_BRIEF_QUOTA_TTL_SECONDS = 26 * 60 * 60;

/**
 * Тип и адресация ais-записи резюме. Ключ периода — период и
 * нормализованный ростер (`buildBriefPeriodKey`), а не packHash: так
 * `upsert` стора замещает прежние резюме того же периода и состава
 * (`superseded`), и рост `ais` ограничен числом периодов, а не числом
 * пересчётов; packHash остаётся в нагрузке (`BriefSnapshot.packHash`) и в
 * `inputsHash` конверта — повтор с тем же пакетом записи не создаёт.
 */
export const AI_BRIEF_SNAPSHOT_RECORD = {
    TYPE: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
    APP: AI_ANALYTICS_SNAPSHOT_APP,
    PROVIDER: AI_ANALYTICS_SNAPSHOT_PROVIDER,
} as const;

/**
 * Потолок длины ключа периода резюме: форма зерна `portal-hash` стора
 * (`AI_ANALYTICS_SNAPSHOT_KEY_PATTERNS`) — до 64 символов `[A-Za-z0-9_.:-]`;
 * запись с более длинным ключом стор не прочитал бы обратно.
 */
export const AI_BRIEF_PERIOD_KEY_MAX_LENGTH = 64;

/** Коды фактов пакета (плана §4 таблица состава evidence pack, версия 2). */
export const AI_BRIEF_FACT_CODES = {
    alerts: AI_BRIEF_ACTION_CODES.alerts,
    alertsUnhandled: AI_BRIEF_ACTION_CODES.alertsUnhandled,
    attention: 'attention',
    focus1: AI_BRIEF_FOCUS_CODES[0],
    focus2: AI_BRIEF_FOCUS_CODES[1],
    focus3: AI_BRIEF_FOCUS_CODES[2],
    funnelGap: AI_BRIEF_ACTION_CODES.funnelGap,
    planVsFactSales: 'plan_vs_fact_sales',
    pipelineFromStage: 'pipeline_from_stage',
    disciplineNextStep: AI_BRIEF_ACTION_CODES.disciplineNextStep,
    agenda: AI_BRIEF_ACTION_CODES.agenda,
    callsOverThreshold: 'calls_over_threshold',
    airtime: 'airtime',
    forecastP50: 'forecast_p50',
    dataQuality: AI_BRIEF_ACTION_CODES.dataQuality,
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

/** Подпись фактов фокуса: фраза факта — «{сигнал}: {заголовок карточки}». */
const FOCUS_SPEC: Omit<AiBriefFactSpec, 'priority'> = {
    kind: 'deviation',
    unit: 'count',
    title: 'Фокус внимания',
};

/**
 * Состав пакета: коды таблицы плана в её порядке.
 *
 * ⚠ Обрезка `trimEvidencePack` сортирует по ВИДУ факта
 * (`AI_BRIEF_FACT_PRIORITY`: alert → deviation → finance → discipline →
 * telephony → data-quality), а внутри вида сохраняет порядок входа.
 * Порядок этой таблицы совпадает с порядком видов везде, кроме
 * `forecast_p50`: по смыслу он финансовый (`finance`), поэтому при
 * обрезке по байтам выживает вместе с продажами, хотя в таблице стоит
 * позже. Числа фактов это не меняет — меняется только то, что
 * отбрасывается первым при переполнении 8 КБ.
 */
export const AI_BRIEF_FACT_SPECS: Record<AiBriefFactCode, AiBriefFactSpec> = {
    [AI_BRIEF_FACT_CODES.alerts]: {
        kind: 'alert',
        unit: 'count',
        title: 'Сигналов риска за период',
        priority: 1,
    },
    [AI_BRIEF_FACT_CODES.alertsUnhandled]: {
        kind: 'alert',
        unit: 'count',
        title: 'Неотработанных сигналов риска в пульсе',
        priority: 2,
    },
    [AI_BRIEF_FACT_CODES.attention]: {
        kind: 'deviation',
        unit: 'count',
        // По кэшу обзора считаются менеджеры с сигналом (в строке лежит
        // старшая карточка менеджера), поэтому подпись — про менеджеров,
        // а не про карточки: число резюме обязано сходиться с вкладкой.
        title: 'Менеджеров с сигналом «Внимание»',
        priority: 3,
    },
    [AI_BRIEF_FACT_CODES.focus1]: { ...FOCUS_SPEC, priority: 4 },
    [AI_BRIEF_FACT_CODES.focus2]: { ...FOCUS_SPEC, priority: 5 },
    [AI_BRIEF_FACT_CODES.focus3]: { ...FOCUS_SPEC, priority: 6 },
    [AI_BRIEF_FACT_CODES.funnelGap]: {
        kind: 'deviation',
        unit: 'share',
        // Сборщик дописывает шаг воронки словами: «… на шаге «звонок →
        // презентация»».
        title: 'Сильнее всего отстаём от нормы на шаге',
        priority: 7,
    },
    [AI_BRIEF_FACT_CODES.planVsFactSales]: {
        kind: 'finance',
        unit: 'count',
        title: 'Продаж за период',
        priority: 8,
    },
    [AI_BRIEF_FACT_CODES.pipelineFromStage]: {
        kind: 'finance',
        unit: 'count',
        title: 'Ожидаем продаж из сделок в работе',
        priority: 9,
    },
    [AI_BRIEF_FACT_CODES.disciplineNextStep]: {
        kind: 'discipline',
        unit: 'share',
        title: 'Доля звонков с назначенным шагом и датой',
        priority: 10,
    },
    [AI_BRIEF_FACT_CODES.agenda]: {
        kind: 'discipline',
        unit: 'count',
        title: 'Звонков в повестке планёрки',
        priority: 11,
    },
    [AI_BRIEF_FACT_CODES.callsOverThreshold]: {
        kind: 'telephony',
        unit: 'count',
        title: 'Разобрано звонков за период',
        priority: 12,
    },
    [AI_BRIEF_FACT_CODES.airtime]: {
        kind: 'telephony',
        unit: 'sec',
        title: 'Эфирное время отдела за месяц',
        priority: 13,
    },
    [AI_BRIEF_FACT_CODES.forecastP50]: {
        kind: 'finance',
        unit: 'count',
        title: 'Прогноз продаж на месяц (средний сценарий)',
        priority: 14,
    },
    [AI_BRIEF_FACT_CODES.dataQuality]: {
        kind: 'data-quality',
        unit: 'count',
        title: 'Замечаний к качеству данных',
        priority: 15,
    },
};

/**
 * Подпись факта `attention` при промахе кэша обзора: запасной источник —
 * утечки рёбер снапшота прогноза, а не карточки вкладки, и подпись
 * говорит об этом прямо (числа резюме проверяются по вкладке).
 */
export const AI_BRIEF_ATTENTION_LEAKS_TITLE =
    'Шагов воронки с потерями по прогнозу';

/**
 * Подписи фактов при промахе кэша обзора: число берётся из запасного
 * источника с другим окном, и подпись честно называет это окно — месяц
 * конца периода (месячные снапшоты), последние рабочие дни (пульс) или
 * неделю (недельные снапшоты). С прошлым периодом такие факты не
 * сравниваются: окна разные.
 */
export const AI_BRIEF_FALLBACK_TITLES = {
    planVsFactSales: 'Продаж за месяц',
    callsOverThreshold: 'Разобрано звонков за месяц',
    alertsPulse: 'Сигналов риска за последние рабочие дни',
    alertsWeek: 'Сигналов риска за неделю',
} as const;

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

/**
 * Коды замечаний про даты в сделках: продажи, «закрытые» раньше
 * активности по ним. Их наличие даёт действие «Проверить даты в сделках»
 * вместо общего «Проверить качество данных». Замечания о рабочем
 * календаре сюда не входят — они не про сделки.
 */
export const AI_BRIEF_DATE_QUALITY_CODES: readonly string[] = [
    AI_SANITY_RULES.timestampLeak,
];

/** Верхняя граница строк выборок снапшотов сборщиком пакета. */
export const AI_BRIEF_SNAPSHOT_LIMIT = 500;

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
