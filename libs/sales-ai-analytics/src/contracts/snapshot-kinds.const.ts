/**
 * Реестр типов снапшотов AI-аналитики в таблице ais (план
 * ai/tasks/ai-sales-analytics-plan.md, 5.1–5.2, 14.2 п. 4): provider =
 * app = 'ai-analytics', model = calcVersion, activity_id = ключ периода,
 * user_id = менеджер, status = 'done' | 'superseded'. Дескриптор типа
 * задаёт зерно (субъект × шаг времени), форму ключа и ретенцию — их
 * читают стор снапшотов и джоба ретенции (ai/rules/pbx-typing.md).
 */
import { AI_ANALYTICS_AUDIT_TYPE } from './audit-snapshot.types';
import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
} from './feedback.types';

/** provider/app всех ais-записей AI-аналитики (общие с контрактом 4). */
export const AI_ANALYTICS_SNAPSHOT_PROVIDER = AI_ANALYTICS_FEEDBACK_PROVIDER;
export const AI_ANALYTICS_SNAPSHOT_APP = AI_ANALYTICS_FEEDBACK_APP;

/**
 * Тип ais-записи настроек витрины. Канонический литерал — здесь;
 * AI_ANALYTICS_SETTINGS_RECORD.TYPE (apps/kpi-report-sales) ссылается
 * на эту константу, своего значения не держит.
 */
export const AI_ANALYTICS_SETTINGS_TYPE = 'ai-analytics-settings';

/** Типы снапшотов по именам (значения — колонка type в ais). */
export const AI_ANALYTICS_SNAPSHOT_TYPE = {
    managerWeek: 'ai-analytics-manager-week',
    managerMonth: 'ai-analytics-manager-month',
    portalModel: 'ai-analytics-portal-model',
    forecast: 'ai-analytics-forecast',
    brief: 'ai-analytics-brief',
    etlRun: 'ai-analytics-etl-run',
    style: 'ai-analytics-style',
    feedback: AI_ANALYTICS_FEEDBACK_TYPE,
    audit: AI_ANALYTICS_AUDIT_TYPE,
    settings: AI_ANALYTICS_SETTINGS_TYPE,
} as const;

/** Порядок — порядок таблицы 5.2 плана (снапшоты Фазы 2, затем 1a/0). */
export const AI_ANALYTICS_SNAPSHOT_TYPES = [
    AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
    AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
    AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
    AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
    AI_ANALYTICS_SNAPSHOT_TYPE.brief,
    AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
    AI_ANALYTICS_SNAPSHOT_TYPE.style,
    AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
    AI_ANALYTICS_SNAPSHOT_TYPE.audit,
    AI_ANALYTICS_SNAPSHOT_TYPE.settings,
] as const;

export type AiAnalyticsSnapshotType =
    (typeof AI_ANALYTICS_SNAPSHOT_TYPES)[number];

export function isAiAnalyticsSnapshotType(
    value: unknown,
): value is AiAnalyticsSnapshotType {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_SNAPSHOT_TYPES as readonly string[]).includes(value)
    );
}

/** Статус ais-записи снапшота (план 5.1): актуальная либо замещённая. */
export const AI_ANALYTICS_SNAPSHOT_STATUS = {
    done: 'done',
    superseded: 'superseded',
} as const;

export const AI_ANALYTICS_SNAPSHOT_STATUSES = [
    AI_ANALYTICS_SNAPSHOT_STATUS.done,
    AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
] as const;
export type AiAnalyticsSnapshotStatus =
    (typeof AI_ANALYTICS_SNAPSHOT_STATUSES)[number];

export function isAiAnalyticsSnapshotStatus(
    value: unknown,
): value is AiAnalyticsSnapshotStatus {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_SNAPSHOT_STATUSES as readonly string[]).includes(value)
    );
}

/**
 * Зерно снапшота — субъект × шаг времени; задаёт форму ключа activity_id:
 * *-week → 'YYYY-Www', *-month → 'YYYY-MM', *-day → 'YYYY-MM-DD',
 * portal-hash → хэш входов.
 */
export const AI_ANALYTICS_SNAPSHOT_GRAINS = [
    'manager-week',
    'manager-month',
    'portal-month',
    'manager-day',
    'portal-day',
    'portal-hash',
] as const;
export type AiAnalyticsSnapshotGrain =
    (typeof AI_ANALYTICS_SNAPSHOT_GRAINS)[number];

/** Зёрна с субъектом-менеджером: managerId обязателен (колонка user_id). */
export const AI_ANALYTICS_MANAGER_GRAINS = [
    'manager-week',
    'manager-month',
    'manager-day',
] as const satisfies readonly AiAnalyticsSnapshotGrain[];

export function isManagerGrain(grain: AiAnalyticsSnapshotGrain): boolean {
    return (AI_ANALYTICS_MANAGER_GRAINS as readonly string[]).includes(grain);
}

/**
 * Единица ретенции: 'records' — сколько записей субъекта хранить,
 * 'days' — сколько дней от created_at, 'forever' — бессрочно.
 */
export const AI_ANALYTICS_SNAPSHOT_RETENTION_UNITS = [
    'records',
    'days',
    'forever',
] as const;
export type AiAnalyticsSnapshotRetentionUnit =
    (typeof AI_ANALYTICS_SNAPSHOT_RETENTION_UNITS)[number];

export interface AiAnalyticsSnapshotRetention {
    unit: AiAnalyticsSnapshotRetentionUnit;
    /** Число записей или дней; null при unit = 'forever'. */
    value: number | null;
}

export interface AiAnalyticsSnapshotDescriptor {
    type: AiAnalyticsSnapshotType;
    grain: AiAnalyticsSnapshotGrain;
    /** Описание ключа activity_id по-русски (форма и смысл). */
    keyFormat: string;
    retention: AiAnalyticsSnapshotRetention;
    description: string;
}

