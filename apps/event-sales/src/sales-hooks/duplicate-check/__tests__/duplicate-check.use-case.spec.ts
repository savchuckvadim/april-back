import { DuplicateCheckUseCase } from '../use-cases/duplicate-check.use-case';
import { buildDuplicateCheckItem } from '../dto/duplicate-check.dto';
import { SalesHookExecutionContext } from '../../core/contracts/sales-hook-use-case.contract';

type Row = Record<string, unknown>;

/** Контекст хука: буфер сразу исполняет команду, комментарии копятся. */
function makeContext(): {
    ctx: SalesHookExecutionContext;
    comments: { key: string; fields: Row }[];
} {
    const comments: { key: string; fields: Row }[] = [];
    const ctx = {
        domain: 'portal.bitrix24.ru',
        portal: { getEntityFieldByCode: () => undefined },
        bitrix: {
            batch: {
                timeline: {
                    addTimelineComment: (key: string, fields: Row) =>
                        comments.push({ key, fields }),
                },
                lead: { update: () => undefined },
            },
        },
        buffer: {
            queue: (command: () => unknown) => command(),
            endGroup: () => Promise.resolve(),
            flush: () => Promise.resolve(),
        },
    } as unknown as SalesHookExecutionContext;
    return { ctx, comments };
}

const search = {
    search: jest.fn().mockResolvedValue({
        candidates: [],
        warnings: [],
        signals: { phones: ['79102880648'], emails: [], inns: [], titles: [] },
    }),
};

describe('DuplicateCheckUseCase — итог в таймлайне', () => {
    it('без сделки — один комментарий в лид', async () => {
        const { ctx, comments } = makeContext();
        const useCase = new DuplicateCheckUseCase(search as never);

        await useCase.execute(ctx, [
            buildDuplicateCheckItem({ entityType: 'lead', entityId: 42 }),
        ]);

        expect(comments.map(c => c.fields.ENTITY_TYPE)).toEqual(['lead']);
    });

    /*
     * 17.09.2026: менеджер работает в сделке и в лид не заходит — итог
     * проверки заявки дублируется в таймлайн её сделки.
     */
    it('со сделкой — тот же итог и в сделку', async () => {
        const { ctx, comments } = makeContext();
        const useCase = new DuplicateCheckUseCase(search as never);

        await useCase.execute(ctx, [
            buildDuplicateCheckItem({
                entityType: 'lead',
                entityId: 42,
                mirrorDealId: 555,
            }),
        ]);

        expect(
            comments.map(c => [c.fields.ENTITY_TYPE, c.fields.ENTITY_ID]),
        ).toEqual([
            ['lead', 42],
            ['deal', 555],
        ]);
        expect(comments[1].fields.COMMENT).toBe(comments[0].fields.COMMENT);
        // Ключи команд разные — batch-карта Битрикса не схлопнет их.
        expect(new Set(comments.map(c => c.key)).size).toBe(2);
    });

    it('writeTimeline=N — в сделку тоже не пишем', async () => {
        const { ctx, comments } = makeContext();
        const useCase = new DuplicateCheckUseCase(search as never);

        await useCase.execute(ctx, [
            buildDuplicateCheckItem({
                entityType: 'lead',
                entityId: 42,
                writeTimeline: 'N',
                mirrorDealId: 555,
            }),
        ]);

        expect(comments).toEqual([]);
    });
});
