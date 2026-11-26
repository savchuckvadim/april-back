import { Test } from '@nestjs/testing';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { SALES_DOCUMENT_EVENT_ATTEMPTS } from '@lib/queue/constants/sales-document-event-job';
import {
    SalesDocumentFlowService,
    SalesDocumentPublishInput,
} from '../services/sales-document-flow.service';
import {
    DispatchMock,
    eventOfCall,
    failingDispatch,
    offerSource,
    okDispatch,
} from './sales-document.fixtures';

const setup = async (dispatch: DispatchMock = okDispatch()) => {
    const moduleRef = await Test.createTestingModule({
        providers: [
            SalesDocumentFlowService,
            { provide: QueueDispatcherService, useValue: { dispatch } },
        ],
    }).compile();
    return { service: moduleRef.get(SalesDocumentFlowService), dispatch };
};

const input = (
    over: Partial<SalesDocumentPublishInput> = {},
): SalesDocumentPublishInput => ({
    salesFlow: true,
    eventId: 'op-1',
    domain: 'garant.bitrix24.ru',
    userId: 6,
    companyId: '32442',
    dealId: '35018',
    kinds: ['offer'],
    createdAt: new Date('2026-11-26T09:30:00.000Z'),
    sources: [offerSource()],
    ...over,
});

describe('SalesDocumentFlowService: постановка события', () => {
    it('salesFlow: true ставит событие в очередь потока документов', async () => {
        const { service, dispatch } = await setup();

        const published = await service.publish(input());

        expect(published).toBe(true);
        expect(dispatch).toHaveBeenCalledTimes(1);
        const [queue, job, data, jobId, options] = dispatch.mock.calls[0];
        expect(queue).toBe(QueueNames.EVENT_SALES_DOCUMENT_FLOW);
        expect(job).toBe(JobNames.EVENT_SALES_DOCUMENT_FLOW);
        expect(jobId).toBe('sales-document:op-1');
        expect(options).toEqual({ attempts: SALES_DOCUMENT_EVENT_ATTEMPTS });
        expect(data).toMatchObject({
            eventId: 'op-1',
            domain: 'garant.bitrix24.ru',
            userId: 6,
            companyId: 32442,
            dealId: 35018,
            kinds: ['offer'],
        });
    });

    it.each([[undefined], [null], [false]])(
        'salesFlow: %p ничего не ставит',
        async salesFlow => {
            const { service, dispatch } = await setup();

            const published = await service.publish(input({ salesFlow }));

            expect(published).toBe(false);
            expect(dispatch).not.toHaveBeenCalled();
        },
    );

    it('eventId не задан: выдаётся новый UUID, он же в jobId', async () => {
        const { service, dispatch } = await setup();

        await service.publish(input({ eventId: undefined }));

        const [, , data, jobId] = dispatch.mock.calls[0];
        expect(data.eventId).toMatch(/^[0-9a-f-]{36}$/);
        expect(jobId).toBe(`sales-document:${data.eventId}`);
    });

    it('createdAt не задан: берётся текущий момент', async () => {
        const { service, dispatch } = await setup();
        const before = Date.now();

        await service.publish(input({ createdAt: undefined }));

        const createdAt = new Date(eventOfCall(dispatch).createdAt).getTime();
        expect(createdAt).toBeGreaterThanOrEqual(before);
        expect(createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('презентация идёт в событие как есть: пустой блок и блок с dealId', async () => {
        const { service, dispatch } = await setup();

        await service.publish(input({ presentation: {} }));
        await service.publish(
            input({ eventId: 'op-2', presentation: { dealId: 4321 } }),
        );

        expect(eventOfCall(dispatch, 0).presentation).toEqual({});
        expect(eventOfCall(dispatch, 1).presentation).toEqual({
            dealId: 4321,
        });
    });

    it('сбой постановки не бросает исключение: документ уже сформирован', async () => {
        const { service } = await setup(failingDispatch('Redis недоступен'));

        await expect(service.publish(input())).resolves.toBe(false);
    });

    it('не хватает данных: событие не ставится, исключения нет', async () => {
        const { service, dispatch } = await setup();

        await expect(
            service.publish(input({ companyId: null })),
        ).resolves.toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
