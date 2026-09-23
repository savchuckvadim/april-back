/**
 * Дескрипторы типов снапшотов AI-аналитики (план 5.2, Фаза 2 §3.1): зерно
 * (субъект × шаг времени), форма ключа activity_id, ретенция и назначение
 * каждого типа реестра `snapshot-kinds.const.ts`. Отдельный файл — по
 * лимиту 300 строк; реестр типов, статусы и зёрна остаются в реестре.
 * Ретенция в Фазе 2 только читается — физически ничего не удаляется.
 */
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AiAnalyticsSnapshotDescriptor,
    AiAnalyticsSnapshotGrain,
    AiAnalyticsSnapshotRetention,
    AiAnalyticsSnapshotType,
} from './snapshot-kinds.const';

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
            'Резюме витрины (LLM) по запросу: текст и модель провайдера ' +
            'в нагрузке, расход вызова — в колонках tokens_count и price ' +
            '(usage конверта). ' +
            'Ключ — период и нормализованный состав менеджеров (`{from}_{to}_{ростер}`), новое резюме того же периода и состава замещает прежнее (superseded); хэш пакета фактов живёт в `inputsHash`, повтор с тем же пакетом переиспользует запись.',
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
    [AI_ANALYTICS_SNAPSHOT_TYPE.plan]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.plan,
        grain: 'portal-month',
        keyFormat: KEY_FORMAT.month,
        retention: { unit: 'records', value: 36 },
        description:
            'Снимок планов руководителя (UF_USR_A_SALES_PLAN_*) 1-го ' +
            'числа (поток 14a): цели месяца по всем менеджерам и флаг ' +
            '«план = пожелание». Снимается раз в месяц, чтобы копилась ' +
            'история планов и цель месяца не переезжала задним числом.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.trends]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.trends,
        grain: 'manager-week',
        keyFormat: KEY_FORMAT.week,
        retention: { unit: 'records', value: 104 },
        description:
            'Тренды рядов менеджера (Фаза 3, П1): сдвиг уровня, дрейф и выброс ' +
            'по метрикам недели; считает еженедельный шаг trends, читает обзор.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
        grain: 'portal-hash',
        keyFormat: KEY_FORMAT.hash,
        retention: { unit: 'forever', value: null },
        description:
            'Отчёт согласия оценщика (Фаза 3, П7): test-retest разборов одной ' +
            'версией промпта — каппа, ICC, TOST, F1, измеренная σ_llm; одна ' +
            'запись на версию, хранится бессрочно.',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit,
        grain: 'portal-day',
        keyFormat: KEY_FORMAT.day,
        retention: { unit: 'forever', value: null },
        description:
            'Аудит сохранения настроек (план §3.1): автор, изменения по ' +
            'кодам (было/стало, рвёт ли ряд), comparableFrom до и после, ' +
            'paramsVersion. Пишется на каждое settings/save, хранится ' +
            'бессрочно — это журнал «почему ряд разорван».',
    },
    [AI_ANALYTICS_SNAPSHOT_TYPE.ropMark]: {
        type: AI_ANALYTICS_SNAPSHOT_TYPE.ropMark,
        grain: 'portal-week',
        keyFormat: KEY_FORMAT.week,
        retention: { unit: 'forever', value: null },
        description:
            'Подбор недели «три звонка руководителю» (план §12, поток 15): ' +
            'transcriptionId, managerId и причина подбора. Пишется по ' +
            'понедельникам; метки руководителя — записи feedback.',
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
