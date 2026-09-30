import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    getLeadRequestAcceptState,
    historyActor,
    LEAD_REQUEST_HISTORY_MAX_ENTRIES,
    LEAD_REQUEST_HISTORY_TEXT,
} from '../lead-request-history.util';
import { ETimeZone } from '@lib/shared/lib/date';

const TZ = 'Europe/Moscow' as ETimeZone;

describe('lead-request-history.util', () => {
    it('запись с таймштампом и текстом', () => {
        const entry = buildLeadRequestHistoryEntry('ХО назначен: 447', TZ);
        expect(entry).toMatch(
            /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} — ХО назначен: 447$/,
        );
    });

    it('append сохраняет прошлые записи (append-only)', () => {
        const history = appendLeadRequestHistory(
            ['01.08.2026 10:00 — Появилась'],
            buildLeadRequestHistoryEntry('ХО назначен: 447', TZ),
        );
        expect(history).toHaveLength(2);
        expect(history[0]).toBe('01.08.2026 10:00 — Появилась');
    });

    it('тот же текст подряд не дублируется (двойной клик)', () => {
        const first = appendLeadRequestHistory(
            [],
            buildLeadRequestHistoryEntry('ХО назначен: 447', TZ),
        );
        const second = appendLeadRequestHistory(
            first,
            buildLeadRequestHistoryEntry('ХО назначен: 447', TZ),
        );
        expect(second).toHaveLength(1);
    });

    it('null/мусор в текущем значении не ломают append', () => {
        const history = appendLeadRequestHistory(
            null,
            buildLeadRequestHistoryEntry('Отказ', TZ),
        );
        expect(history).toHaveLength(1);
    });

    it('accept-state: принятие валидно только ПОСЛЕ последнего назначения', () => {
        const tz = TZ;
        const assigned = buildLeadRequestHistoryEntry(
            LEAD_REQUEST_HISTORY_TEXT.assigned(447),
            tz,
        );
        const accepted = buildLeadRequestHistoryEntry(
            LEAD_REQUEST_HISTORY_TEXT.accepted(447),
            tz,
        );
        const transferred = buildLeadRequestHistoryEntry(
            LEAD_REQUEST_HISTORY_TEXT.transferred(447, 9),
            tz,
        );

        // Назначена, не принята.
        expect(
            getLeadRequestAcceptState([assigned], tz).acceptedAfterAssign,
        ).toBe(false);
        // Назначена → принята.
        expect(
            getLeadRequestAcceptState([assigned, accepted], tz)
                .acceptedAfterAssign,
        ).toBe(true);
        // Принята, но потом ПЕРЕДАНА другому → принимать заново.
        expect(
            getLeadRequestAcceptState([assigned, accepted, transferred], tz)
                .acceptedAfterAssign,
        ).toBe(false);
        // Записей нет — истина неизвестна.
        expect(
            getLeadRequestAcceptState([], tz).acceptedAfterAssign,
        ).toBeNull();
        // Момент назначения распарсен (точка отсчёта firstprepare).
        expect(
            getLeadRequestAcceptState([assigned], tz).lastAssignedAt,
        ).toBeInstanceOf(Date);
    });

    /*
     * Историю читают люди: «Вадим Савчук» вместо «447». id остаётся
     * страховкой, когда портал не отдал сотрудника.
     */
    it('historyActor: имя из карты, без имени — id, без id — null', () => {
        const names = { 447: 'Вадим Савчук' };
        expect(historyActor(names, 447)).toBe('Вадим Савчук');
        expect(historyActor(names, 465)).toBe(465);
        expect(historyActor(undefined, 465)).toBe(465);
        expect(historyActor(names, null)).toBeNull();
        expect(historyActor(names, undefined)).toBeNull();
        expect(historyActor(names, 0)).toBeNull();
    });

    it('тексты событий подставляют имена, пустой участник — «—»', () => {
        const names = { 447: 'Вадим Савчук', 465: 'Иван Петров' };
        expect(
            LEAD_REQUEST_HISTORY_TEXT.transferred(
                historyActor(names, 447),
                historyActor(names, 465),
            ),
        ).toBe('ХО передан: Вадим Савчук → Иван Петров');
        expect(
            LEAD_REQUEST_HISTORY_TEXT.accepted(historyActor(names, 465)),
        ).toBe('Заявка принята в работу: Иван Петров');
        expect(LEAD_REQUEST_HISTORY_TEXT.accepted(historyActor(names, 0))).toBe(
            'Заявка принята в работу',
        );
        // SLA: формулировка прежняя, меняется только участник.
        expect(
            LEAD_REQUEST_HISTORY_TEXT.notAccepted(60, historyActor(names, 447)),
        ).toBe('Не принял за 60 мин: Вадим Савчук');
        expect(LEAD_REQUEST_HISTORY_TEXT.notAccepted(60, 5)).toBe(
            'Не принял за 60 мин: 5',
        );
        expect(LEAD_REQUEST_HISTORY_TEXT.notAccepted(60, null)).toBe(
            'Не принял за 60 мин: —',
        );
    });

    /*
     * Разбор истории опирается на ПРЕФИКСЫ записей, а не на участника:
     * переход с id на имена не должен ломать расчёт «принята ли заявка».
     */
    it('accept-state с именами вместо id считается так же', () => {
        const names = { 447: 'Вадим Савчук', 9: 'Иван Петров' };
        const entries = [
            LEAD_REQUEST_HISTORY_TEXT.assigned(historyActor(names, 447)),
            LEAD_REQUEST_HISTORY_TEXT.accepted(historyActor(names, 447)),
            LEAD_REQUEST_HISTORY_TEXT.transferred(
                historyActor(names, 447),
                historyActor(names, 9),
            ),
        ].map(text => buildLeadRequestHistoryEntry(text, TZ));

        expect(
            getLeadRequestAcceptState(entries.slice(0, 2), TZ)
                .acceptedAfterAssign,
        ).toBe(true);
        expect(getLeadRequestAcceptState(entries, TZ).acceptedAfterAssign).toBe(
            false,
        );
        expect(
            getLeadRequestAcceptState(entries, TZ).lastAssignedAt,
        ).toBeInstanceOf(Date);
    });

    it('история обрезается по максимуму, свежие записи сохраняются', () => {
        const long = Array.from(
            { length: LEAD_REQUEST_HISTORY_MAX_ENTRIES },
            (_, index) => `01.01.2026 00:00 — запись ${index}`,
        );
        const appended = appendLeadRequestHistory(
            long,
            buildLeadRequestHistoryEntry('новая', TZ),
        );
        expect(appended).toHaveLength(LEAD_REQUEST_HISTORY_MAX_ENTRIES);
        expect(appended[appended.length - 1]).toContain('новая');
        expect(appended[0]).toContain('запись 1');
    });
});
