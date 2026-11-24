import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QueueDispatcherService } from '../dispatch/queue-dispatcher.service';
import { QueueNames } from '../constants/queue-names.enum';
import { JobNames } from '../constants/job-names.enum';
import {
    SALES_DOCUMENT_KINDS,
    SalesDocumentEventJobData,
    salesDocumentEventJobId,
} from '../constants/sales-document-event-job';

/**
 * Поток документов конструктора идёт в свою очередь event-sales-document-flow:
 * чужой воркер на общей очереди уронил бы джоб с «Missing process handler».
 */
describe('QueueDispatcherService: поток документов', () => {
    const makeQueue = (name: string) => ({
        name,
        add: jest.fn().mockResolvedValue({ id: `${name}-job` }),
        getJob: jest.fn(),
    });

    let dispatcher: QueueDispatcherService;
    let queues: Map<string, ReturnType<typeof makeQueue>>;

    beforeEach(async () => {
        queues = new Map(
            Object.values(QueueNames).map(name => [name, makeQueue(name)]),
        );
        const moduleRef = await Test.createTestingModule({
            providers: [
                QueueDispatcherService,
                ...[...queues].map(([name, queue]) => ({
                    provide: getQueueToken(name),
                    useValue: queue,
                })),
            ],
        }).compile();
        dispatcher = moduleRef.get(QueueDispatcherService);
    });

    const data: SalesDocumentEventJobData = {
        eventId: 'e1',
        domain: 'garant.bitrix24.ru',
        userId: 1,
        companyId: 2,
        dealId: 3,
        kinds: ['offer'],
        createdAt: '2026-11-24T10:00:00.000Z',
    };

    it('имя очереди потока документов — event-sales-document-flow', () => {
        expect(QueueNames.EVENT_SALES_DOCUMENT_FLOW).toBe(
            'event-sales-document-flow',
        );
    });

    it('getQueue отдаёт именно заглушку очереди потока документов', () => {
        expect(dispatcher.getQueue(QueueNames.EVENT_SALES_DOCUMENT_FLOW)).toBe(
            queues.get(QueueNames.EVENT_SALES_DOCUMENT_FLOW),
        );
    });

    it('постановка события вызывает add только у очереди потока документов', async () => {
        await dispatcher.dispatch(
            QueueNames.EVENT_SALES_DOCUMENT_FLOW,
            JobNames.EVENT_SALES_DOCUMENT_FLOW,
            data,
            salesDocumentEventJobId('e1'),
        );

        expect(
            queues.get(QueueNames.EVENT_SALES_DOCUMENT_FLOW)?.add,
        ).toHaveBeenCalledWith(JobNames.EVENT_SALES_DOCUMENT_FLOW, data, {
            jobId: 'sales-document:e1',
        });
        const otherQueues = Object.values(QueueNames).filter(
            name => name !== QueueNames.EVENT_SALES_DOCUMENT_FLOW,
        );
        for (const name of otherQueues) {
            expect(queues.get(name)?.add).not.toHaveBeenCalled();
        }
    });

    it('jobId события выводится из eventId', () => {
        expect(salesDocumentEventJobId('e1')).toBe('sales-document:e1');
    });

    it('виды документов: КП, счёт, договор, поставка', () => {
        expect(SALES_DOCUMENT_KINDS).toEqual([
            'offer',
            'invoice',
            'contract',
            'supply',
        ]);
    });
});
