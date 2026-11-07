/** Откуда взят календарь года: живой источник или фиксированный список ТК РФ. */
export const RU_WORK_CALENDAR_SOURCES = ['live', 'fallback'] as const;
export type RuWorkCalendarSource = (typeof RU_WORK_CALENDAR_SOURCES)[number];

/** Производственный календарь РФ на год. Даты — 'YYYY-MM-DD'. */
export interface RuWorkCalendarYear {
    year: number;
    /**
     * Нерабочие дни, которые по дню недели были бы рабочими (пн–пт):
     * праздники и перенесённые выходные.
     */
    holidays: string[];
    /** Рабочие дни, выпавшие на субботу или воскресенье (перенос). */
    workingWeekends: string[];
    /** Сокращённые предпраздничные рабочие дни. */
    shortDays: string[];
    source: RuWorkCalendarSource;
}
