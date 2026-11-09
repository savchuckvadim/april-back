import { shiftDate } from '../workdays.util';
import type {
    OwnerReportCall,
    OwnerReportReactivationFacts,
    OwnerReportRefusalSource,
} from './owner-report.types';

/**
 * Признак «реактивация» для отчёта собственнику (правило по ответам
 * владельца 07.11.2026, постановка ai/tasks/2026-11-06-owner-period-report.md):
 * звонок клиенту, у которого сделка «ОП Основная» закрылась отказом не
 * позднее чем за `minDays` дней до звонка, и после этого отказа успешной
 * сделки не было. Открытая новая сделка признак не снимает — это и есть
 * работа по возврату. Отказ свежее `minDays` — доработка, а не возврат.
 *
 * Отказ виден из трёх источников (решение 09.11.2026): финал сделки —
 * основной; запись «ОП История» типа «Отказ» и поля сделки («Нет
 * перспектив», «ОП Причина Отказа», «Не интересует») — вторичные, записи
 * менеджеров бывают неполными, поэтому считаются отдельно.
 */

/** Порог «отказ давно»: раньше — доработка, позже — возврат. */
export const OWNER_REPORT_REACTIVATION_MIN_DAYS = 30;

/** Основной источник отказа — финал сделки. */
const PRIMARY_SOURCE: OwnerReportRefusalSource = 'stage';

/** Закрытая сделка компании: день закрытия (TZ портала) и чем закрылась. */
export interface OwnerReportClosedDeal {
    date: string;
    kind: 'refusal' | 'won';
    /** Откуда известен отказ; нет — финал сделки. */
    source?: OwnerReportRefusalSource;
}

/**
 * Источник отказа, по которому звонок дня `callDate` — реактивация; null —
 * не реактивация. При нескольких отказах в последний день предпочтение
 * основному источнику (финалу сделки).
 */
export function reactivationOf(
    callDate: string,
    history: readonly OwnerReportClosedDeal[],
    minDays: number = OWNER_REPORT_REACTIVATION_MIN_DAYS,
): OwnerReportRefusalSource | null {
    const refusals = history.filter(
        deal => deal.kind === 'refusal' && deal.date <= callDate,
    );
    if (refusals.length === 0) return null;
    const latest = refusals.reduce((max, deal) =>
        deal.date > max.date ? deal : max,
    ).date;
    // Отказ свежее порога — клиента ещё дорабатывают, это не возврат.
    if (latest > shiftDate(callDate, -minDays)) return null;
    const wonAfter = history.some(
        deal =>
            deal.kind === 'won' && deal.date > latest && deal.date <= callDate,
    );
    if (wonAfter) return null;
    const atLatest = refusals.filter(deal => deal.date === latest);
    return atLatest.some(
        deal => (deal.source ?? PRIMARY_SOURCE) === PRIMARY_SOURCE,
    )
        ? PRIMARY_SOURCE
        : (atLatest[0].source ?? PRIMARY_SOURCE);
}

/** Реактивация ли звонок дня `callDate` при такой истории сделок компании. */
export function isReactivationCall(
    callDate: string,
    history: readonly OwnerReportClosedDeal[],
    minDays: number = OWNER_REPORT_REACTIVATION_MIN_DAYS,
): boolean {
    return reactivationOf(callDate, history, minDays) !== null;
}

/** Возвраты периода и по какому источнику виден отказ у каждого. */
export function buildReactivationFacts(
    calls: readonly Pick<OwnerReportCall, 'typeGroup' | 'reactivationSource'>[],
): OwnerReportReactivationFacts {
    const bySource: Record<OwnerReportRefusalSource, number> = {
        stage: 0,
        history: 0,
        fields: 0,
    };
    let total = 0;
    for (const call of calls) {
        if (call.typeGroup !== 'reactivation') continue;
        total += 1;
        bySource[call.reactivationSource ?? PRIMARY_SOURCE] += 1;
    }
    return { calls: total, bySource };
}
