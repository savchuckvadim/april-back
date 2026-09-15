import { ClientTypeEnum } from '../../document-generate/type/client.type';
import {
    getMonthTitleAccusative,
    readPbxCurrent,
    resolveClientTypeCode,
    toMoneyString,
    toPbxEntries,
} from '../lib/supply-report.util';

describe('supply-report.util', () => {
    describe('getMonthTitleAccusative', () => {
        it('склоняет месяцы так же, как Laravel', () => {
            expect(getMonthTitleAccusative(1)).toBe('1 месяц');
            expect(getMonthTitleAccusative(2)).toBe('2 месяца');
            expect(getMonthTitleAccusative(4)).toBe('4 месяца');
            expect(getMonthTitleAccusative(5)).toBe('5 месяцев');
            expect(getMonthTitleAccusative(11)).toBe('11 месяцев');
            expect(getMonthTitleAccusative(12)).toBe('12 месяцев');
            expect(getMonthTitleAccusative(21)).toBe('21 месяц');
            expect(getMonthTitleAccusative(22)).toBe('22 месяца');
        });
    });

    describe('toMoneyString', () => {
        it('всегда две цифры после точки', () => {
            expect(toMoneyString(8008)).toBe('8008.00');
            expect(toMoneyString('1234.5')).toBe('1234.50');
            expect(toMoneyString(undefined)).toBe('0.00');
        });
    });

    describe('resolveClientTypeCode', () => {
        it('принимает объект SelectItem легаси-фронта', () => {
            expect(resolveClientTypeCode({ id: 4, code: 'fiz' })).toBe(
                ClientTypeEnum.FIZ,
            );
        });

        it('принимает строку-код', () => {
            expect(resolveClientTypeCode('org_state')).toBe(
                ClientTypeEnum.ORG_STATE,
            );
        });

        it('неизвестное значение сводит к org, как Laravel', () => {
            expect(resolveClientTypeCode(null)).toBe(ClientTypeEnum.ORG);
            expect(resolveClientTypeCode({ code: 'wat' })).toBe(
                ClientTypeEnum.ORG,
            );
        });
    });

    describe('toPbxEntries', () => {
        it('читает объект, ключованный кодом поля — так шлёт фронт', () => {
            const entries = toPbxEntries({
                contract_start: { current: '2026-01-01' },
                supply_information: { current: 'текст' },
            });

            expect(entries.map(([key]) => key)).toEqual([
                'contract_start',
                'supply_information',
            ]);
        });

        it('читает массив с item.key — так шлёт ветка IS_BACK', () => {
            const entries = toPbxEntries([
                { key: 'contract_end', current: '2026-12-31' },
                { key: '', current: 'без ключа' },
            ]);

            expect(entries).toHaveLength(1);
            expect(entries[0][0]).toBe('contract_end');
        });

        it('пусто и мусор не ломают обход', () => {
            expect(toPbxEntries(undefined)).toEqual([]);
            expect(toPbxEntries('строка')).toEqual([]);
        });
    });

    describe('readPbxCurrent', () => {
        it('у enum-поля берёт name', () => {
            expect(
                readPbxCurrent({ current: { name: 'Да', title: 'Да' } }),
            ).toBe('Да');
        });

        it('у строкового поля берёт значение как есть', () => {
            expect(readPbxCurrent({ current: '2026-01-01' })).toBe(
                '2026-01-01',
            );
        });

        it('пустое поле — пустая строка, а не undefined', () => {
            expect(readPbxCurrent({})).toBe('');
            expect(readPbxCurrent(undefined)).toBe('');
        });
    });
});
