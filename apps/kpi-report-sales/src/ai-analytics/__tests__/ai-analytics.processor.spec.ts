import { Logger } from '@nestjs/common';
import type { AiBriefDto, AiBriefJobData } from '../dto/ai-brief.dto';
import type { AiOverviewJobData } from '../dto/ai-overview-request.dto';
import type { AiPushJobData } from '../dto/ai-push.dto';
import {
    AI_ANALYTICS_PROCESSOR_ERRORS,
    AiAnalyticsQueueProcessor,
} from '../queue/ai-analytics.processor';

/**
 * Процессор очереди — только dispatch по имени джобы: каждый обработчик
 * зовёт свой use-case с данными джобы, а ошибка не глотается (warn +
 * rethrow, чтобы Bull пометил джобу failed и освободил воркер). Срезы,
 * которые сборка подключает отдельно (резюме, конвейер), при отсутствии
 * отвечают понятной ошибкой, а не TypeError.
 */
const DOMAIN = 'a.bitrix24.ru';

const overviewJob: AiOverviewJobData = {
    domain: DOMAIN,
    from: '2026-08-10',
    to: '2026-09-06',
    managerIds: [10, 20],
    confirmedOnly: false,
    forceRefresh: false,
    requestKey: 'sales-ai-analytics:v1:a.bitrix24.ru:overview:x',
    socketId: 'sock',
};

const briefJob: AiBriefJobData = {
    domain: DOMAIN,
    from: '2026-09-01',
    to: '2026-09-07',
    managerIds: [10],
    requestKey: 'sales-ai-analytics:v1:a.bitrix24.ru:brief:h1',
    packHash: 'h1',
    socketId: 'sock',
};

const pushJob: AiPushJobData = {
    domain: DOMAIN,
    kind: 'agenda',
    date: '2026-09-07',
};

const brief = (): AiBriefDto =>
    ({
        generatedAt: '2026-09-08T05:00:00.000Z',
        source: 'template',
    }) as AiBriefDto;

const pipelineSummary = () => ({
    rhythm: 'nightly',
    domain: DOMAIN,
    day: '2026-09-08',
    status: 'ok',
    steps: [],
    durationMs: 12,
});

interface HarnessOptions {
    withBrief?: boolean;
    withPipeline?: boolean;
}

