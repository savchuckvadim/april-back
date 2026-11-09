import { BadRequestException } from '@nestjs/common';
import { OwnerReportUseCase } from '../../domain/use-cases/owner-report.use-case';
import type { AiOwnerReportDto } from '../../dto/ai-owner-report.dto';
import { AI_OWNER_REPORT_KEY_VERSION } from '../owner-report.const';

const NOW = new Date('2026-11-06T09:00:00Z');
const KEY = `sales-ai-analytics:v1:test.bitrix24.ru:owner-report:${AI_OWNER_REPORT_KEY_VERSION}:month:2026-10`;

const dto = (): AiOwnerReportDto =>
    ({ kind: 'month', periodKey: '2026-10' }) as AiOwnerReportDto;

const makeUseCase = (
    options: {
        cached?: unknown;
        stored?: AiOwnerReportDto | null;
        jobState?: string | null;
    } = {},
) => {
    const settings = {
        load: jest
            .fn()
            .mockResolvedValue({ calendar: { timeZone: 'Europe/Moscow' } }),
    };
    const cache = {
        getJson: jest.fn().mockResolvedValue(options.cached ?? null),
        setJson: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
        getJob: jest
            .fn()
            .mockResolvedValue(
                options.jobState
                    ? { getState: () => Promise.resolve(options.jobState) }
                    : null,
            ),
        dispatch: jest.fn().mockResolvedValue({}),
    };
    const reader = {
        read: jest.fn().mockResolvedValue(options.stored ?? null),
    };
    const useCase = new OwnerReportUseCase(
        settings as never,
        cache as never,
        queue as never,
        reader as never,
    );
    return { useCase, cache, queue, reader };
};

const request = (overrides: Record<string, unknown> = {}) =>
    ({
        domain: 'test.bitrix24.ru',
        requesterUserId: '447',
        kind: 'month',
        ...overrides,
    }) as never;

describe('OwnerReportUseCase.lookup', () => {
    it('без ключа — последний закрытый месяц; промах кэша и снапшота → джоба (queued)', async () => {
        const { useCase, queue } = makeUseCase();
        const result = await useCase.lookup(request({ socketId: 's1' }), NOW);
        expect(result).toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(queue.dispatch).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
                kind: 'month',
                periodKey: '2026-10',
                from: '2026-10-01',
                to: '2026-10-31',
                requestKey: KEY,
                socketId: 's1',
            }),
            KEY,
            expect.objectContaining({ attempts: 1 }),
        );
    });

    it('чужой ключ и незакрытый период — 400', async () => {
        const { useCase } = makeUseCase();
        await expect(
            useCase.lookup(request({ periodKey: '2026-Q4' }), NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            useCase.lookup(request({ periodKey: '2026-11' }), NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('кэш → ready без джобы; снапшот → ready и запись в кэш', async () => {
        const cached = makeUseCase({
            cached: { status: 'ready', data: dto() },
        });
        expect(await cached.useCase.lookup(request(), NOW)).toMatchObject({
            status: 'ready',
            data: { periodKey: '2026-10' },
        });
        expect(cached.queue.dispatch).not.toHaveBeenCalled();

        const stored = makeUseCase({ stored: dto() });
        expect(await stored.useCase.lookup(request(), NOW)).toMatchObject({
            status: 'ready',
        });
        expect(stored.cache.setJson).toHaveBeenCalledWith(
            KEY,
            { status: 'ready', data: dto() },
            expect.any(Number),
        );
    });

    it('error-конверт из кэша отдаётся как есть; идущая джоба → processing', async () => {
        const failed = makeUseCase({
            cached: { status: 'error', message: 'упало' },
        });
        expect(await failed.useCase.lookup(request(), NOW)).toEqual({
            status: 'error',
            requestKey: KEY,
            message: 'упало',
        });
        const running = makeUseCase({ jobState: 'active' });
        expect(await running.useCase.lookup(request(), NOW)).toEqual({
            status: 'processing',
            requestKey: KEY,
            jobId: KEY,
        });
    });

    it('forceRefresh не читает кэш и снапшот, ставит джобу с флагом', async () => {
        const { useCase, cache, reader, queue } = makeUseCase({
            cached: { status: 'ready', data: dto() },
            stored: dto(),
        });
        const result = await useCase.lookup(
            request({ forceRefresh: true, periodKey: '2026-09' }),
            NOW,
        );
        expect(result.status).toBe('queued');
        expect(cache.getJson).not.toHaveBeenCalled();
        expect(reader.read).not.toHaveBeenCalled();
        expect(queue.dispatch).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
                periodKey: '2026-09',
                forceRefresh: true,
            }),
            expect.any(String),
            expect.anything(),
        );
    });
});
