import { IBXDeal } from '@/modules/bitrix';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { reopenableBaseDeal } from '../lib/reopenable-base-deal';

const category = (bitrixId: string): IPCategory =>
    ({
        bitrixId,
        code: 'sales_base',
        stages: [
            { code: 'sales_cold', bitrixId: 'PREPARATION' },
            { code: 'sales_fail', bitrixId: 'LOSE' },
            { code: 'sales_double', bitrixId: 'APOLOGY' },
            { code: 'sales_not_ca', bitrixId: 'NOT_CA' },
            { code: 'sales_not_call', bitrixId: 'NOT_CALL' },
            { code: 'sales_success', bitrixId: 'WON' },
        ],
    }) as unknown as IPCategory;

const deal = (CATEGORY_ID: string, STAGE_ID: string): IBXDeal =>
    ({ ID: '32995', CATEGORY_ID, STAGE_ID, CLOSED: 'Y' }) as unknown as IBXDeal;

/** Какие закрытые основные ХО возвращает в работу (garant, 14.10.2026). */
describe('reopenableBaseDeal', () => {
    it.each(['C31:LOSE', 'C31:APOLOGY', 'C31:NOT_CA'])(
        'отказ (%s) — возвращаем',
        stageId => {
            const entry = deal('31', stageId);
            expect(reopenableBaseDeal(entry, category('31'))).toBe(entry);
        },
    );

    it.each(['C31:NOT_CALL', 'C31:WON', 'C31:PREPARATION'])(
        '«Не беспокоить», продажа или открытая стадия (%s) — нет',
        stageId => {
            expect(
                reopenableBaseDeal(deal('31', stageId), category('31')),
            ).toBeNull();
        },
    );

    it('общая воронка (0): STAGE_ID без префикса C0:', () => {
        const entry = deal('0', 'LOSE');
        expect(reopenableBaseDeal(entry, category('0'))).toBe(entry);
    });

    it('стадии нет в слепке портала — нет (как раньше, новая основная)', () => {
        expect(
            reopenableBaseDeal(deal('31', 'C31:UC_X1'), category('31')),
        ).toBeNull();
    });

    it('сделка другой воронки — нет', () => {
        expect(
            reopenableBaseDeal(deal('33', 'C33:LOSE'), category('31')),
        ).toBeNull();
    });

    it('нет входной сделки или воронка ОП не настроена — нет', () => {
        expect(reopenableBaseDeal(null, category('31'))).toBeNull();
        expect(reopenableBaseDeal(deal('31', 'C31:LOSE'), null)).toBeNull();
    });
});
