import { BitrixService } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { EventReportContext } from '../services/context/event-report.context';
import { BaseDealTakeoverNotice } from '../services/deal/base-deal-takeover.notice';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

interface Comment {
    ENTITY_TYPE: string;
    ENTITY_ID: number;
    COMMENT: string;
}

const NAMES: Record<number, { NAME: string; LAST_NAME: string }> = {
    331: { NAME: 'Анна', LAST_NAME: 'Первая' },
    445: { NAME: 'Борис', LAST_NAME: 'Второй' },
};

const setup = () => {
    const comments: Comment[] = [];
    const notices: Array<{ USER_ID: number; MESSAGE: string; TAG: string }> =
        [];
    const bitrix = {
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
                Promise.resolve({ result: [{ ID, ...NAMES[ID] }] }),
        },
    } as unknown as BitrixService;
    return { notice: new BaseDealTakeoverNotice(bitrix), comments, notices };
};

const ctx = (foreign: Record<string, unknown> | null): EventReportContext =>
    ({
        domain: 'garant.bitrix24.ru',
        workResponsibleId: 445,
        foreignBaseDeal: foreign,
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

const FOREIGN = { ID: '90001', ASSIGNED_BY_ID: '331' };

/**
 * Перехват клиента (владелец 22.10.2026): второму — своя сделка, как и
 * раньше, но теперь с записями в ленту обеих и уведомлением владельцу.
 */
describe('BaseDealTakeoverNotice', () => {
    it('отчёт завёл свою сделку при чужой открытой — записи в обеих и колокольчик владельцу', async () => {
        const { notice, comments, notices } = setup();

        await notice.notify(
            ctx(FOREIGN),
            deals('$result[set_base_deal]'),
            created(90002),
        );

        expect(comments.map(comment => comment.ENTITY_ID)).toEqual([
            90001, 90002,
        ]);
        expect(comments[0].COMMENT).toContain('Борис Второй');
        expect(comments[0].COMMENT).toContain('#90002');
        expect(comments[1].COMMENT).toContain('Анна Первая');
        expect(comments[1].COMMENT).toContain('#90001');
        expect(notices).toEqual([
            expect.objectContaining({
                USER_ID: 331,
                TAG: 'event-report-base-takeover-90001-90002',
            }),
        ]);
        expect(notices[0].MESSAGE).toContain('Борис Второй');
    });

    it('чужой сделки нет или работа продолжена в существующей — тишина', async () => {
        const { notice, comments, notices } = setup();

        await notice.notify(
            ctx(null),
            deals('$result[set_base_deal]'),
            created(90002),
        );
        await notice.notify(ctx(FOREIGN), deals('90005'), []);

        expect(comments).toEqual([]);
        expect(notices).toEqual([]);
    });

    it('новая сделка не создалась (нет id в ответе) — тишина', async () => {
        const { notice, comments } = setup();

        await notice.notify(ctx(FOREIGN), deals('$result[set_base_deal]'), []);

        expect(comments).toEqual([]);
    });
});
