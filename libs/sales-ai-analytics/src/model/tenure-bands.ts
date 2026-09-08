/**
 * Полосы стажа менеджера (план `ai-sales-analytics`, §4.6 «Уровень, стаж и
 * ramp»; коды реестра `tenure_bands` и `tenure_gates`).
 *
 * Нормы и capacity стратифицируются **по стажу**, а не по уровню РОПа:
 * уровень назначается по результатам и делает норму junior средним слабых,
 * пряча разрыв. Границы полос — один код реестра (`tenure_gates`, дефолт
 * «6/18»), поэтому здесь только разбор строки границ и раскладка стажа по
 * полосам: без DI, Bitrix и `new Date()` внутри (время — параметром).
 */
import type { AiManagerLevelCode } from '../settings/ai-settings.types';

/** Полосы стажа: до полугода, от полугода до полутора лет, дальше. */
export const AI_TENURE_BANDS = ['0-6', '6-18', '18+'] as const;
export type AiTenureBand = (typeof AI_TENURE_BANDS)[number];

/** Границы полос в месяцах стажа: junior — до, senior — от. */
export interface TenureGates {
    junior: number;
    senior: number;
}

/** Дефолт реестра `tenure_gates`: junior < 6 мес., senior ≥ 18 мес. */
export const TENURE_GATES_DEFAULT: TenureGates = { junior: 6, senior: 18 };

/** Разделитель строкового значения кода реестра `tenure_gates` («6/18»). */
const GATES_SEPARATOR = '/';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isAiTenureBand(value: unknown): value is AiTenureBand {
    return (
        typeof value === 'string' &&
        (AI_TENURE_BANDS as readonly string[]).includes(value)
    );
}

/**
 * Разбор значения `tenure_gates` («6/18»). Битая строка, нечисловые части,
 * ноль, отрицательные значения и перевёрнутые границы (senior ≤ junior) —
 * это дефолт реестра, а не исключение: опечатка портала не должна ронять
 * ночной конвейер.
 */
export function parseTenureGates(raw: unknown): TenureGates {
    if (typeof raw !== 'string') return { ...TENURE_GATES_DEFAULT };
    const [junior, senior] = raw
        .split(GATES_SEPARATOR)
        .map(part => Number(part.trim()));
    if (
        !Number.isFinite(junior) ||
        !Number.isFinite(senior) ||
        junior <= 0 ||
        senior <= junior
    ) {
        return { ...TENURE_GATES_DEFAULT };
    }

    return { junior, senior };
}

/**
 * Полных месяцев стажа между датами 'YYYY-MM-DD'. Неполный месяц не
 * засчитывается (5 мес. и 29 дней — это 5 мес.), дата в будущем и любой
 * не-ISO вход дают null: «стаж неизвестен» честнее нуля.
 */
export function tenureMonthsBetween(
    since: string | null,
    until: string,
): number | null {
    if (!since || !ISO_DATE_RE.test(since) || !ISO_DATE_RE.test(until)) {
        return null;
    }
    const [sy, sm, sd] = since.split('-').map(Number);
    const [uy, um, ud] = until.split('-').map(Number);
    const months = (uy - sy) * 12 + (um - sm) - (ud < sd ? 1 : 0);

    return months < 0 ? null : months;
}

/**
 * Полоса стажа по числу месяцев: `5 → '0-6'`, `6 → '6-18'`, `18 → '18+'`.
 * Стаж неизвестен — полосы нет (null), и норма берётся слоем портала:
 * приписать новичка к «18+» значило бы сравнить его с ветеранами.
 */
export function tenureBandOf(
    tenureMonths: number | null,
    gates: TenureGates = TENURE_GATES_DEFAULT,
): AiTenureBand | null {
    if (tenureMonths === null || !Number.isFinite(tenureMonths)) return null;
    if (tenureMonths < gates.junior) return AI_TENURE_BANDS[0];

    return tenureMonths < gates.senior
        ? AI_TENURE_BANDS[1]
        : AI_TENURE_BANDS[2];
}

/**
 * Подсказка уровня по полосе стажа (уровень назначает РОП, система только
 * подсказывает и никогда не понижает автоматически, §4.6). Полосы нет —
 * middle: дефолт витрины Фазы 1b.
 */
export function levelByTenureBand(
    band: AiTenureBand | null,
): AiManagerLevelCode {
    if (band === AI_TENURE_BANDS[0]) return 'junior';

    return band === AI_TENURE_BANDS[2] ? 'senior' : 'middle';
}
