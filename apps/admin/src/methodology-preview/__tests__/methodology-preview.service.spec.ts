import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobNames, QueueNames } from '@lib/queue';
import {
    METHODOLOGY_PREVIEW_ID_PATTERN,
    POLYANSKY_METHODOLOGY,
    type MethodologyPreviewState,
} from '@lib/call-lib/call-report/methodology';
import { MethodologyPreviewService } from '../services/methodology-preview.service';

const DOMAIN = 'gsr.bitrix24.ru';

const makeDeps = (stored: MethodologyPreviewState | null = null) => {
    const order: string[] = [];
    const store = {
        write: jest.fn((state: MethodologyPreviewState) => {
            order.push('write');
            return Promise.resolve(state);
        }),
        read: jest.fn().mockResolvedValue(stored),
    };
    const queueDispatcher = {
        dispatch: jest.fn(() => {
            order.push('dispatch');
            return Promise.resolve({});
        }),
    };
    const service = new MethodologyPreviewService(
        store as never,
        queueDispatcher as never,
    );
    return { service, store, queueDispatcher, order };
};

describe('MethodologyPreviewService', () => {
    it('черновик с ошибками до очереди не доходит — ошибки возвращаются словами', async () => {
        const { service, store, queueDispatcher } = makeDeps();

        await expect(
            service.start({
                domain: DOMAIN,
                transcriptionId: '184523',
                config: { code: 'x' },
            }),
        ).rejects.toThrow(BadRequestException);
        await expect(
            service.start({
                domain: DOMAIN,
                transcriptionId: '184523',
                config: { code: 'x' },
            }),
        ).rejects.toThrow('Черновик не проходит проверку');
        expect(store.write).not.toHaveBeenCalled();
        expect(queueDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('валидный черновик: состояние «в очереди» пишется до постановки задания воркеру разборов', async () => {
        const { service, queueDispatcher, order } = makeDeps();

        const state = await service.start({
            domain: DOMAIN,
            transcriptionId: '184523',
            config: POLYANSKY_METHODOLOGY,
            requestedBy: 'owner',
        });

        expect(state).toMatchObject({
            status: 'queued',
            domain: DOMAIN,
            transcriptionId: '184523',
            error: null,
            result: null,
        });
        expect(state.previewId).toMatch(METHODOLOGY_PREVIEW_ID_PATTERN);
        expect(order).toEqual(['write', 'dispatch']);
        expect(queueDispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_METHODOLOGY_PREVIEW,
            {
                previewId: state.previewId,
                domain: DOMAIN,
                transcriptionId: '184523',
                config: POLYANSKY_METHODOLOGY,
                requestedBy: 'owner',
            },
            state.previewId,
            expect.objectContaining({ attempts: 1, removeOnComplete: true }),
        );
    });

    it('состояние читается по номеру; нет записи — понятный отказ «хранится час»', async () => {
        const stored: MethodologyPreviewState = {
            previewId: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
            status: 'running',
            domain: DOMAIN,
            transcriptionId: '184523',
            error: null,
            result: null,
            updatedAt: '2026-11-16T11:05:12.000Z',
        };
        const found = makeDeps(stored);
        await expect(found.service.status(stored.previewId)).resolves.toEqual(
            stored,
        );

        const missing = makeDeps(null);
        await expect(missing.service.status(stored.previewId)).rejects.toThrow(
            NotFoundException,
        );
        await expect(missing.service.status(stored.previewId)).rejects.toThrow(
            'результат хранится час',
        );
    });
});
