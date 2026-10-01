import {
    DUPLICATE_ORIGIN,
    DuplicateOrigin,
} from '../constants/duplicate-report.const';
import { DuplicateDeal } from '../types/duplicate-report.types';

/**
 * «КАК ПОЯВИЛАСЬ» СДЕЛКА-ДУБЛЬ — чистые функции. Правила — из разбора
 * garant 30.09.2026 (ai/tasks/2026-09-30-duplicate-deals-report.md), но без
 * привязки к порталу: ни дат переноса, ни id сотрудников.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Название, которое Битрикс подставляет сделке без названия. */
const DEFAULT_TITLE = /^Сделка #\d+$/;

/** Своё название: не пустое и не «Сделка #N», подставленное Битриксом. */
export const hasOwnTitle = (title: string): boolean => {
    const value = title.trim();
    return Boolean(value) && !DEFAULT_TITLE.test(value);
};

/** Сделка стала сделкой из лида, который к тому моменту жил сутки и больше. */
const fromOldLead = (deal: DuplicateDeal): boolean =>
    deal.lead?.createdAt != null &&
    deal.createdAt !== null &&
    deal.createdAt - deal.lead.createdAt >= DAY_MS;

/**
 * Перевод разом: сделка из старого лида создана в те же сутки, что другая
 * сделка клиента из лида. Так выглядит перенос лидов «в работе» в сделки
 * (garant 15–18.09) или массовая обработка — у каждого лида своя сделка.
 */
const isBulkConversion = (
    deal: DuplicateDeal,
    siblings: readonly DuplicateDeal[],
): boolean =>
    fromOldLead(deal) &&
    siblings.some(
        other =>
            other.id !== deal.id &&
            (other.lead !== null || other.sourceLeadId !== null) &&
            other.createdAt !== null &&
            Math.abs(other.createdAt - (deal.createdAt ?? 0)) < DAY_MS,
    );

/**
 * Как появилась сделка `deal`, если у клиента уже была `first` (самая
 * старая из открытых); `siblings` — все сделки клиента.
 *
 * С лидом: перевели разом с другой сделкой клиента — «несколько лидов
 * стали сделками разом»; лид моложе первой сделки — клиент обратился снова
 * («новая заявка»); старше — в работу взяли старый лид. Лид есть, но не
 * прочитан (удалён) либо даты нет — считаем новой заявкой: так появляется
 * большинство сделок из лидов. Без лида: без названия или от интеграции —
 * автоматика, иначе завёл сотрудник.
 */
export function dealOrigin(
    deal: DuplicateDeal,
    first: DuplicateDeal,
    siblings: readonly DuplicateDeal[],
    systemUserIds: ReadonlySet<number>,
): DuplicateOrigin {
    if (deal.lead || deal.sourceLeadId) {
        const leadAt = deal.lead?.createdAt ?? null;
        if (leadAt === null || first.createdAt === null) {
            return DUPLICATE_ORIGIN.newRequest;
        }
        if (isBulkConversion(deal, siblings)) {
            return DUPLICATE_ORIGIN.bulkConversion;
        }
        return leadAt > first.createdAt
            ? DUPLICATE_ORIGIN.newRequest
            : DUPLICATE_ORIGIN.oldLead;
    }
    const bySystem =
        deal.createdById === null || systemUserIds.has(deal.createdById);
    return !hasOwnTitle(deal.title) || bySystem
        ? DUPLICATE_ORIGIN.automation
        : DUPLICATE_ORIGIN.manual;
}
