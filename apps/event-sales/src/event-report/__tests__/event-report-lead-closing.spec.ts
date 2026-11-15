import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    LeadClosingCase,
    LeadClosingReader,
} from '../../lead-closing/lead-closing.reader';
import { LeadClosingRunner } from '../../lead-closing/lead-closing.runner';
import { EventReportContext } from '../services/context/event-report.context';
import {
    EventReportLeadClosingService,
    leadClosingAllowed,
    resolveReportBaseDealId,
    shouldCloseLeads,
} from '../services/lead/event-report-lead-closing.service';

/**
 * Закрытие лидов по итогу работы в отчёте «Звонков» (lead_closing_enabled,
 * решения владельца 11–15.11.2026): когда закрывать, какие лиды можно
 * трогать и что уходит в общий модуль закрытия.
 */
const flags = (over: Partial<Parameters<typeof shouldCloseLeads>[0]>) => ({
    isNoCall: false,
    isResult: false,
    isFail: false,
    isSuccessSale: false,
    ...over,
});

describe('shouldCloseLeads — когда отчёт закрывает лиды', () => {
    it('разговор, отказ, продажа — закрывает', () => {
        expect(shouldCloseLeads(flags({ isResult: true }))).toBe(true);
        expect(shouldCloseLeads(flags({ isFail: true }))).toBe(true);
        expect(shouldCloseLeads(flags({ isSuccessSale: true }))).toBe(true);
    });

    it('недозвон с перезвоном и кнопка «Недозвон» — лид во временном статусе', () => {
        expect(shouldCloseLeads(flags({}))).toBe(false);
        expect(
            shouldCloseLeads(flags({ isNoCall: true, isResult: true })),
        ).toBe(false);
    });
});

describe('leadClosingAllowed — какие лиды можно перевести', () => {
    it('в работе — в любую цель', () => {
        expect(leadClosingAllowed('P', 'lead_converted')).toBe(true);
        expect(leadClosingAllowed('P', 'lead_apology')).toBe(true);
    });

    it('сконвертированный — только в брак «Не ЦА» задним числом', () => {
        expect(leadClosingAllowed('S', 'lead_junk')).toBe(true);
        expect(leadClosingAllowed('S', 'lead_apology')).toBe(false);
        expect(leadClosingAllowed('S', 'lead_converted')).toBe(false);
    });

    it('закрытый браком — не переоткрываем', () => {
        expect(leadClosingAllowed('F', 'lead_converted')).toBe(false);
        expect(leadClosingAllowed('P', null)).toBe(false);
    });
});

describe('resolveReportBaseDealId', () => {
    it('реальный id сделки или id, созданный этим батчем', () => {
        expect(resolveReportBaseDealId('100', undefined)).toBe(100);
        expect(resolveReportBaseDealId('$result[set_base_deal]', 555)).toBe(
            555,
        );
        expect(resolveReportBaseDealId(null, undefined)).toBeNull();
    });
});

describe('EventReportLeadClosingService.run', () => {
    const ctx = (over: Record<string, unknown> = {}) =>
        ({
            domain: 'd.b24.ru',
            isNoCall: false,
            isResult: true,
            isFail: false,
            isSuccessSale: false,
            currentBaseDeal: { ID: 100, LEAD_ID: '11' },
            lead: { ID: '12' },
            ...over,
        }) as unknown as EventReportContext;

    const setup = (
        rows: Record<string, unknown>[],
        targets: Record<number, LeadClosingCase['decision']['target']>,
    ) => {
        const all = jest.fn().mockResolvedValue(rows);
        const bitrix = { lead: { all } } as unknown as BitrixService;
        const portal = {
            getEntityFieldByCode: () => undefined,
        } as unknown as PortalModel;
        const read = jest.fn((leads: LeadClosingCase['lead'][]) =>
            Promise.resolve(
                leads.map(lead => ({
                    lead,
                    input: {
                        deal: { id: 100, stage: 'sales_warm' },
                        liveBaseDealId: null,
                        hasOpenWorkElsewhere: false,
                    },
                    decision: {
                        target: targets[lead.id] ?? null,
                        linkDealId: 100,
                        reason: 'deal_open',
                    },
                    linkDealLeadId: 0,
                    linkDealAssignedId: 0,
                    linkCompany: null,
                })),
            ),
        );
        const close = jest.fn((cases: LeadClosingCase[]) =>
            Promise.resolve(
                cases.map(c => ({
                    leadId: c.lead.id,
                    case: c,
                    entry: null,
                    leadOk: null,
                    linkOk: null,
                    tasks: [],
                    activities: [],
                    skipped: null,
                    errors: [],
                })),
            ),
        );
        const service = new EventReportLeadClosingService(
            bitrix,
            portal,
            { read } as unknown as LeadClosingReader,
            { close } as unknown as LeadClosingRunner,
        );
        return { service, all, read, close };
    };

    it('лиды сделки и лид отчёта; решение по рабочей сделке; сконвертированный не трогается', async () => {
        const { service, all, close } = setup(
            [
                {
                    ID: '11',
                    STATUS_ID: 'PBX_TAKEN_IN_WORK',
                    STATUS_SEMANTIC_ID: 'P',
                },
                { ID: '12', STATUS_ID: 'CONVERTED', STATUS_SEMANTIC_ID: 'S' },
            ],
            { 11: 'lead_converted', 12: 'lead_converted' },
        );
        await service.run(ctx(), 100);

        expect(all).toHaveBeenCalledWith(
            { '@ID': [11, 12] },
            expect.any(Array),
        );
        const cases = close.mock.calls[0][0];
        expect(
            cases.map(c => [c.lead.id, c.lead.dealId, c.decision.target]),
        ).toEqual([
            [11, 100, 'lead_converted'],
            [12, 100, null],
        ]);
    });

    it('недозвон — ничего не читает и не пишет', async () => {
        const { service, all, close } = setup([], {});
        await service.run(ctx({ isNoCall: true }), 100);
        expect(all).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });

    it('ошибка Битрикса отчёт не роняет', async () => {
        const { service, all } = setup([], {});
        all.mockRejectedValueOnce(new Error('500'));
        await expect(service.run(ctx(), 100)).resolves.toEqual([]);
    });
});
