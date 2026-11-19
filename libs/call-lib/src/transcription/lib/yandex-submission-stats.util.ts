import {
    MOSCOW_UTC_OFFSET_HOURS,
    spendMinutes,
    type SpendMonthRange,
    type SpendTotals,
} from './transcription-spend.util';

/**
 * Счётчик отправок в Яндекс по порталу и дню — чистые правила (19.11.2026).
 * Таблица расхода видит звонок один раз, а Яндекс берёт деньги за каждую
 * операцию: один звонок мог уходить по нескольку раз. Счётчик ведёт страж
 * отправок в Redis; страница расхода показывает его рядом со звонками.
 */

/** Отправки в Яндекс одного портала (за день или сумма дней). */
export interface YandexSubmissionCount {
    submissions: number;
    /** Сумма длительностей отправленных звонков по телефонии, секунд. */
    seconds: number;
}

/** Счётчик одного дня: портал → отправки. */
export type YandexSubmissionDay = ReadonlyMap<string, YandexSubmissionCount>;

/** Поля хэша дня для портала. Домен не содержит «|». */
export const submissionFields = (
    domain: string,
): { count: string; seconds: string } => ({
    count: `${domain}|n`,
    seconds: `${domain}|sec`,
});

const MS_PER_DAY = 86_400_000;

/** День по Москве, YYYY-MM-DD. */
export function moscowDayKey(at: Date): string {
    return new Date(at.getTime() + MOSCOW_UTC_OFFSET_HOURS * 3_600_000)
        .toISOString()
        .slice(0, 10);
}

/** Все дни месяца по Москве, по порядку. */
export function spendMonthDays(
    range: Pick<SpendMonthRange, 'from' | 'to'>,
): string[] {
    const days: string[] = [];
    for (
        let at = range.from.getTime();
        at < range.to.getTime();
        at += MS_PER_DAY
    ) {
        days.push(moscowDayKey(new Date(at)));
    }
    return days;
}

const toCount = (raw: string | undefined): number => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
};

/** Хэш дня из Redis → портал → отправки. */
export function parseSubmissionHash(
    hash: Readonly<Record<string, string>>,
): Map<string, YandexSubmissionCount> {
    const result = new Map<string, YandexSubmissionCount>();
    for (const field of Object.keys(hash)) {
        const separator = field.lastIndexOf('|');
        if (separator <= 0) continue;
        const domain = field.slice(0, separator);
        if (result.has(domain)) continue;
        const fields = submissionFields(domain);
        result.set(domain, {
            submissions: toCount(hash[fields.count]),
            seconds: toCount(hash[fields.seconds]),
        });
    }
    return result;
}

/**
 * Сумма отправок по дням: один портал или, без `domain`, все. День, за
 * который счётчика нет (до его запуска или старше срока хранения), не
 * считается; нет ни одного такого дня — null («данных нет», а не ноль).
 */
export function sumSubmissions(
    byDay: ReadonlyMap<string, YandexSubmissionDay>,
    days: readonly string[],
    domain?: string,
): YandexSubmissionCount | null {
    let tracked = false;
    const total: YandexSubmissionCount = { submissions: 0, seconds: 0 };
    for (const day of days) {
        const counts = byDay.get(day);
        if (!counts) continue;
        tracked = true;
        const portals = domain ? [counts.get(domain)] : [...counts.values()];
        for (const count of portals) {
            total.submissions += count?.submissions ?? 0;
            total.seconds += count?.seconds ?? 0;
        }
    }
    return tracked ? total : null;
}

/** Поля итога из счётчика отправок; null — счётчика за срез нет. */
export function submissionTotals(
    count: YandexSubmissionCount | null,
): Pick<SpendTotals, 'yandexSubmissions' | 'yandexSubmittedMinutes'> {
    return {
        yandexSubmissions: count ? count.submissions : null,
        yandexSubmittedMinutes: count ? spendMinutes(count.seconds) : null,
    };
}

/** Итог среза (из базы) с отправками в Яндекс за дни (из счётчика). */
export function withSubmissions(
    totals: SpendTotals,
    byDay: ReadonlyMap<string, YandexSubmissionDay>,
    days: readonly string[],
    domain?: string,
): SpendTotals {
    return {
        ...totals,
        ...submissionTotals(sumSubmissions(byDay, days, domain)),
    };
}

/**
 * Дни, когда портал отправлял звонки в Яндекс, — и все порталы с
 * отправками, если `domain` не задан. Нужны строкам, которых нет в базе:
 * звонок отправлялся, а распознанным так и не записан — это и есть
 * деньги без результата.
 */
export function submissionKeys(
    byDay: ReadonlyMap<string, YandexSubmissionDay>,
    days: readonly string[],
    domain?: string,
): string[] {
    const keys = new Set<string>();
    for (const day of days) {
        for (const [portal, count] of byDay.get(day) ?? []) {
            if (count.submissions <= 0) continue;
            if (!domain) keys.add(portal);
            else if (portal === domain) keys.add(day);
        }
    }
    return [...keys];
}
