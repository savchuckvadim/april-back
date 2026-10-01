import { LeadToWorkUseCase } from '../use-cases/lead-to-work.use-case';
import { LeadToWorkContextService } from '../services/lead-to-work-context.service';
import { LeadToWorkFlowService } from '../services/lead-to-work-flow.service';
import { LeadToWorkStageResolver } from '../services/lead-to-work-stage.resolver';
import { LeadToWorkNotifyService } from '../services/lead-to-work-notify.service';
import { LeadRequestDetectorService } from '../services/lead-request-detector.service';
import { resolveLeadToWorkIntent } from '../lib/lead-to-work-intent';
import { LeadDealCompletion } from '../../../shared/lead-client/lead-deal-completion';
import { IRepeatJoinNotice } from '../lib/repeat-join-notice';
import { RepeatJoinMode } from '../lib/repeat-work-routing';
import {
    IRepeatDealInfo,
    IRepeatResolution,
} from '../lib/repeat-work.resolver';

/*
 * Склейка use-case'а для повторной заявки к самой свежей из нескольких
 * открытых сделок: чтение, запись и тексты замоканы — проверяется только
 * маршрут (кто ответственный, что передаётся, о чём оповещаем).
 */
jest.mock('../services/lead-to-work-context.service', () => ({
    LeadToWorkContextService: jest.fn(),
}));
jest.mock('../services/lead-to-work-flow.service', () => ({
    LeadToWorkFlowService: jest.fn(),
}));
jest.mock('../services/lead-to-work-stage.resolver', () => ({
    LeadToWorkStageResolver: jest.fn(),
}));
jest.mock('../services/lead-to-work-notify.service', () => ({
    LeadToWorkNotifyService: jest.fn(),
}));
jest.mock('../services/lead-request-detector.service', () => ({
    LeadRequestDetectorService: jest.fn(),
}));
jest.mock('../lib/lead-to-work-intent', () => ({
    resolveLeadToWorkIntent: jest.fn(),
}));
jest.mock('../../../shared/lead-client/lead-deal-completion', () => ({
    LeadDealCompletion: jest.fn(),
}));

const LEAD_ID = 348391;
const DEAL_CMD = `lw_deal_join_${LEAD_ID}`;
const LEAD_CMD = `lw_lead_${LEAD_ID}`;

const deal = (dealId: number, responsibleId: number): IRepeatDealInfo => ({
    dealId,
    closed: false,
    stageId: 'C3:WARM',
    responsibleId,
    companyId: null,
    title: `Сделка ${dealId}`,
    modifiedAt: null,
    row: { ID: String(dealId), STAGE_ID: 'C3:WARM' },
});

/** Две открытые сделки клиента: 72000 у 433 (свежая) и 71000 у 500. */
const AMBIGUOUS: IRepeatResolution = {
    kind: 'ambiguous',
    signal: 'phone',
    value: '79001234567',
    mainDeal: deal(72000, 433),
    openDeals: [deal(72000, 433), deal(71000, 500)],
};

const LEAD_CONTEXT = {
    lead: { ID: String(LEAD_ID), TITLE: 'Заявка с сайта', STATUS_ID: 'NEW' },
    company: null,
    existingOurDeal: null,
    existingXoDeal: null,
    convertedDeals: [],
    fromLeadDeals: [],
    openTasks: [],
    openActivities: [],
    contactIds: [],
    isConverted: false,
    warnings: [],
};

const plan = (dealCmd: string) => ({
    dealCmd,
    leadCmd: LEAD_CMD,
    reused: true,
    tasksMoved: 0,
    tasksClosed: 0,
    activitiesMoved: 0,
    extraDealsClosed: 0,
    isRequest: true,
    kpiPlanned: false,
    kpiNotHeld: false,
    warnings: [],
});

