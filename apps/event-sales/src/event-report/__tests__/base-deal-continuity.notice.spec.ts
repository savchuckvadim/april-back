import { BitrixService } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { EventReportContext } from '../services/context/event-report.context';
import { BaseDealContinuityNotice } from '../services/deal/base-deal-continuity.notice';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

interface Comment {
    ENTITY_TYPE: string;
    ENTITY_ID: number;
    COMMENT: string;
}

const setup = () => {
    const batchComments: Array<{ cmd: string; fields: Comment }> = [];
    const comments: Comment[] = [];
    const notices: Array<{ USER_ID: number; MESSAGE: string; TAG: string }> =
        [];
    const bitrix = {
        batch: {
            timeline: {
                addTimelineComment: (cmd: string, fields: Comment) => {
                    batchComments.push({ cmd, fields });
                },
            },
        },
        timeline: {
            addTimelineComment: (fields: Comment) => {
                comments.push(fields);
                return Promise.resolve();
            },
        },
        imNotify: {
            systemAdd: (fields: {
                USER_ID: number;
                MESSAGE: string;
                TAG: string;
            }) => {
                notices.push(fields);
                return Promise.resolve();
            },
        },
        user: {
            get: ({ ID }: { ID: number }) =>
                Promise.resolve({
                    result: [{ ID, NAME: 'Сотрудник', LAST_NAME: String(ID) }],
                }),
        },
    } as unknown as BitrixService;
    return {
        notice: new BaseDealContinuityNotice(bitrix),
        batchComments,
        comments,
        notices,
    };
};

const ctx = (over: Record<string, unknown>): EventReportContext =>
    ({
        domain: 'garant.bitrix24.ru',
        workResponsibleId: 445,
        reopenedBaseDeal: false,
        currentBaseDeal: null,
        closedLaunchBaseDeal: null,
        ...over,
    }) as unknown as EventReportContext;

const deals = (baseDealId: string | null): DealFlowResult => ({
    baseDealId,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
});

const created = (id: number): IBitrixBatchResponseResult[] =>
    [
        { result: { set_base_deal: id } },
    ] as unknown as IBitrixBatchResponseResult[];

describe('BaseDealContinuityNotice', () => {
    it('сделку вернули в работу — строка в её ленте тем же батчем', async () => {
        const { notice, batchComments } = setup();

        await notice.queueReopenNote(
            ctx({
                reopenedBaseDeal: true,
                currentBaseDeal: { ID: '95361', ASSIGNED_BY_ID: '445' },
            }),
        );

        expect(batchComments).toHaveLength(1);
        expect(batchComments[0].cmd).toBe('reopen_base_deal_95361');
        expect(batchComments[0].fields.ENTITY_ID).toBe(95361);
        const text = decodeURIComponent(batchComments[0].fields.COMMENT);
        expect(text).toContain('Сделка возвращена в работу');
        // Свой ответственный — про смену ни слова.
        expect(text).not.toContain('Ответственный сменён');
    });

    /*
     * garant 30.10.2026 (#28477): закрытая сделка 459 возвращена на 433 —
     * в ленте видно, от кого к кому, прежний получает уведомление.
     */
    it('чужую сделку вернули на другого — смена ответственного в ленте и уведомление прежнему', async () => {
        const { notice, batchComments, notices } = setup();
        const context = ctx({
            reopenedBaseDeal: true,
            workResponsibleId: 433,
            currentBaseDeal: { ID: '28477', ASSIGNED_BY_ID: '459' },
        });

        await notice.queueReopenNote(context);
        await notice.notifyReopenHandover(context);

        expect(decodeURIComponent(batchComments[0].fields.COMMENT)).toContain(
            'Ответственный сменён: Сотрудник 459 → Сотрудник 433',
        );
        expect(notices).toHaveLength(1);
        expect(notices[0].USER_ID).toBe(459);
        expect(notices[0].MESSAGE).toContain('/crm/deal/details/28477/');
        expect(notices[0].MESSAGE).toContain('Сотрудник 433');
    });

    it('не возвращали или ответственный тот же — записи и уведомления нет', async () => {
        const { notice, batchComments, notices } = setup();
        await notice.queueReopenNote(ctx({ currentBaseDeal: { ID: '1' } }));
        await notice.notifyReopenHandover(
            ctx({ currentBaseDeal: { ID: '1' } }),
        );
        await notice.notifyReopenHandover(
            ctx({
                reopenedBaseDeal: true,
                currentBaseDeal: { ID: '2', ASSIGNED_BY_ID: '445' },
            }),
        );
        expect(batchComments).toEqual([]);
        expect(notices).toEqual([]);
    });

    it('работа ушла в новую сделку — записи в обеих и уведомление (случай 95361 → 95375)', async () => {
        const { notice, comments, notices } = setup();

        await notice.notifyContinuation(
            ctx({ closedLaunchBaseDeal: { ID: '95361' } }),
            deals('$result[set_base_deal]'),
            created(95375),
        );

        expect(comments.map(c => c.ENTITY_ID)).toEqual([95361, 95375]);
        expect(comments[0].COMMENT).toContain('#95375 (новая)');
        expect(comments[1].COMMENT).toContain('Создана вместо закрытой сделки');
        expect(notices).toHaveLength(1);
        expect(notices[0].USER_ID).toBe(445);
        expect(notices[0].MESSAGE).toContain('#95375 (новая)');
        expect(notices[0].TAG).toBe('event-report-base-continuity-95361-95375');
    });

    it('работа ушла в уже открытую сделку — «продолжена», без «(новая)»', async () => {
        const { notice, comments } = setup();

        await notice.notifyContinuation(
            ctx({ closedLaunchBaseDeal: { ID: '95361' } }),
            deals('95400'),
            [],
        );

        expect(comments[0].COMMENT).not.toContain('(новая)');
        expect(comments[1].COMMENT).toContain(
            'Сюда продолжена работа из закрытой сделки',
        );
    });

    it('закрытой сделки запуска не было или работа в ней же — молчим', async () => {
        const { notice, comments, notices } = setup();

        await notice.notifyContinuation(ctx({}), deals('95400'), []);
        await notice.notifyContinuation(
            ctx({ closedLaunchBaseDeal: { ID: '95400' } }),
            deals('95400'),
            [],
        );

        expect(comments).toEqual([]);
        expect(notices).toEqual([]);
    });

    it('Битрикс не принял запись — отчёт не падает', async () => {
        const bitrix = {
            timeline: {
                addTimelineComment: () => Promise.reject(new Error('сеть')),
            },
            imNotify: {
                systemAdd: () => Promise.reject(new Error('сеть')),
            },
        } as unknown as BitrixService;

        await expect(
            new BaseDealContinuityNotice(bitrix).notifyContinuation(
                ctx({ closedLaunchBaseDeal: { ID: '95361' } }),
                deals('$result[set_base_deal]'),
                created(95375),
            ),
        ).resolves.toBeUndefined();
    });
});
