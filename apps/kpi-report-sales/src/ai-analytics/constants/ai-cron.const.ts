/**
 * Кроны AI-аналитики с учётом часовых поясов порталов (план Фазы 3, П10
 * «p3-tz-crons», ответ владельца В10): целевое время задаётся ЛОКАЛЬНЫМИ
 * часами портала (settings.calendar.timeZone; без пояса — Europe/Moscow),
 * МСК-значения Фаз 1–2 перенесены как есть. Контейнер живёт в UTC, поэтому
 * тик крона — ежечасный на минуте слота, а «пора ли» решает
 * cron/local-hour.util.ts::isLocalHour по часам портала; повтор тика
 * дубля не даёт — jobId детерминирован датой портала. Портал в
 * Asia/Novosibirsk получает дайджест в свои 08:00, московские — без
 * изменения времени.
 *
 * Файл отдельный от constants/ai-analytics.const.ts (лимит 300 строк и
 * правило владения общими файлами): здесь только слоты и тики.
 */

/**
 * Слот локального времени портала: час и минута, при необходимости день
 * недели ISO (1 — понедельник … 7 — воскресенье) и число месяца.
 */
export interface AiLocalSlot {
    hour: number;
    minute: number;
    weekday?: number;
    dayOfMonth?: number;
}

/**
 * Целевые локальные часы кронов. Ночной пересчёт идёт после ночных KPI и
 * до прогрева; месячный аудит Фазы 0 — следом за снимком планов.
 */
export const AI_ANALYTICS_LOCAL_HOURS = {
    /** Повестка РОПам: понедельник 08:30. */
    AGENDA: { hour: 8, minute: 30, weekday: 1 },
    /** Утренний разбор менеджерам и сводный дайджест: ежедневно 08:00. */
    DIGEST: { hour: 8, minute: 0 },
    /** Ночной пересчёт конвейера: ежедневно 03:45. */
    NIGHTLY: { hour: 3, minute: 45 },
    /** Недельный пересчёт (закончившаяся неделя): понедельник 03:15. */
    WEEKLY: { hour: 3, minute: 15, weekday: 1 },
    /** Прогрев обзора: ежедневно 05:30. */
    PREWARM: { hour: 5, minute: 30 },
    /** Заморозка закрытого месяца: 3-го числа 04:00. */
    MONTHLY: { hour: 4, minute: 0, dayOfMonth: 3 },
    /** Снимок планов руководителя: 1-го числа 04:00. */
    PLANS: { hour: 4, minute: 0, dayOfMonth: 1 },
    /** Месячный аудит данных Фазы 0: 1-го числа 04:10. */
    AUDIT: { hour: 4, minute: 10, dayOfMonth: 1 },
} as const satisfies Record<string, AiLocalSlot>;
export type AiAnalyticsLocalHourKey = keyof typeof AI_ANALYTICS_LOCAL_HOURS;

/** Ежечасный тик крона на минуте слота; локальный час проверяет планировщик. */
export function hourlyTickCron(slot: AiLocalSlot): string {
    return `${slot.minute} * * * *`;
}

/** Тики push-контура: повестка — на :30, дайджесты — на :00 каждого часа. */
export const AI_ANALYTICS_PUSH_CRON = {
    AGENDA: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.AGENDA),
    DIGEST: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.DIGEST),
} as const;

/** Тики ночного конвейера: :45 ночной, :15 недельный, :00 заморозка и планы. */
export const AI_PIPELINE_CRON = {
    NIGHTLY: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.NIGHTLY),
    WEEKLY: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.WEEKLY),
    MONTHLY: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.MONTHLY),
    PLANS: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.PLANS),
} as const;

/** Тик прогрева обзора: на :30 каждого часа (локально 05:30). */
export const AI_ANALYTICS_PREWARM_CRON = hourlyTickCron(
    AI_ANALYTICS_LOCAL_HOURS.PREWARM,
);

/** Тик месячного аудита Фазы 0: на :10 каждого часа (локально 1-го 04:10). */
export const AI_ANALYTICS_AUDIT_CRON = hourlyTickCron(
    AI_ANALYTICS_LOCAL_HOURS.AUDIT,
);