const setup = (
    input: {
        mode?: RepeatJoinMode;
        /** Кто из владельцев найденных сделок работает. */
        activeOwners?: number[];
        /** Ответы батча; по умолчанию записаны и сделка, и лид. */
        results?: Record<string, unknown>;
    } = {},
) => {
    jest.mocked(LeadToWorkContextService).mockImplementation(
        () =>
            ({
                loadMany: jest
                    .fn()
                    .mockResolvedValue(new Map([[LEAD_ID, LEAD_CONTEXT]])),
            }) as never,
    );
    jest.mocked(LeadRequestDetectorService).mockImplementation(
        () => ({ detect: () => ({ kind: 'request' }) }) as never,
    );
    jest.mocked(resolveLeadToWorkIntent).mockImplementation(({ item }) => ({
        item,
        intent: {
            isXo: 'Y',
            stageMode: 'new',
            createCompany: 'N',
            taskMode: 'close',
        },
        signals: [],
    }));
    const stagePlan = { dealCategoryId: '3', warnings: [] };
    jest.mocked(LeadToWorkStageResolver).mockImplementation(
        () =>
            ({
                withCurrentLeadStatus: () => ({ resolve: () => stagePlan }),
            }) as never,
    );
    const queueJoin = jest.fn(() => plan(DEAL_CMD));
    const queue = jest.fn(() => plan(`lw_deal_${LEAD_ID}`));
    jest.mocked(LeadToWorkFlowService).mockImplementation(
        () => ({ queueJoin, queue }) as never,
    );
    jest.mocked(LeadToWorkNotifyService).mockImplementation(
        () => ({ notifyAssignment: jest.fn().mockResolvedValue([]) }) as never,
    );
    jest.mocked(LeadDealCompletion).mockImplementation(
        () =>
            ({
                complete: jest.fn().mockResolvedValue({ warnings: [] }),
            }) as never,
    );

    const repeat = {
        mode: jest.fn().mockResolvedValue(input.mode ?? 'on'),
        find: jest.fn().mockResolvedValue(
            new Map([
                [
                    LEAD_ID,
                    {
                        resolution: AMBIGUOUS,
                        openMainTasks: [],
                        warnings: [],
                    },
                ],
            ]),
        ),
        writeNotes: jest.fn().mockResolvedValue([]),
        transferMainDeal: jest.fn().mockResolvedValue(null),
    };
    const assignee = {
        resolve: jest.fn().mockResolvedValue({
            responsible: 455,
            source: 'round-robin',
            departmentKey: 'op_15',
            warnings: [],
        }),
    };
    const userNames = { resolve: jest.fn().mockResolvedValue({}) };
    const useCase = new LeadToWorkUseCase(
        assignee as never,
        { resolve: jest.fn().mockResolvedValue({}) } as never,
        userNames as never,
        { queueForLeads: jest.fn().mockResolvedValue([]) } as never,
        {
            resolve: jest.fn().mockResolvedValue({
                leadWorkCopyActivities: false,
                leadWorkOriginComment: false,
            }),
        } as never,
        {
            resolve: jest.fn().mockResolvedValue('02.10.2026 10:00:00'),
        } as never,
        {
            activeUserIds: jest
                .fn()
                .mockResolvedValue(new Set(input.activeOwners ?? [433])),
        } as never,
        repeat as never,
    );
    const ctx = {
        domain: 'garantservisvoronezh.bitrix24.ru',
        operationId: 'op-1',
        bitrix: {},
        portal: { getEntityFieldByCode: () => undefined },
        buffer: {
            queue: jest.fn(),
            endGroup: jest.fn().mockResolvedValue(undefined),
            flush: jest.fn().mockResolvedValue(undefined),
            getResults: () => [
                {
                    result: input.results ?? {
                        [DEAL_CMD]: true,
                        [LEAD_CMD]: true,
                    },
                },
            ],
            getCurrentGroupSize: () => 0,
            getBufferSize: () => 0,
        },
    };
    /** Оповещения, переданные на запись после flush. */
    const notices = (): IRepeatJoinNotice[] =>
        (
            repeat.writeNotes.mock.calls[0] as [
                unknown,
                { notices: IRepeatJoinNotice[] },
            ]
        )[1].notices;
    /** Что ушло в запись присоединения: ответственный и данные сделки. */
    const joined = () => {
        const [item, , , join] = queueJoin.mock.calls[0] as unknown as [
            { responsible: number },
            unknown,
            unknown,
            { mainDealId: number; historyText: string },
        ];
        return { item, join };
    };
    return {
        run: () =>
            useCase.execute(ctx as never, [{ leadId: LEAD_ID, isXo: 'Y' }]),
        ctx,
        repeat,
        assignee,
        userNames,
        queue,
        queueJoin,
        notices,
        joined,
    };
};

describe('LeadToWorkUseCase: повторная заявка к самой свежей из открытых сделок', () => {
    beforeEach(() => jest.clearAllMocks());

    it('владелец работает — он ответственный, передачи нет, одно оповещение', async () => {
        const { run, assignee, repeat, queueJoin, notices, joined } = setup();

        await run();

        expect(assignee.resolve).not.toHaveBeenCalled();
        expect(queueJoin).toHaveBeenCalledTimes(1);
        const { item, join } = joined();
        expect(item.responsible).toBe(433);
        expect(join.mainDealId).toBe(72000);
        // Запись истории уходит батчем — без `#`, иначе обрежется.
        expect(join.historyText).not.toContain('#');
        expect(join.historyText).toContain('лид 348391');
        expect(repeat.transferMainDeal).not.toHaveBeenCalled();
        expect(notices()).toHaveLength(1);
        expect(notices()[0]).toMatchObject({
            leadId: LEAD_ID,
            mainDeal: { dealId: 72000 },
            otherDeals: [{ dealId: 71000 }],
            responsibleId: 433,
        });
    });

    it('владелец не работает — круг, сделка передаётся новому, в оповещении он же', async () => {
        const { run, ctx, assignee, repeat, notices, joined } = setup({
            activeOwners: [],
        });

        await run();

        expect(assignee.resolve).toHaveBeenCalledTimes(1);
        expect(joined().item.responsible).toBe(455);
        expect(repeat.transferMainDeal).toHaveBeenCalledWith(ctx, 72000, 455);
        expect(notices()[0].responsibleId).toBe(455);
    });

    it.each([
        ['обновление сделки', { [LEAD_CMD]: true }],
        ['привязка лида', { [DEAL_CMD]: true }],
    ])('%s не записалось — оповещений нет', async (_title, results) => {
        const { run, notices } = setup({ results });

        await run();

        expect(notices()).toEqual([]);
    });

    it('холостой ход — без записи присоединения, комментарий с именами владельцев', async () => {
        const { run, repeat, userNames, queue, queueJoin, notices } = setup({
            mode: 'dry_run',
        });

        await run();

        expect(queueJoin).not.toHaveBeenCalled();
        expect(queue).toHaveBeenCalledTimes(1);
        expect(notices()).toEqual([]);
        const [, input] = repeat.writeNotes.mock.calls[0] as [
            unknown,
            { notes: { leadId: number; mode: string }[] },
        ];
        expect(input.notes).toMatchObject([
            { leadId: LEAD_ID, mode: 'dry_run' },
        ]);
        // Имена владельцев открытых сделок резолвятся до записи.
        const [, , ids] = userNames.resolve.mock.calls[0] as [
            unknown,
            unknown,
            number[],
        ];
        expect(ids).toEqual(expect.arrayContaining([433, 500]));
    });
});
