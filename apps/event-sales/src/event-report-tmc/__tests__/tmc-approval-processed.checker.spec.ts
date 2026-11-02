import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { TMC_DEAL_LINK_FIELD } from '../../event-report/services/deal/tmc-deal-link-fields.const';
import { TmcApprovalProcessedChecker } from '../services/tmc-approval-processed.checker';

/**
 * «Презентация по заявке уже запланирована» — по следам отчёта на сделках
 * компании: презентация, созданная после утверждения; тот же менеджер на ту
 * же минуту; ссылка ТМЦ-сделки. Эталон — реальная пара сделок gsr (ТМЦ
 * 198467 → pres 198521, менеджер 323, утверждена 31.08.2026 15:53:29,
 * презентация 15:00 того же дня, pres-сделка создана 15:53:40).
 */
const TZ = ETimeZone.EUROPE_MOSCOW;
const PLAN_DATE_UF = 'UF_CRM_NEXT_PRES_PLAN_DATE';
const PRES_CATEGORY = { code: 'sales_presentation', bitrixId: '101' };

type Row = Record<string, unknown>;

const presDeal = (over: Row = {}): Row => ({
    ID: '198521',
    ASSIGNED_BY_ID: '323',
    STAGE_ID: 'C101:WON',
    DATE_CREATE: '2026-08-31T15:53:40+03:00',
    [PLAN_DATE_UF]: '2026-08-31T15:00:00+03:00',
    ...over,
});

const makeChecker = ({
    companyDeals = [] as Row[] | Error,
    deals = {} as Record<number, Row | Error>,
    planDateKey = PLAN_DATE_UF,
    // null — воронка презентаций в слепке не известна (undefined взял бы дефолт).
    category = PRES_CATEGORY as Row | null,
} = {}) => {
    const getList = jest.fn(
        (): Promise<unknown> =>
            companyDeals instanceof Error
                ? Promise.reject(companyDeals)
                : Promise.resolve({ result: companyDeals }),
    );
    const get = jest.fn((id: number): Promise<unknown> => {
        const row = deals[id];
        if (row instanceof Error) return Promise.reject(row);
        return Promise.resolve({ result: row ?? null });
    });
    const checker = new TmcApprovalProcessedChecker(
        { deal: { get, getList } } as unknown as BitrixService,
        {
            getDealCategoryByCode: () => category ?? undefined,
            getDealFieldBitrixIdByCode: () => planDateKey,
            getTimezone: () => TZ,
        } as unknown as PortalModel,
    );
    return { checker, get, getList };
};

const query = ({
    deadline = '31.08.2026 15:00:00',
    managerId = 323,
    approvedAt = '31.08.2026 15:53:29' as string | null,
} = {}) => ({
    tmcDealId: 198467,
    companyId: 74649,
    managerId,
    deadline: BitrixDateTime.fromPortalInput(deadline, TZ),
    approvedAt: approvedAt
        ? BitrixDateTime.fromPortalInput(approvedAt, TZ)
        : null,
});

