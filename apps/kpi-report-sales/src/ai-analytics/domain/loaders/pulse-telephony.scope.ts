import type { AiCallReportStatus } from './settings.loader';

/**
 * Чьи звонки считать в доле коротких пульса — тот же круг, что у скана
 * конвейера разбора (event-sales `CallReportScanUseCase`): пилот ∩ отдел
 * продаж, иначе то, что задано. Иначе доля «AI их не разбирает» считалась
 * бы по людям, которых конвейер и так не смотрит.
 */
export interface PulseTelephonyScopeInput {
    /** Статус конвейера портала; нет — дефолты конвейера. */
    callReport?: AiCallReportStatus;
    /** Ростер отдела продаж; null — не читали или он пуст. */
    salesRoster: readonly number[] | null;
}

/** Только отдел продаж — дефолт конвейера, пока портал не сказал «нет». */
export const pulseScopeSalesOnly = (callReport?: AiCallReportStatus): boolean =>
    callReport?.salesOnly !== false;

/**
 * Сотрудники запроса к телефонии: undefined — весь портал (ни пилота, ни
 * ростера). Пустое пересечение пилота с отделом — пилот как есть: сузить
 * запрос нечем, а «никого» Битрикс понял бы как «всех».
 */
export function pulseTelephonyUserIds(
    input: PulseTelephonyScopeInput,
): number[] | undefined {
    const pilot = input.callReport?.pilotUserIds ?? null;
    const roster =
        pulseScopeSalesOnly(input.callReport) && input.salesRoster?.length
            ? input.salesRoster
            : null;
    if (pilot?.length && roster) {
        const both = pilot.filter(id => roster.includes(id));
        return both.length ? both : [...pilot];
    }
    if (pilot?.length) return [...pilot];
    if (roster) return [...roster];
    return undefined;
}
