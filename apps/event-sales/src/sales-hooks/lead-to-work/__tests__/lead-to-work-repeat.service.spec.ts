import { LeadToWorkRepeatService } from '../services/lead-to-work-repeat.service';
import { IRepeatJoinNotice } from '../lib/repeat-join-notice';
import {
    IRepeatDealInfo,
    IRepeatResolution,
} from '../lib/repeat-work.resolver';

const DOMAIN = 'garantservisvoronezh.bitrix24.ru';

const deal = (dealId: number, responsibleId: number): IRepeatDealInfo => ({
    dealId,
    closed: false,
    stageId: 'C3:WARM',
    responsibleId,
    companyId: null,
    title: `Сделка ${dealId}`,
    modifiedAt: null,
    row: { ID: String(dealId) },
});

const ambiguous: IRepeatResolution = {
    kind: 'ambiguous',
    signal: 'phone',
    value: '79001234567',
    mainDeal: deal(72000, 433),
    openDeals: [deal(72000, 433), deal(71000, 500)],
};

const setup = () => {
    // Типизированный метод библиотеки, а не строковый api.call.
    const addTimelineComment = jest.fn<Promise<unknown>, [unknown]>(() =>
        Promise.resolve({ result: 1 }),
    );
    const send = jest.fn<Promise<string[]>, [unknown, unknown, unknown]>(() =>
        Promise.resolve([]),
    );
    const service = new LeadToWorkRepeatService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { send } as never,
    );
    const ctx = {
        domain: DOMAIN,
        bitrix: { timeline: { addTimelineComment } },
    } as never;
    return { service, ctx, call: addTimelineComment, send };
};

describe('LeadToWorkRepeatService.writeNotes', () => {
    it('холостой ход: только комментарий в лид «присоединил бы к самой свежей», оповещений нет', async () => {
        const { service, ctx, call, send } = setup();

        const warnings = await service.writeNotes(ctx, {
            notes: [{ leadId: 348391, resolution: ambiguous, mode: 'dry_run' }],
            notices: [],
            names: { 433: 'Иван Петров' },
        });

        expect(warnings).toEqual([]);
        expect(call).toHaveBeenCalledTimes(1);
        const fields = call.mock.calls[0][0] as Record<string, unknown>;
        expect(fields).toMatchObject({
            ENTITY_ID: 348391,
            ENTITY_TYPE: 'lead',
        });
        expect(String(fields.COMMENT)).toContain(
            'Присоединил бы к самой свежей из открытых сделок клиента',
        );
        expect(String(fields.COMMENT)).toContain('(Иван Петров)');
        // Оповещать некого: список уведомлений пуст.
        expect(send).toHaveBeenCalledWith(ctx, [], { 433: 'Иван Петров' });
    });

    it('режим «присоединять»: оповещения уходят сервису уведомлений, его предупреждения — в итог', async () => {
        const { service, ctx, call, send } = setup();
        send.mockResolvedValueOnce([
            'уведомление сотруднику 500 не отправлено',
        ]);
        const notice = { leadId: 1 } as IRepeatJoinNotice;

        const warnings = await service.writeNotes(ctx, {
            notes: [{ leadId: 1, resolution: ambiguous, mode: 'on' }],
            notices: [notice],
            names: {},
        });

        // Комментарий «нужен выбор» больше не пишется ни в каком режиме.
        expect(call).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledWith(ctx, [notice], {});
        expect(warnings).toEqual(['уведомление сотруднику 500 не отправлено']);
    });

    it('сбой комментария холостого хода — предупреждение, остальные пишутся', async () => {
        const { service, ctx, call } = setup();
        call.mockRejectedValueOnce(new Error('access denied'));

        const warnings = await service.writeNotes(ctx, {
            notes: [
                { leadId: 1, resolution: ambiguous, mode: 'dry_run' },
                { leadId: 2, resolution: ambiguous, mode: 'dry_run' },
            ],
            notices: [],
            names: {},
        });

        expect(call).toHaveBeenCalledTimes(2);
        expect(warnings).toEqual([
            'Лид 1: комментарий о повторной заявке не записан — access denied',
        ]);
    });
});
