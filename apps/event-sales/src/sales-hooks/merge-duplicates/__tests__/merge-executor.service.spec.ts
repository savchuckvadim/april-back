import { MergeExecutorService } from '../services/merge-executor.service';
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

    it('CONFLICT: группа отдаётся человеку, без ручной «дочистки»', async () => {
        const mergeBatch = jest
            .fn()
            .mockResolvedValue({ result: { STATUS: 'CONFLICT' } });
        const executor = new MergeExecutorService(
            makeBitrix(mergeBatch) as never,
        );

        const outcome = await executor.execute(plan());

        expect(outcome.groups[0].status).toBe('CONFLICT');
        expect(outcome.groups[0].error).toContain('штатном интерфейсе');
        expect(mergeBatch).toHaveBeenCalledTimes(1);
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
