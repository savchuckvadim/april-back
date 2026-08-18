import {
    companyOnlyLinks,
    crmDateToPortalMs,
    extractCrmIds,
    hasDoneInWindow,
    isoToCrmDateTime,
    isoToPortalMs,
} from '../lib/ss-restore.util';

describe('ss-restore.util', () => {
    describe('isoToCrmDateTime', () => {
        it('конвертирует ISO Bitrix в формат ork_event_date', () => {
            expect(isoToCrmDateTime('2026-05-12T09:15:07+03:00')).toBe(
                '12.05.2026 09:15:07',
            );
        });
        it('пустая строка на мусор', () => {
            expect(isoToCrmDateTime('')).toBe('');
        });
    });

    describe('extractCrmIds', () => {
        it('вынимает компанию/сделку/контакт из смешанных привязок', () => {
            expect(extractCrmIds(['D_172003', 'CO_98511', 'C_555'])).toEqual({
                companyId: 98511,
                dealId: 172003,
                contactId: 555,
            });
        });
        it('null при отсутствии', () => {
            expect(extractCrmIds([])).toEqual({
                companyId: null,
                dealId: null,
                contactId: null,
            });
        });
    });

    describe('companyOnlyLinks', () => {
        it('оставляет только CO_ (поле «Компания» строгое)', () => {
            expect(companyOnlyLinks(['D_1', 'CO_2', 'C_3'], null)).toEqual([
                'CO_2',
            ]);
        });
        it('фолбэк на companyId, если CO_ нет', () => {
            expect(companyOnlyLinks(['D_1'], 98511)).toEqual(['CO_98511']);
        });
        it('пусто без CO_ и без companyId', () => {
            expect(companyOnlyLinks(['D_1'], null)).toEqual([]);
        });
    });

    describe('hasDoneInWindow (окно ±2 дня, портальное время)', () => {
        const closed = '2026-05-12T10:00:00+03:00';

        it('находит «Состоялся» в пределах окна', () => {
            expect(hasDoneInWindow(closed, ['13.05.2026 09:00:00'])).toBe(true);
        });
        it('не находит за пределами окна', () => {
            expect(hasDoneInWindow(closed, ['16.05.2026 10:00:01'])).toBe(
                false,
            );
        });
        it('границы включительно', () => {
            expect(hasDoneInWindow(closed, ['14.05.2026 10:00:00'])).toBe(true);
            expect(hasDoneInWindow(closed, ['10.05.2026 10:00:00'])).toBe(true);
        });
        it('битые даты не матчатся', () => {
            expect(hasDoneInWindow(closed, ['мусор'])).toBe(false);
            expect(hasDoneInWindow('мусор', ['13.05.2026 09:00:00'])).toBe(
                false,
            );
        });
    });

    describe('парсеры дат согласованы между собой', () => {
        it('ISO и crm-формат одного момента дают одинаковые мс', () => {
            expect(isoToPortalMs('2026-05-12T09:15:07+03:00')).toBe(
                crmDateToPortalMs('12.05.2026 09:15:07'),
            );
        });
    });
});
