import type { PortalAppSettingOption } from '../portal-app-settings.schema';

/**
 * Какие итоги периода по менеджерам выпускать — коды настройки
 * `period_digest_kinds` (event-sales, этап 7.4). Общие для реестра настроек
 * (галочки в админке) и разбора значения в apps/event-sales. Коды совпадают
 * с видами периодов @lib/rop-reports (сверяет тест карточки периода в
 * @lib/sales-ai-analytics).
 */
export const PERIOD_DIGEST_KIND = {
    /** Прошлая календарная неделя, понедельник — воскресенье. */
    week: 'week',
    /** Прошлый календарный месяц. */
    month: 'month',
} as const;

export type PeriodDigestKind =
    (typeof PERIOD_DIGEST_KIND)[keyof typeof PERIOD_DIGEST_KIND];

/** Галочки настройки в админке. */
export const PERIOD_DIGEST_KIND_OPTIONS: readonly PortalAppSettingOption[] = [
    { code: PERIOD_DIGEST_KIND.week, name: 'Итоги недели' },
    { code: PERIOD_DIGEST_KIND.month, name: 'Итоги месяца' },
];

/** По умолчанию отмечены оба вида (CSV, как хранит админка). */
export const PERIOD_DIGEST_DEFAULT_KINDS = [
    PERIOD_DIGEST_KIND.week,
    PERIOD_DIGEST_KIND.month,
].join(',');

const KIND_ORDER: readonly PeriodDigestKind[] =
    Object.values(PERIOD_DIGEST_KIND);

/**
 * Значение настройки → виды периодов в порядке справочника, без повторов.
 * Чужие коды отбрасываются; пусто или не строка — ни одного вида (итоги не
 * выпускаются).
 */
export function toPeriodDigestKinds(raw: unknown): PeriodDigestKind[] {
    if (typeof raw !== 'string') return [];
    const picked = new Set(raw.split(',').map(item => item.trim()));
    return KIND_ORDER.filter(code => picked.has(code));
}
