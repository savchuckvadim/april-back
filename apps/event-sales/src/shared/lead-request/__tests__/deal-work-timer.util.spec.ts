import { startDealWaitingForAccept } from '../deal-work-timer.util';

const ASSIGNED_AT = 'UF_CRM_OP_LEAD_ASSIGNED_AT';
const HISTORY = 'UF_CRM_OP_MHISTORY';
const CRM_DATE = /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/;

/** Портал: таймер и история сделки установлены, если не сказано иначе. */
const makePortal = (codes = ['op_lead_assigned_at', 'op_mhistory']) => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (_entity: string, code: string) =>
        codes.includes(code)
            ? { bitrixId: code.toUpperCase(), items: [] }
            : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const NAMES = { 5: 'Вадим Савчук', 8: 'Иван Петров' };

/** Последняя запись истории сделки после старта ожидания. */
const lastEntry = (fields: Record<string, unknown>): string =>
    (fields[HISTORY] as string[]).at(-1) ?? '';

describe('startDealWaitingForAccept', () => {
    it('передача: таймер + «ХО передан» с именами, прошлое цело', () => {
        const fields: Record<string, unknown> = {};
        startDealWaitingForAccept(
            makePortal() as never,
            fields,
            { ASSIGNED_BY_ID: '5', [HISTORY]: ['01.08.2026 10:00 — старое'] },
            8,
            NAMES,
        );

        expect(String(fields[ASSIGNED_AT])).toMatch(CRM_DATE);
        expect((fields[HISTORY] as string[])[0]).toBe(
            '01.08.2026 10:00 — старое',
        );
        expect(lastEntry(fields)).toContain(
            'ХО передан: Вадим Савчук → Иван Петров',
        );
    });

    it('прежний тот же или его нет — «ХО назначен» с именем', () => {
        for (const previous of ['8', '', undefined]) {
            const fields: Record<string, unknown> = {};
            startDealWaitingForAccept(
                makePortal() as never,
                fields,
                { ASSIGNED_BY_ID: previous, [HISTORY]: [] },
                8,
                NAMES,
            );
            expect(lastEntry(fields)).toContain('ХО назначен: Иван Петров');
        }
    });

    it('имён нет — в записи id (страховка резолвера)', () => {
        const fields: Record<string, unknown> = {};
        startDealWaitingForAccept(
            makePortal() as never,
            fields,
            { ASSIGNED_BY_ID: '5', [HISTORY]: [] },
            8,
        );
        expect(lastEntry(fields)).toContain('ХО передан: 5 → 8');
    });

    it('поля таймера нет — ничего не пишем, даже историю', () => {
        const fields: Record<string, unknown> = {};
        startDealWaitingForAccept(
            makePortal(['op_mhistory']) as never,
            fields,
            { ASSIGNED_BY_ID: '5', [HISTORY]: [] },
            8,
            NAMES,
        );
        expect(fields).toEqual({});
    });

    it('поля истории нет — таймер ставится, история молча пропускается', () => {
        const fields: Record<string, unknown> = {};
        startDealWaitingForAccept(
            makePortal(['op_lead_assigned_at']) as never,
            fields,
            { ASSIGNED_BY_ID: '5' },
            8,
            NAMES,
        );
        expect(String(fields[ASSIGNED_AT])).toMatch(CRM_DATE);
        expect(fields[HISTORY]).toBeUndefined();
    });
});
