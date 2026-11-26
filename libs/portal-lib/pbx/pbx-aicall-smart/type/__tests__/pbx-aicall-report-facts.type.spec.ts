import {
    CALL_REPORT_ISSUE_CODES,
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_ISSUE_ITEMS,
    CALL_REPORT_OUTCOME_CODES,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_ITEMS,
} from '../pbx-aicall-report-facts.type';

/**
 * Код «связь прервалась» (focus-v3.5, 26.11.2026) — и исход, и сбой. Код
 * записан одной константой на каждый справочник; остальной код берёт её.
 */
describe('справочники фактов разбора: связь прервалась', () => {
    it('именованные константы — один и тот же код в обоих справочниках', () => {
        expect(CALL_REPORT_OUTCOME_CONNECTION_LOST).toBe('connection_lost');
        expect(CALL_REPORT_ISSUE_CONNECTION_LOST).toBe('connection_lost');
    });

    it('исход «связь прервалась» — последний в списке кодов и в ITEMS', () => {
        const codes: readonly string[] = CALL_REPORT_OUTCOME_CODES;
        expect(codes).toContain(CALL_REPORT_OUTCOME_CONNECTION_LOST);
        expect(codes[codes.length - 1]).toBe(
            CALL_REPORT_OUTCOME_CONNECTION_LOST,
        );
        expect(CALL_REPORT_OUTCOME_ITEMS[codes.length - 1]).toEqual({
            CODE: 'connection_lost',
            VALUE: 'Связь прервалась',
            SORT: 600,
        });
    });

    it('сбой «связь прервалась» — сразу после «телефония и связь», с подписью и порядком', () => {
        const codes: readonly string[] = CALL_REPORT_ISSUE_CODES;
        const at = codes.indexOf(CALL_REPORT_ISSUE_CONNECTION_LOST);
        expect(at).toBeGreaterThan(-1);
        expect(codes[at - 1]).toBe('telephony');
        expect(CALL_REPORT_ISSUE_ITEMS[at]).toEqual({
            CODE: 'connection_lost',
            VALUE: 'Связь прервалась посреди разговора',
            SORT: 350,
        });
    });

    it('коды справочников без повторов, у каждого кода есть подпись в том же порядке', () => {
        expect(new Set(CALL_REPORT_OUTCOME_CODES).size).toBe(
            CALL_REPORT_OUTCOME_CODES.length,
        );
        expect(new Set(CALL_REPORT_ISSUE_CODES).size).toBe(
            CALL_REPORT_ISSUE_CODES.length,
        );
        expect(CALL_REPORT_OUTCOME_ITEMS.map(item => item.CODE)).toEqual([
            ...CALL_REPORT_OUTCOME_CODES,
        ]);
        expect(CALL_REPORT_ISSUE_ITEMS.map(item => item.CODE)).toEqual([
            ...CALL_REPORT_ISSUE_CODES,
        ]);
    });

    it('порядок ITEMS по SORT совпадает с порядком кодов', () => {
        const sorts = (items: readonly { SORT: number }[]): number[] =>
            items.map(item => item.SORT);
        for (const items of [
            CALL_REPORT_OUTCOME_ITEMS,
            CALL_REPORT_ISSUE_ITEMS,
        ]) {
            const list = sorts(items);
            expect([...list].sort((a, b) => a - b)).toEqual(list);
        }
    });
});
