import { NotFoundException } from '@nestjs/common';
import { JobNames, QueueNames } from '@lib/queue';
import {
    ANALYSIS_PREVIEW_ID_PATTERN,
    type AnalysisPreviewState,
} from '@lib/call-lib/call-report/analysis-preview';
import { AnalysisPreviewService } from '../services/analysis-preview.service';

const DOMAIN = 'gsr.bitrix24.ru';

const makeDeps = (stored: AnalysisPreviewState | null = null) => {
    const order: string[] = [];
    const store = {
        write: jest.fn((state: AnalysisPreviewState) => {
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
    const service = new AnalysisPreviewService(
        store as never,
        queueDispatcher as never,
    );
    return { service, store, queueDispatcher, order };
};

describe('AnalysisPreviewService', () => {
    it('состояние «в очереди» пишется до постановки задания воркеру разборов', async () => {
        const { service, queueDispatcher, order } = makeDeps();

        const state = await service.start({
            domain: DOMAIN,
            transcriptionId: '184523',
            requestedBy: 'admin',
        });

        expect(state.status).toBe('queued');
        expect(state.previewId).toMatch(ANALYSIS_PREVIEW_ID_PATTERN);
        expect(order).toEqual(['write', 'dispatch']);
        expect(queueDispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_ANALYSIS_PREVIEW,
            {
                previewId: state.previewId,
                domain: DOMAIN,
                transcriptionId: '184523',
                requestedBy: 'admin',
            },
            state.previewId,
            expect.objectContaining({ attempts: 1, removeOnComplete: true }),
        );
    });

    it('«разобрать по частям»: флаг уходит воркеру в задании; без флага ключа в задании нет', async () => {
        const forced = makeDeps();
        const state = await forced.service.start({
            domain: DOMAIN,
            transcriptionId: '184523',
            longParts: true,
        });
        expect(forced.queueDispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_ANALYSIS_PREVIEW,
            {
                previewId: state.previewId,
                domain: DOMAIN,
                transcriptionId: '184523',
                longParts: true,
            },
            state.previewId,
            expect.anything(),
        );

        const plain = makeDeps();
        await plain.service.start({
            domain: DOMAIN,
            transcriptionId: '184523',
            longParts: false,
        });
        const [, , data] = (
            plain.queueDispatcher.dispatch.mock.calls as unknown[][]
        )[0];
        expect(data).not.toHaveProperty('longParts');
    });

    it('опрос: состояние из Redis; нет — 404 со словами «запустите заново»', async () => {
        const stored: AnalysisPreviewState = {
            previewId: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
            status: 'running',
            domain: DOMAIN,
            transcriptionId: '184523',
            error: null,
            result: null,
            updatedAt: '2026-11-18T11:05:12.000Z',
        };
        await expect(
            makeDeps(stored).service.status(stored.previewId),
        ).resolves.toEqual(stored);

        const missing = makeDeps(null).service.status(stored.previewId);
        await expect(missing).rejects.toThrow(NotFoundException);
        await expect(
            makeDeps(null).service.status(stored.previewId),
        ).rejects.toThrow('Запустите проверку заново');
    });
});