function makeProcessor({
    withBrief = true,
    withPipeline = true,
}: HarnessOptions = {}) {
    const push = {
        execute: jest.fn().mockResolvedValue({
            status: 'sent',
            reason: null,
            delivered: [1],
        }),
    };
    const audit = {
        execute: jest.fn().mockResolvedValue({ calls: 5, analyzed: 4 }),
    };
    const overview = { execute: jest.fn().mockResolvedValue(undefined) };
    const briefUseCase = { execute: jest.fn().mockResolvedValue(brief()) };
    const pipeline = { run: jest.fn().mockResolvedValue(pipelineSummary()) };
    const processor = new AiAnalyticsQueueProcessor(
        push as never,
        audit as never,
        overview as never,
        withBrief ? (briefUseCase as never) : undefined,
        withPipeline ? pipeline : undefined,
    );
    const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

    return { processor, push, audit, overview, briefUseCase, pipeline, warn };
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('AiAnalyticsQueueProcessor: каждый обработчик зовёт свой use-case', () => {
    it('overview → OverviewJobUseCase.execute(job.data)', async () => {
        const { processor, overview } = makeProcessor();

        await expect(
            processor.handleOverview({ data: overviewJob } as never),
        ).resolves.toBeUndefined();
        expect(overview.execute).toHaveBeenCalledWith(overviewJob);
    });

    it('brief → BriefJobUseCase.execute(job.data), результат возвращается Bull', async () => {
        const { processor, briefUseCase } = makeProcessor();

        const result = await processor.handleBrief({ data: briefJob } as never);

        expect(result).toEqual(brief());
        expect(briefUseCase.execute).toHaveBeenCalledWith(briefJob);
    });

    it('push → AiAnalyticsPushUseCase.execute({domain, kind, date})', async () => {
        const { processor, push } = makeProcessor();

        await expect(
            processor.handlePush({ data: pushJob } as never),
        ).resolves.toMatchObject({ status: 'sent' });
        expect(push.execute).toHaveBeenCalledWith(pushJob);
    });

    it('snapshot audit → AuditSnapshotUseCase.execute({domain, monthKey})', async () => {
        const { processor, audit, pipeline } = makeProcessor();

        const result = await processor.handleSnapshot({
            data: { domain: DOMAIN, kind: 'audit', monthKey: '2026-08' },
        } as never);

        expect(result).toEqual({ calls: 5, analyzed: 4 });
        expect(audit.execute).toHaveBeenCalledWith({
            domain: DOMAIN,
            monthKey: '2026-08',
        });
        expect(pipeline.run).not.toHaveBeenCalled();
    });

    it('snapshot ритма → раннер конвейера с той же джобой', async () => {
        const { processor, audit, pipeline } = makeProcessor();
        const job = {
            data: { domain: DOMAIN, kind: 'nightly', monthKey: '2026-09' },
        };

        const result = await processor.handleSnapshot(job as never);

        expect(result).toEqual(pipelineSummary());
        expect(pipeline.run).toHaveBeenCalledWith(job);
        expect(audit.execute).not.toHaveBeenCalled();
    });
});

describe('AiAnalyticsQueueProcessor: ошибка — warn + rethrow', () => {
    it('brief-джоба с ошибкой не глотается', async () => {
        const { processor, briefUseCase, warn } = makeProcessor();
        briefUseCase.execute.mockRejectedValueOnce(new Error('vibecode down'));

        await expect(
            processor.handleBrief({ data: briefJob } as never),
        ).rejects.toThrow('vibecode down');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('vibecode down');
        expect(warn.mock.calls[0][0]).toContain(briefJob.requestKey);
    });

    it('overview, push и snapshot пробрасывают ошибку use-case', async () => {
        const { processor, overview, push, audit, warn } = makeProcessor();
        overview.execute.mockRejectedValueOnce(new Error('bitrix down'));
        push.execute.mockRejectedValueOnce(new Error('im.notify failed'));
        audit.execute.mockRejectedValueOnce(new Error('db down'));

        await expect(
            processor.handleOverview({ data: overviewJob } as never),
        ).rejects.toThrow('bitrix down');
        await expect(
            processor.handlePush({ data: pushJob } as never),
        ).rejects.toThrow('im.notify failed');
        await expect(
            processor.handleSnapshot({
                data: { domain: DOMAIN, kind: 'audit', monthKey: '2026-08' },
            } as never),
        ).rejects.toThrow('db down');
        expect(warn).toHaveBeenCalledTimes(3);
    });

    it('неизвестный вид снапшота — ошибка до вызова use-case', async () => {
        const { processor, audit, pipeline } = makeProcessor();

        await expect(
            processor.handleSnapshot({
                data: { domain: DOMAIN, kind: 'hourly', monthKey: '2026-09' },
            } as never),
        ).rejects.toThrow('Неизвестный вид снапшота «hourly»');
        expect(audit.execute).not.toHaveBeenCalled();
        expect(pipeline.run).not.toHaveBeenCalled();
    });
});

describe('AiAnalyticsQueueProcessor: срез не подключён сборкой', () => {
    it('нет BriefJobUseCase — brief-джоба падает понятной ошибкой', async () => {
        const { processor, warn } = makeProcessor({ withBrief: false });

        await expect(
            processor.handleBrief({ data: briefJob } as never),
        ).rejects.toThrow(AI_ANALYTICS_PROCESSOR_ERRORS.briefMissing);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('нет раннера — ритмовая джоба падает понятной ошибкой, аудит работает', async () => {
        const { processor, audit } = makeProcessor({ withPipeline: false });

        await expect(
            processor.handleSnapshot({
                data: { domain: DOMAIN, kind: 'weekly', monthKey: '2026-09' },
            } as never),
        ).rejects.toThrow(AI_ANALYTICS_PROCESSOR_ERRORS.pipelineMissing);
        await expect(
            processor.handleSnapshot({
                data: { domain: DOMAIN, kind: 'audit', monthKey: '2026-08' },
            } as never),
        ).resolves.toEqual({ calls: 5, analyzed: 4 });
        expect(audit.execute).toHaveBeenCalledTimes(1);
    });
});
