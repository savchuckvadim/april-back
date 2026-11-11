import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { DealSendStatusUseCase } from '../use-cases/deal-send-status.use-case';

const OPERATION_ID = '6f2c1d4e-8a7b-4c3d-9e1f-0a1b2c3d4e5f';

const makeUseCase = (job: unknown) => {
    const dispatcher = { getJob: jest.fn().mockResolvedValue(job) };
    return {
        dispatcher,
        useCase: new DealSendStatusUseCase(
            dispatcher as unknown as QueueDispatcherService,
        ),
    };
};

const jobIn = (
    state: string,
    extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
    attemptsMade: 0,
    failedReason: undefined,
    returnvalue: null,
    getState: jest.fn().mockResolvedValue(state),
    ...extra,
});

/** Фронт опрашивает статус: done && ok — записано, иначе по done — в легаси. */
describe('DealSendStatusUseCase', () => {
    it('ищет задание в очереди konstructor-deal-send', async () => {
        const { useCase, dispatcher } = makeUseCase(jobIn('waiting'));

        await useCase.execute(OPERATION_ID);

        expect(dispatcher.getJob).toHaveBeenCalledWith(
            QueueNames.KONSTRUCTOR_DEAL_SEND,
            OPERATION_ID,
        );
    });

    it('записано — ok и что именно записано', async () => {
        const { useCase } = makeUseCase(
            jobIn('completed', {
                attemptsMade: 1,
                returnvalue: { fields: 19, rows: 1 },
            }),
        );

        await expect(useCase.execute(OPERATION_ID)).resolves.toEqual({
            operationId: OPERATION_ID,
            state: 'completed',
            done: true,
            ok: true,
            attemptsMade: 1,
            error: null,
            result: { fields: 19, rows: 1 },
        });
    });

    it('упало окончательно — done без ok и причина', async () => {
        const { useCase } = makeUseCase(
            jobIn('failed', {
                attemptsMade: 3,
                failedReason:
                    'gsr.bitrix24.ru сделка 1: строки — ACCESS_DENIED',
            }),
        );

        const status = await useCase.execute(OPERATION_ID);

        expect(status).toMatchObject({
            state: 'failed',
            done: true,
            ok: false,
            error: 'gsr.bitrix24.ru сделка 1: строки — ACCESS_DENIED',
            result: null,
        });
    });

    it('попытка упала, ждёт повтора — ещё не done', async () => {
        const { useCase } = makeUseCase(
            jobIn('delayed', { attemptsMade: 1, failedReason: 'timeout' }),
        );

        await expect(useCase.execute(OPERATION_ID)).resolves.toMatchObject({
            state: 'retrying',
            done: false,
            ok: false,
        });
    });

    it.each(['waiting', 'active'])('%s — ещё не done', async state => {
        const { useCase } = makeUseCase(jobIn(state));

        await expect(useCase.execute(OPERATION_ID)).resolves.toMatchObject({
            state,
            done: false,
        });
    });

    it('задания нет — not_found, done без ok', async () => {
        const { useCase } = makeUseCase(null);

        await expect(useCase.execute(OPERATION_ID)).resolves.toMatchObject({
            state: 'not_found',
            done: true,
            ok: false,
        });
    });
});
