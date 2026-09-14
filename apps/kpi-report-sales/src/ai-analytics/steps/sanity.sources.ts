/**
 * Источники фактов санити-панели, которые НЕ лежат в шине массивами
 * (план Фазы 2, §4.11; аудит M1/N2): записи менеджер-месяцев из стора
 * снапшотов — уровни для медианы полосы и экспозиция для правила
 * прокси-отсутствий — и плацебо-тест меток времени шага истории стадий
 * (ключ шины `timestampLeak`, форма писателя `TimestampLeakResult`).
 *
 * Экспозиции в шине нет намеренно: её никто туда не кладёт, а месячные
 * снапшоты уже прочитаны панелью ради уровней — второй поход в стор был
 * бы лишним. Разбор структурный: чужая или неполная форма отбрасывается,
 * панель не падает из-за соседа (§5.4).
 */
import { levelFactOf } from './sanity.facts';
import type {
    SanityExposureFact,
    SanityLeakFact,
    SanityLevelFact,
} from './sanity.types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

const asNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Запись менеджер-месяца в объёме панели: менеджер и нагрузка. */
export interface SanityMonthRecord {
    readonly managerId: string | null;
    readonly payload: unknown;
}

/** Факты менеджер-месяцев за один проход по записям стора. */
export interface SanityMonthFacts {
    readonly levels: SanityLevelFact[];
    readonly exposure: SanityExposureFact[];
}

/**
 * Экспозиция менеджер-месяца из нагрузки снапшота
 * (`ManagerMonthPayload.exposure.daysSource`); менеджер — из конверта
 * записи, портальные записи (менеджера нет) пропускаются.
 */
function exposureFactOf(record: SanityMonthRecord): SanityExposureFact[] {
    const exposure = asRecord(asRecord(record.payload)?.exposure);
    const daysSource = exposure?.daysSource;
    return record.managerId !== null &&
        record.managerId !== '' &&
        typeof daysSource === 'string'
        ? [{ managerId: record.managerId, daysSource }]
        : [];
}

/** Уровни и экспозиция из записей `ai-analytics-manager-month`. */
export function monthFactsOf(
    records: readonly SanityMonthRecord[],
): SanityMonthFacts {
    return {
        levels: records.flatMap(record => levelFactOf(record.payload)),
        exposure: records.flatMap(exposureFactOf),
    };
}

/**
 * Плацебо-тест из шины: форма писателя (`TimestampLeakResult` библиотеки,
 * его кладёт шаг истории стадий). Нет значения или чужая форма — null:
 * правило пропускается с причиной, готовность остаётся `unknown`.
 */
export function leakFactOf(value: unknown): SanityLeakFact | null {
    const leak = asRecord(value);
    const n = asNumber(leak?.n);
    const leaked = asNumber(leak?.leaked);
    const sharePct = asNumber(leak?.sharePct);
    const maxPct = asNumber(leak?.maxPct);
    if (
        n === null ||
        leaked === null ||
        sharePct === null ||
        maxPct === null ||
        typeof leak?.flagged !== 'boolean'
    ) {
        return null;
    }
    return { n, leaked, sharePct, maxPct, flagged: leak.flagged };
}
