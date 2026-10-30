import { IBXDeal } from '@/modules/bitrix/domain/crm/deal/interface/bx-deal.interface';
import {
    decideClosedLaunchBaseDeal,
    isClosedLaunchDealEntity,
} from '../services/init/closed-launch-base-deal';

const BASE = '31';

const deal = (over: Record<string, unknown> = {}): IBXDeal =>
    ({
        ID: '95361',
        CATEGORY_ID: BASE,
        CLOSED: 'Y',
        STAGE_SEMANTIC_ID: 'F',
        ASSIGNED_BY_ID: '445',
        ...over,
    }) as unknown as IBXDeal;

const decide = (over: {
    launchDeal?: IBXDeal | null;
    activeDeals?: IBXDeal[];
    continuesWork?: boolean;
}) =>
    decideClosedLaunchBaseDeal({
        launchDeal: over.launchDeal === undefined ? deal() : over.launchDeal,
        baseCategoryId: BASE,
        activeDeals: over.activeDeals ?? [],
        continuesWork: over.continuesWork ?? true,
    });

/**
 * Закрытая в отказ сделка запуска (garant, 06.10.2026: #95361 и новая #95375
 * рядом) — вернуть в работу или честно отметить, куда ушла работа.
 */
describe('decideClosedLaunchBaseDeal', () => {
    it('своя сделка в отказе, других открытых нет — возвращаем в работу', () => {
        const launch = deal();
        expect(decide({ launchDeal: launch })).toEqual({
            reopen: launch,
            closed: null,
        });
    });

    it('у клиента есть другая открытая «ОП Основная» — не трогаем, отмечаем', () => {
        const launch = deal();
        expect(
            decide({
                launchDeal: launch,
                activeDeals: [
                    deal({ ID: '1', CLOSED: 'N', ASSIGNED_BY_ID: '7' }),
                ],
            }),
        ).toEqual({ reopen: null, closed: launch });
    });

    it('закрыта продажей — работа идёт в новую сделку, как раньше', () => {
        const launch = deal({ STAGE_SEMANTIC_ID: 'S' });
        expect(decide({ launchDeal: launch })).toEqual({
            reopen: null,
            closed: launch,
        });
    });

    /*
     * 30.10.2026 (garant #28477 → пустая #110153): закрытую сделку ДРУГОГО
     * сотрудника тоже возвращаем — ответственного сменит SalesBaseDealService.
     */
    it('сделка другого сотрудника в отказе — возвращаем в работу, не дублируем', () => {
        const launch = deal({ ASSIGNED_BY_ID: '999' });
        expect(decide({ launchDeal: launch })).toEqual({
            reopen: launch,
            closed: null,
        });
    });

    it('итоговый отчёт (продажа или отказ) — решать нечего', () => {
        expect(decide({ continuesWork: false })).toEqual({
            reopen: null,
            closed: null,
        });
    });

    it('сделка открыта, другой воронки или её нет — решать нечего', () => {
        const none = { reopen: null, closed: null };
        expect(decide({ launchDeal: deal({ CLOSED: 'N' }) })).toEqual(none);
        expect(decide({ launchDeal: deal({ CATEGORY_ID: '5' }) })).toEqual(
            none,
        );
        expect(decide({ launchDeal: null })).toEqual(none);
    });
});

describe('isClosedLaunchDealEntity', () => {
    it('якорь — закрытая сделка запуска, работа ушла в новую', () => {
        expect(
            isClosedLaunchDealEntity({
                entityType: 'deal',
                entityId: 28477,
                closedLaunchBaseDeal: deal({ ID: '28477' }),
            }),
        ).toBe(true);
    });

    it('компания-якорь, другая сделка или ничего не закрыто — нет', () => {
        const closed = deal({ ID: '28477' });
        expect(
            isClosedLaunchDealEntity({
                entityType: 'company',
                entityId: 28477,
                closedLaunchBaseDeal: closed,
            }),
        ).toBe(false);
        expect(
            isClosedLaunchDealEntity({
                entityType: 'deal',
                entityId: 1,
                closedLaunchBaseDeal: closed,
            }),
        ).toBe(false);
        expect(
            isClosedLaunchDealEntity({
                entityType: 'deal',
                entityId: 28477,
                closedLaunchBaseDeal: null,
            }),
        ).toBe(false);
    });
});
