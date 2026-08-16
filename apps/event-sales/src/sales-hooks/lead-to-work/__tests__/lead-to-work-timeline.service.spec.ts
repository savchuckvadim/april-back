import { LeadToWorkTimelineService } from '../services/lead-to-work-timeline.service';

/**
 * Прошлое заявки в сделке: комментарий-ссылка и ПРИВЯЗКА дел (не перенос —
 * в лиде история обязана остаться).
 */
const makeBitrix = (activityIds: number[] = []) => {
    const comments: { cmd: string; data: Record<string, unknown> }[] = [];
    const bindings: {
        activityId: number;
        entityTypeId: number;
        entityId: number;
    }[] = [];
    const flush = jest.fn().mockResolvedValue([]);
    return {
        comments,
        bindings,
        flush,
        bitrix: {
            activity: {
                getList: jest.fn().mockResolvedValue({
                    result: activityIds.map(id => ({ ID: String(id) })),
                }),
            },
            batch: {
                timeline: {
                    addTimelineComment: (
                        cmd: string,
                        data: Record<string, unknown>,
                    ) => {
                        comments.push({ cmd, data });
                    },
                },
                activity: {
                    addBinding: (
                        _cmd: string,
                        activityId: number,
                        entityTypeId: number,
                        entityId: number,
                    ) => {
                        bindings.push({ activityId, entityTypeId, entityId });
                    },
                },
            },
            api: { callBatchWithConcurrency: flush },
        },
    };
};

const transfer = (over: Record<string, unknown> = {}) => ({
    leadId: 42,
    leadTitle: 'ООО Ромашка',
    dealId: 1024,
    reused: false,
    ...over,
});

const OPTIONS = {
    copyActivities: true,
    activitiesLimit: 3,
    writeOriginComment: true,
};

describe('LeadToWorkTimelineService', () => {
    it('комментарий в сделке содержит ссылку на лид', async () => {
        const { bitrix, comments } = makeBitrix();
        const service = new LeadToWorkTimelineService(
            bitrix as never,
            'd.b24.ru',
        );

        await service.run([transfer()], {
            ...OPTIONS,
            copyActivities: false,
        });

        expect(comments).toHaveLength(1);
        const comment = String(comments[0].data.COMMENT);
        expect(comment).toContain('https://d.b24.ru/crm/lead/details/42/');
        expect(comment).toContain('ООО Ромашка');
        expect(comments[0].data.ENTITY_ID).toBe(1024);
        expect(comments[0].data.ENTITY_TYPE).toBe('deal');
    });

    /* Работа уже шла — «создана из заявки» было бы неправдой. */
    it('reuse: комментарий не пишется', async () => {
        const { bitrix, comments } = makeBitrix();
        const service = new LeadToWorkTimelineService(
            bitrix as never,
            'd.b24.ru',
        );

        await service.run([transfer({ reused: true })], {
            ...OPTIONS,
            copyActivities: false,
        });

        expect(comments).toHaveLength(0);
    });

    it('дела лида привязываются к сделке: последние N, тип «сделка»', async () => {
        const { bitrix, bindings } = makeBitrix([10, 20, 30, 40]);
        const service = new LeadToWorkTimelineService(
            bitrix as never,
            'd.b24.ru',
        );

        await service.run([transfer()], {
            ...OPTIONS,
            writeOriginComment: false,
        });

        // limit=3 → берём три самых свежих (по убыванию id).
        expect(bindings.map(b => b.activityId)).toEqual([40, 30, 20]);
        expect(bindings.every(b => b.entityTypeId === 2)).toBe(true);
        expect(bindings.every(b => b.entityId === 1024)).toBe(true);
    });

    /* Лимит Битрикса — 100 привязок у дела; выше не поднимаемся. */
    it('лимит настройки выше 100 срезается до 100', async () => {
        const ids = Array.from({ length: 150 }, (_, index) => index + 1);
        const { bitrix, bindings } = makeBitrix(ids);
        const service = new LeadToWorkTimelineService(
            bitrix as never,
            'd.b24.ru',
        );

        await service.run([transfer()], {
            copyActivities: true,
            activitiesLimit: 500,
            writeOriginComment: false,
        });

        expect(bindings).toHaveLength(100);
    });

    /* Сделка уже создана — падение таймлайна не должно её отменять. */
    it('ошибка чтения дел → warning, комментарий всё равно ставится', async () => {
        const { bitrix, comments } = makeBitrix();
        bitrix.activity.getList = jest
            .fn()
            .mockRejectedValue(new Error('портал недоступен'));
        const service = new LeadToWorkTimelineService(
            bitrix as never,
            'd.b24.ru',
        );

        const warnings = await service.run([transfer()], OPTIONS);

        expect(warnings.join(' ')).toContain('портал недоступен');
        expect(comments).toHaveLength(1);
    });

    it('сделки нет (создание не удалось) → ни одного вызова', async () => {
        const { bitrix, comments, flush } = makeBitrix([10]);
        const service = new LeadToWorkTimelineService(
            bitrix as never,
            'd.b24.ru',
        );

        const warnings = await service.run([transfer({ dealId: 0 })], OPTIONS);

        expect(warnings).toEqual([]);
        expect(comments).toHaveLength(0);
        expect(flush).not.toHaveBeenCalled();
    });
});
