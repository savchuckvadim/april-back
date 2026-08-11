import {
    SKAP_EVENT_TREND_THRESHOLD_PCT,
    SkapEventCode,
    normalizeSkapLogin,
} from '@lib/portal-lib/pbx/pbx-skap-smart';

/** Строка истории клиента (skap_import_items до текущего месяца). */
export interface SkapEventHistoryRow {
    login: string;
    period: Date;
    sessionCount: number | null;
}

export interface SkapEventsInput {
    login: string;
    /** 1-е число отчётного месяца. */
    period: Date;
    sessionCount: number;
    /** Записи клиента за прошлые месяцы (любые логины). */
    history: SkapEventHistoryRow[];
}

const sameMonth = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * Типизация событий месяца по логину: сравнение с историей клиента из
 * skap_import_items (см. SKAP_EVENT_ITEMS). Чистая функция — легко
 * тестируется и переиспользуется в отчётах.
 */
export function computeSkapEvents(input: SkapEventsInput): SkapEventCode[] {
    const events: SkapEventCode[] = [];
    const login = normalizeSkapLogin(input.login);
    const history = input.history.filter(row => row.period < input.period);

    if (!history.length) {
        events.push('first_client_month');
    } else if (!history.some(row => normalizeSkapLogin(row.login) === login)) {
        events.push('new_login');
    }

    const prevMonth = new Date(
        input.period.getFullYear(),
        input.period.getMonth() - 1,
        1,
    );
    const prevRow = history.find(
        row =>
            normalizeSkapLogin(row.login) === login &&
            sameMonth(row.period, prevMonth),
    );
    if (prevRow?.sessionCount != null && prevRow.sessionCount > 0) {
        const changePct =
            ((input.sessionCount - prevRow.sessionCount) /
                prevRow.sessionCount) *
            100;
        if (changePct >= SKAP_EVENT_TREND_THRESHOLD_PCT) {
            events.push('growth');
        } else if (changePct <= -SKAP_EVENT_TREND_THRESHOLD_PCT) {
            events.push('drop');
        }
    }

    if (input.sessionCount === 0) {
        events.push('inactive');
    }
    return events;
}