describe('TmcApprovalProcessedChecker', () => {
    it('презентация компании создана после утверждения — обработана, даже если дату и менеджера потом сменили', async () => {
        const { checker, getList, get } = makeChecker({
            companyDeals: [
                presDeal({
                    ASSIGNED_BY_ID: '279',
                    [PLAN_DATE_UF]: '2026-09-05T11:00:00+03:00',
                }),
            ],
        });

        await expect(checker.isProcessed(query())).resolves.toBe(true);
        expect(getList).toHaveBeenCalledWith(
            { COMPANY_ID: 74649, CATEGORY_ID: '101' },
            expect.arrayContaining([
                'ID',
                'ASSIGNED_BY_ID',
                'DATE_CREATE',
                PLAN_DATE_UF,
            ]),
        );
        // След по дате создания достаточен — ТМЦ-сделку читать не пришлось.
        expect(get).not.toHaveBeenCalled();
    });

    it('«создана после» терпит расхождение часов до двух минут, но не раньше', async () => {
        const created = (value: string) =>
            makeChecker({ companyDeals: [presDeal({ DATE_CREATE: value })] })
                .checker;

        // Утверждена 15:53:29 — сделка 15:50 раньше допуска, 15:52 внутри него.
        await expect(
            created('2026-08-31T15:50:00+03:00').isProcessed(
                query({ deadline: '01.09.2026 10:00:00', managerId: 1 }),
            ),
        ).resolves.toBe(false);
        await expect(
            created('2026-08-31T15:52:00+03:00').isProcessed(
                query({ deadline: '01.09.2026 10:00:00', managerId: 1 }),
            ),
        ).resolves.toBe(true);
    });

    it('старая pres-сделка того же менеджера на ту же минуту — обработана; секунды не важны', async () => {
        const { checker } = makeChecker({
            companyDeals: [
                presDeal({ DATE_CREATE: '2026-08-01T10:00:00+03:00' }),
            ],
        });

        await expect(checker.isProcessed(query())).resolves.toBe(true);
        await expect(
            checker.isProcessed(query({ deadline: '31.08.2026 15:00:45' })),
        ).resolves.toBe(true);
    });

    it('ссылка ТМЦ-сделки на презентацию того же менеджера — обработана, даже если дату перенесли', async () => {
        const moved = presDeal({
            DATE_CREATE: '2026-08-01T10:00:00+03:00',
            [PLAN_DATE_UF]: '2026-09-05T11:00:00+03:00',
        });
        const { checker, get } = makeChecker({
            companyDeals: [moved],
            deals: {
                198467: {
                    ID: '198467',
                    [TMC_DEAL_LINK_FIELD.toPresentationSales]: '198521',
                },
            },
        });

        await expect(checker.isProcessed(query())).resolves.toBe(true);
        expect(get).toHaveBeenCalledWith(
            198467,
            expect.arrayContaining([TMC_DEAL_LINK_FIELD.toPresentationSales]),
        );
        // Связанная сделка не из списка компании — дочитывается отдельно.
        const other = makeChecker({
            companyDeals: [],
            deals: {
                198467: {
                    ID: '198467',
                    [TMC_DEAL_LINK_FIELD.toPresentationSales]: '777',
                },
                777: { ID: '777', ASSIGNED_BY_ID: '323' },
            },
        });
        await expect(other.checker.isProcessed(query())).resolves.toBe(true);
    });

    it('следов нет или они про другого менеджера — не обработана', async () => {
        const stranger = presDeal({
            ASSIGNED_BY_ID: '279',
            DATE_CREATE: '2026-08-01T10:00:00+03:00',
        });
        const { checker } = makeChecker({
            companyDeals: [stranger],
            deals: {
                198467: {
                    ID: '198467',
                    [TMC_DEAL_LINK_FIELD.toPresentationSales]: '198521',
                },
            },
        });

        await expect(checker.isProcessed(query())).resolves.toBe(false);
        await expect(makeChecker().checker.isProcessed(query())).resolves.toBe(
            false,
        );
    });

    it('воронка презентаций в слепке не известна — след «создана после» не применяется, список без категории', async () => {
        const { checker, getList } = makeChecker({
            companyDeals: [
                presDeal({
                    ASSIGNED_BY_ID: '279',
                    [PLAN_DATE_UF]: '2026-09-05T11:00:00+03:00',
                }),
            ],
            category: null,
        });

        await expect(checker.isProcessed(query())).resolves.toBe(false);
        expect(getList).toHaveBeenCalledWith(
            { COMPANY_ID: 74649 },
            expect.any(Array),
        );
    });

    it('ошибка чтения уходит наверх — крон пропустит заявку до следующего тика, а не поставит повтор', async () => {
        await expect(
            makeChecker({
                companyDeals: new Error('QUERY_LIMIT_EXCEEDED'),
            }).checker.isProcessed(query()),
        ).rejects.toThrow('QUERY_LIMIT_EXCEEDED');
        await expect(
            makeChecker({
                deals: { 198467: new Error('ERROR_NOT_FOUND') },
            }).checker.isProcessed(query()),
        ).rejects.toThrow('ERROR_NOT_FOUND');
    });
});
