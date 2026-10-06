import { MergeExecutorService } from '../services/merge-executor.service';
import { MergeConflictResolver } from '../services/merge-conflict.resolver';
import { MergePlan } from '../services/merge-plan.service';
import { DuplicateEntityType } from '@lib/portal-lib/pbx-duplicate';

const plan = (over: Partial<MergePlan> = {}): MergePlan => ({
    participants: [],
    groups: [
        {
            entityType: DuplicateEntityType.COMPANY,
            entityTypeId: 4,
            survivorId: 431,
            victimIds: [8821, 8822],
        },
    ],
    relink: [],
    skipped: [],
    warnings: [],
    planHash: 'hash',
    ...over,
});

const makeBitrix = (
    mergeImpl: jest.Mock = jest
        .fn()
        .mockResolvedValue({ result: { STATUS: 'SUCCESS', ENTITY_IDS: [] } }),
) => ({
    crmEntity: { mergeBatch: mergeImpl },
    deal: { update: jest.fn().mockResolvedValue({}) },
});

describe('MergeExecutorService', () => {
    it('survivor уходит ПЕРВЫМ в entityIds (главный guard фичи)', async () => {
        const mergeBatch = jest.fn().mockResolvedValue({
            result: { STATUS: 'SUCCESS', ENTITY_IDS: [8821, 8822] },
        });
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
        );

        await executor.execute(plan());

        expect(mergeBatch).toHaveBeenCalledWith({
            entityTypeId: 4,
            entityIds: [431, 8821, 8822],
        });
    });

    /*
     * CONFLICT (владелец, 05.10.2026: «надо по-любому объединять»): поля
     * выравниваются и порция объединяется ещё раз — ровно один раз.
     */
    const resolverOf = (impl: jest.Mock) =>
        ({ resolve: impl }) as unknown as MergeConflictResolver;

    it('CONFLICT: поля выровнены — порция объединяется повторно', async () => {
        const mergeBatch = jest
            .fn()
            .mockResolvedValueOnce({ result: { STATUS: 'CONFLICT' } })
            .mockResolvedValueOnce({
                result: { STATUS: 'SUCCESS', ENTITY_IDS: [8821, 8822] },
            });
        const resolve = jest
            .fn()
            .mockResolvedValue({ changed: true, keptInTimeline: 2 });
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
            resolverOf(resolve),
        );

        const outcome = await executor.execute(plan());

        expect(outcome.groups[0].status).toBe('SUCCESS');
        expect(outcome.groups[0].mergedIds).toEqual([8821, 8822]);
        expect(resolve).toHaveBeenCalledWith(
            expect.objectContaining({ survivorId: 431 }),
            [8821, 8822],
        );
        // Повтор — тем же порядком: главная карточка первой.
        expect(mergeBatch).toHaveBeenNthCalledWith(2, {
            entityTypeId: 4,
            entityIds: [431, 8821, 8822],
        });
        expect(outcome.warnings).toEqual([
            'Компания 431: поля дублей выровнены по главной карточке, прежние значения (2) записаны в её ленту',
        ]);
    });

    it('CONFLICT и после выравнивания — человеку в штатный интерфейс, без третьей попытки', async () => {
        const mergeBatch = jest
            .fn()
            .mockResolvedValue({ result: { STATUS: 'CONFLICT' } });
        const resolve = jest
            .fn()
            .mockResolvedValue({ changed: true, keptInTimeline: 0 });
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
            resolverOf(resolve),
        );

        const outcome = await executor.execute(plan());

        expect(outcome.groups[0].status).toBe('CONFLICT');
        expect(outcome.groups[0].error).toContain('штатном интерфейсе');
        expect(mergeBatch).toHaveBeenCalledTimes(2);
        expect(resolve).toHaveBeenCalledTimes(1);
    });

    it('CONFLICT, а выравнивать нечего — повтора нет', async () => {
        const mergeBatch = jest
            .fn()
            .mockResolvedValue({ result: { STATUS: 'CONFLICT' } });
        const resolve = jest
            .fn()
            .mockResolvedValue({ changed: false, keptInTimeline: 0 });
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
            resolverOf(resolve),
        );

        const outcome = await executor.execute(plan());

        expect(outcome.groups[0].status).toBe('CONFLICT');
        expect(mergeBatch).toHaveBeenCalledTimes(1);
    });

    it('выравнивание упало — группа остаётся конфликтной, остальные идут дальше', async () => {
        const mergeBatch = jest
            .fn()
            .mockResolvedValueOnce({ result: { STATUS: 'CONFLICT' } })
            .mockResolvedValueOnce({
                result: { STATUS: 'SUCCESS', ENTITY_IDS: [8] },
            });
        const resolve = jest
            .fn()
            .mockRejectedValue(new Error('Битрикс не отвечает'));
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
            resolverOf(resolve),
        );

        const outcome = await executor.execute(
            plan({
                groups: [
                    {
                        entityType: DuplicateEntityType.COMPANY,
                        entityTypeId: 4,
                        survivorId: 431,
                        victimIds: [1],
                    },
                    {
                        entityType: DuplicateEntityType.CONTACT,
                        entityTypeId: 3,
                        survivorId: 7,
                        victimIds: [8],
                    },
                ],
            }),
        );

        expect(outcome.groups.map(group => group.status)).toEqual([
            'CONFLICT',
            'SUCCESS',
        ]);
        expect(outcome.warnings[0]).toContain(
            'Компания 431: не удалось выровнять поля',
        );
    });

    it('ERROR первой группы — fail-fast по остальным', async () => {
        const mergeBatch = jest
            .fn()
            .mockRejectedValue(new Error('OPERATION_TIME_LIMIT'));
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
        );

        const outcome = await executor.execute(
            plan({
                groups: [
                    {
                        entityType: DuplicateEntityType.COMPANY,
                        entityTypeId: 4,
                        survivorId: 431,
                        victimIds: [1],
                    },
                    {
                        entityType: DuplicateEntityType.CONTACT,
                        entityTypeId: 3,
                        survivorId: 7,
                        victimIds: [8],
                    },
                ],
            }),
        );

        expect(outcome.groups[0].status).toBe('ERROR');
        expect(outcome.groups[1].status).toBe('ERROR');
        expect(outcome.groups[1].error).toContain('Пропущена');
        expect(mergeBatch).toHaveBeenCalledTimes(1);
    });

    it('relink выполняется ДО разрушающей фазы и не батчится с ней', async () => {
        const bitrix = makeBitrix();
        const executor = new MergeExecutorService(bitrix as never);

        const outcome = await executor.execute(
            plan({ relink: [{ dealId: 1, companyId: 431 }] }),
        );

        expect(bitrix.deal.update).toHaveBeenCalledWith(1, {
            COMPANY_ID: '431',
        });
        expect(outcome.relinked).toEqual([{ dealId: 1, companyId: 431 }]);
    });

    it('жертвы режутся порциями по 5 последовательных вызовов', async () => {
        const mergeBatch = jest.fn().mockResolvedValue({
            result: { STATUS: 'SUCCESS', ENTITY_IDS: [] },
        });
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
        );

        await executor.execute(
            plan({
                groups: [
                    {
                        entityType: DuplicateEntityType.COMPANY,
                        entityTypeId: 4,
                        survivorId: 431,
                        victimIds: [1, 2, 3, 4, 5, 6, 7],
                    },
                ],
            }),
        );

        expect(mergeBatch).toHaveBeenCalledTimes(2);
        const calls = mergeBatch.mock.calls as unknown as [
            { entityIds: number[] },
        ][];
        expect(calls[0][0].entityIds).toHaveLength(6); // survivor+5
        expect(calls[1][0].entityIds).toHaveLength(3); // survivor+2
    });
});
