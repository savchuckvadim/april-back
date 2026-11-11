import { Job } from 'bull';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { LegacyKonstructorQueueProcessor } from '../legacy-konstructor-queue.processor';
import { DEAL_SEND_JOB_OPTIONS } from '../../deal-send/lib/deal-send-job.options';

const makeProcessor = () => {
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({}) };
    return {
        dispatcher,
        processor: new LegacyKonstructorQueueProcessor(
            dispatcher as unknown as QueueDispatcherService,
        ),
    };
};

const job = (name: string, id: string | number, data: unknown = {}): Job =>
    ({ name, id, data }) as unknown as Job;

/**
 * Задания, оставшиеся в старой общей очереди на момент выкатки разделения,
 * перекладываются в свои очереди с теми же данными.
 */
describe('LegacyKonstructorQueueProcessor', () => {
    it('запись сделки — в konstructor-deal-send, с повторами, id с префиксом', async () => {
        const { processor, dispatcher } = makeProcessor();
        const data = { domain: 'gsr.bitrix24.ru', dealId: 217301 };

        await processor.forward(job(JobNames.KONSTRUCTOR_DEAL_SEND, 41, data));

        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.KONSTRUCTOR_DEAL_SEND,
            JobNames.KONSTRUCTOR_DEAL_SEND,
            data,
            'legacy-41',
            DEAL_SEND_JOB_OPTIONS,
        );
    });

    it.each([
        [JobNames.OFFER_GENERATE, QueueNames.KONSTRUCTOR_OFFER_GENERATE],
        [
            JobNames.OFFER_GENERATE_MULTI,
            QueueNames.KONSTRUCTOR_OFFER_GENERATE_MULTI,
        ],
    ])('%s — в %s с тем же operationId', async (name, queue) => {
        const { processor, dispatcher } = makeProcessor();
        const operationId = '6f2c1d4e-8a7b-4c3d-9e1f-0a1b2c3d4e5f';
        const data = { dto: { domain: 'gsr.bitrix24.ru' }, operationId };

        await processor.forward(job(name, operationId, data));

        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            queue,
            name,
            data,
            operationId,
            undefined,
        );
    });

    it('неизвестное задание — падает громко, а не теряется молча', async () => {
        const { processor, dispatcher } = makeProcessor();

        await expect(processor.forward(job('unknown-job', 1))).rejects.toThrow(
            /unknown-job/,
        );
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
});
