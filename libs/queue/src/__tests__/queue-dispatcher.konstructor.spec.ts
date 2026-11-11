import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QueueDispatcherService } from '../dispatch/queue-dispatcher.service';
import { QueueNames } from '../constants/queue-names.enum';
import { JobNames } from '../constants/job-names.enum';

/**
 * Каждая очередь конструктора — отдельный инстанс Bull (11.11.2026).
 * Пропущенная ветка в getQueue роняла бы постановку с «Unknown queue name»,
 * перепутанная — снова слила бы процессы в одну очередь.
 */
describe('QueueDispatcherService: очереди конструктора', () => {
    const KONSTRUCTOR_QUEUES = [
        QueueNames.KONSTRUCTOR_DEAL_SEND,
        QueueNames.KONSTRUCTOR_OFFER_GENERATE,
        QueueNames.KONSTRUCTOR_OFFER_GENERATE_MULTI,
    ];

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

    it('у трёх процессов конструктора разные имена очередей', () => {
        expect(new Set(KONSTRUCTOR_QUEUES).size).toBe(
            KONSTRUCTOR_QUEUES.length,
        );
        expect(KONSTRUCTOR_QUEUES).toEqual([
            'konstructor-deal-send',
            'konstructor-offer-generate',
            'konstructor-offer-generate-multi',
        ]);
    });

    it.each(KONSTRUCTOR_QUEUES)('getQueue(%s) отдаёт свою очередь', name => {
        expect(dispatcher.getQueue(name)).toBe(queues.get(name));
    });

    it('запись сделки ставится только в очередь konstructor-deal-send', async () => {
        const data = { domain: 'gsr.bitrix24.ru', dealId: 217301 };

        await dispatcher.dispatch(
            QueueNames.KONSTRUCTOR_DEAL_SEND,
            JobNames.KONSTRUCTOR_DEAL_SEND,
            data,
        );

        expect(
            queues.get(QueueNames.KONSTRUCTOR_DEAL_SEND)!.add,
        ).toHaveBeenCalledWith(JobNames.KONSTRUCTOR_DEAL_SEND, data);
        for (const name of KONSTRUCTOR_QUEUES.filter(
            queue => queue !== QueueNames.KONSTRUCTOR_DEAL_SEND,
        )) {
            expect(queues.get(name)!.add).not.toHaveBeenCalled();
        }
    });

    // Старую очередь только дочитывает дренаж; новое задание туда поставить
    // нельзя — иначе процессы снова смешались бы в одной очереди.
    it('в старую общую очередь konstructor поставить нельзя', async () => {
        expect(() =>
            dispatcher.getQueue(QueueNames.KONSTRUCTOR_LEGACY),
        ).toThrow('Unknown queue name');
        await expect(
            dispatcher.dispatch(
                QueueNames.KONSTRUCTOR_LEGACY,
                JobNames.KONSTRUCTOR_DEAL_SEND,
                {},
            ),
        ).rejects.toThrow('Unknown queue name');
    });
});