/** Сколько версий одного ключа остаётся после замещения (план 5.2). */
export const AI_ANALYTICS_SNAPSHOT_SUPERSEDED_KEEP = 2;

/**
 * Окно поиска по created_at, когда ключи периодов заранее неизвестны
 * (latest / prune): дальше в прошлое снапшоты не ищем.
 */
export const AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS = 400;

const KEY_FORMAT = {
    month: "'YYYY-MM' — календарный месяц портала",
    week: "'YYYY-Www' — ISO-неделя (год ISO-четверга)",
    day: "'YYYY-MM-DD' — день в TZ портала",
    hash: 'хэш входов запроса (16 hex-символов)',
} as const;

/** Дескрипторы всех типов: зерно, ключ, ретенция, назначение. */
export const AI_ANALYTICS_SNAPSHOT_DESCRIPTORS = {
    [AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
        grain: 'manager-week',
        keyFormat: KEY_FORMAT.week,
        retention: { unit: 'records', value: 104 },
        description:
            'Неделя менеджера: n и средняя оценка по корзинам и типам, ' +
            'разделы, чек-листы, возражения, версии. Пишется пн 03:45, ' +
            'backfill из ais без обращений к Bitrix.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
        grain: 'manager-month',
        keyFormat: KEY_FORMAT.month,
        retention: { unit: 'records', value: 36 },
        description:
            'Месяц менеджера: KPI-вектор, факты по типам звонков, рабочие ' +
            'дни, финансы, s/n рёбер воронки, уровень. Пишется 04:00 за ' +
            'текущий месяц, замораживается на 3-й день следующего.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.portalModel]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
        grain: 'portal-month',
        keyFormat: KEY_FORMAT.month,
        retention: { unit: 'records', value: 36 },
        description:
            'Модель портала за месяц: нормы μ по рёбрам, κ, m_S, S_ref, ' +
            'потолок плана, медиана цикла сделки, готовность витрины.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.forecast]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
        grain: 'manager-day',
        keyFormat: KEY_FORMAT.day,
        retention: { unit: 'days', value: 180 },
        description:
            'Прогноз дня по менеджеру: P10/P50/P90, наивные базы, план дня ' +
            'и рычаги. Пишется ежедневно в теневом режиме.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.brief]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
        grain: 'portal-hash',
        keyFormat: KEY_FORMAT.hash,
        retention: { unit: 'days', value: 30 },
        description:
            'Резюме витрины (LLM) по запросу: текст, tokens_count, price. ' +
            'Ключ — хэш входов, повтор запроса переиспользует запись.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.etlRun]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
        grain: 'portal-day',
        keyFormat: KEY_FORMAT.day,
        retention: { unit: 'days', value: 90 },
        description:
            'Прогон ночного конвейера: шаги, длительности, вызовы Bitrix, ' +
            'загруженные строки и дрейф входов.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.style]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.style,
        grain: 'manager-month',
        keyFormat: KEY_FORMAT.month,
        retention: { unit: 'records', value: 12 },
        description:
            'Стиль менеджера за окно (план 4.6а): оси, подписи-факты, ' +
            'сигнатура набора маркеров; 12 окон, анонимизация после ухода.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.feedback]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
        grain: 'manager-day',
        keyFormat: KEY_FORMAT.day,
        retention: { unit: 'forever', value: null },
        description:
            'Реакции витрины и факты доставки push-контура (контракт 4): ' +
            'хранятся бессрочно, ключ периода не обязателен.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.audit]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.audit,
        grain: 'portal-month',
        keyFormat: KEY_FORMAT.month,
        retention: { unit: 'records', value: 12 },
        description:
            'Месячный аудит данных портала (Фаза 0): отчёт готовности ' +
            'источников, пишут админ-ручка и крон 1-го числа.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.settings]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.settings,
        grain: 'portal-hash',
        keyFormat: "ключ набора настроек ('levels')",
        retention: { unit: 'forever', value: null },
        description:
            'Настройки витрины до появления ключей схемы app-settings ' +
            '(план 5.1): актуальна последняя запись на ключ набора.',
    },
} as const satisfies Record<
    AiAnalyticsSnapshotType,
    AiAnalyticsSnapshotDescriptor
>;

export function snapshotDescriptor(
    type: AiAnalyticsSnapshotType,
): AiAnalyticsSnapshotDescriptor {
    return AI_ANALYTICS_SNAPSHOT_DESCRIPTORS[type];
}

export function snapshotGrain(
    type: AiAnalyticsSnapshotType,
): AiAnalyticsSnapshotGrain {
    return snapshotDescriptor(type).grain;
}

export function snapshotRetention(
    type: AiAnalyticsSnapshotType,
): AiAnalyticsSnapshotRetention {
    return snapshotDescriptor(type).retention;
}

/** Сколько записей оставляет prune; null — ретенция не по числу записей. */
export function snapshotRetentionRecords(
    type: AiAnalyticsSnapshotType,
): number | null {
    const retention = snapshotRetention(type);
    return retention.unit === 'records' ? retention.value : null;
}

/** Глубина ретенции в днях; null — ретенция не по времени. */
export function snapshotRetentionDays(
    type: AiAnalyticsSnapshotType,
): number | null {
    const retention = snapshotRetention(type);
    return retention.unit === 'days' ? retention.value : null;
}

/** Статус шага ночного конвейера (нагрузка снапшота etl-run). */
export const AI_ANALYTICS_ETL_STEP_STATUSES = [
    'ok',
    'failed',
    'skipped',
] as const;
export type AiAnalyticsEtlStepStatus =
    (typeof AI_ANALYTICS_ETL_STEP_STATUSES)[number];
