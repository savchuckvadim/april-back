import {
    BadRequestException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { JobNames, QueueNames } from '@lib/queue';
import {
    parseOwnerReportExportState,
    type OwnerReportExportState,
} from '../../contracts/owner-report-export.types';
import { AiOwnerReportExportService } from '../services/ai-owner-report-export.service';

const NOW = new Date('2026-11-07T10:00:00+03:00');
const TARGET = {
    domain: 'gsr.bitrix24.ru',
    kind: 'month' as const,
    periodKey: '2026-10',
};

const state = (
    patch: Partial<OwnerReportExportState>,
): OwnerReportExportState => ({
    ...TARGET,
    status: 'ready',
    filename: 'sales-report-month-2026-10.pdf',
    sizeBytes: 8,
    message: null,
    updatedAt: NOW.toISOString(),
    ...patch,
});

const makeService = (
    current: OwnerReportExportState | null = null,
    withQueue = true,
) => {
    const store = {
        readState: jest.fn().mockResolvedValue(current),
        writeState: jest.fn((_t: unknown, patch: { status: string }) =>
            Promise.resolve(state({ status: patch.status as 'queued' })),
        ),
        readPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({ id: 'j1' }) };
    const service = new AiOwnerReportExportService(
        store as never,
        withQueue ? (dispatcher as never) : undefined,
    );
    return { service, store, dispatcher };
};

describe('AiOwnerReportExportService — выгрузка PDF из админки', () => {
    it('закрытый месяц: отметка «в очереди» и джоба в общую очередь отчётов', async () => {
        const { service, dispatcher, store } = makeService();
        const result = await service.start(
            { ...TARGET, forceRefresh: true },
            NOW,
        );
        expect(result.status).toBe('queued');
        expect(store.writeState).toHaveBeenCalledWith(
            expect.objectContaining(TARGET),
            { status: 'queued' },
            NOW,
        );
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT,
            { ...TARGET, forceRefresh: true },
            'owner-report-export:gsr.bitrix24.ru:month:2026-10',
            expect.objectContaining({ attempts: 1 }),
        );
    });

    it('идущая выгрузка того же периода не ставится второй раз', async () => {
        const { service, dispatcher } = makeService(
            state({ status: 'processing', filename: null }),
        );
        const result = await service.start(
            { ...TARGET, forceRefresh: false },
            NOW,
        );
        expect(result.status).toBe('processing');
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('открытый период и чужой ключ — 400; без очереди — 503', async () => {
        const { service } = makeService();
        await expect(
            service.start(
                { ...TARGET, periodKey: '2026-11', forceRefresh: false },
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.start(
                { ...TARGET, periodKey: '2026-Q4', forceRefresh: false },
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            makeService(null, false).service.start(
                { ...TARGET, forceRefresh: false },
                NOW,
            ),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('файл — только готовый, с доменом в имени', async () => {
        expect(await makeService(state({})).service.file(TARGET)).toEqual({
            buffer: Buffer.from('%PDF-1.4'),
            filename: 'gsr.bitrix24.ru-sales-report-month-2026-10.pdf',
        });
        expect(
            await makeService(state({ status: 'processing' })).service.file(
                TARGET,
            ),
        ).toBeNull();
    });

    it('состояние из Redis: чужая форма и битый JSON — null', () => {
        expect(
            parseOwnerReportExportState(JSON.stringify(state({}))),
        ).toMatchObject({ status: 'ready' });
        expect(parseOwnerReportExportState('{"status":"done"}')).toBeNull();
        expect(parseOwnerReportExportState('не json')).toBeNull();
        expect(parseOwnerReportExportState(null)).toBeNull();
    });
});
