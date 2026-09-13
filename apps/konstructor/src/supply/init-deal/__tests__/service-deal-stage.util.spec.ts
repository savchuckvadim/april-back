import { PortalDealServiceStageCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    daysUntilContractEnd,
    resolveServiceStageCode,
} from '../lib/service-deal-stage.util';

/**
 * Стадия сервисной сделки при поставке считается от остатка срока договора —
 * та же лестница, что у перекладки сделок в event-service.
 */
describe('service-deal-stage.util', () => {
    const NOW = new Date('2026-09-11T00:00:00+03:00');

    describe('daysUntilContractEnd', () => {
        it('считает остаток дней до конца договора', () => {
            expect(daysUntilContractEnd('2026-09-21T00:00:00+03:00', NOW)).toBe(
                10,
            );
        });

        it('для истёкшего договора отдаёт отрицательное число', () => {
            expect(daysUntilContractEnd('2026-09-01T00:00:00+03:00', NOW)).toBe(
                -10,
            );
        });

        it('нет даты или дата нечитаема — null', () => {
            expect(daysUntilContractEnd(null, NOW)).toBeNull();
            expect(daysUntilContractEnd(undefined, NOW)).toBeNull();
            expect(daysUntilContractEnd('', NOW)).toBeNull();
            expect(daysUntilContractEnd('не дата', NOW)).toBeNull();
        });
    });

    describe('resolveServiceStageCode', () => {
        it.each([
            [-5, PortalDealServiceStageCodeEnum.reg_two_weeks],
            [13, PortalDealServiceStageCodeEnum.reg_two_weeks],
            [14, PortalDealServiceStageCodeEnum.reg_one],
            [29, PortalDealServiceStageCodeEnum.reg_one],
            [30, PortalDealServiceStageCodeEnum.reg_three],
            [90, PortalDealServiceStageCodeEnum.reg_three],
            [91, PortalDealServiceStageCodeEnum.reg_six],
            [181, PortalDealServiceStageCodeEnum.reg_six],
            [182, PortalDealServiceStageCodeEnum.in_work],
            [400, PortalDealServiceStageCodeEnum.in_work],
        ])('%s дней → %s', (days, expected) => {
            expect(resolveServiceStageCode(days)).toBe(expected);
        });

        it('без даты — «в работе», нейтральный вход в воронку', () => {
            expect(resolveServiceStageCode(null)).toBe(
                PortalDealServiceStageCodeEnum.in_work,
            );
        });
    });
});
