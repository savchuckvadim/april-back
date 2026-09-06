import { AI_ANALYTICS_AUDIT_ABOUT } from '../../audit/ai-analytics-audit.about';
import { AiAnalyticsAuditService } from '../ai-analytics-audit.service';
import { auditReportFixture } from './audit-report.fixture';

const NOW = new Date('2026-09-06T04:10:00Z');

/** Минимальный PrismaClient для PrismaAuditDb: пустая БД. */
function makePrisma() {
    return {
        transcription: { findMany: jest.fn().mockResolvedValue([]) },
        ai: {
            findMany: jest.fn().mockResolvedValue([]),
            aggregate: jest.fn().mockResolvedValue({
                _min: { created_at: null },
                _count: { _all: 0 },
            }),
        },
    };
}

function makeService(auditEnabled = true) {
    const prisma = makePrisma();
    const snapshots = {
        save: jest.fn().mockResolvedValue('9001'),
        latest: jest.fn().mockResolvedValue(null),
    };
    // Настройки kpi-sales портала: признак разрешения аудита.
    const appSettings = {
        resolve: jest.fn().mockResolvedValue({
            aiAnalyticsEnabled: true,
            aiAnalyticsAuditEnabled: auditEnabled,
        }),
    };
    return {
        service: new AiAnalyticsAuditService(
            prisma as never,
            snapshots as never,
            appSettings as never,
        ),
        prisma,
        snapshots,
        appSettings,
    };
}

describe('AiAnalyticsAuditService', () => {
    it('run считает отчёт по живой БД и при save пишет снапшот с source и параметрами', async () => {
        const { service, prisma, snapshots } = makeService();
        const result = await service.run('april.bitrix24.ru', {
            months: 3,
            timeZone: 'Europe/Moscow',
            save: true,
            source: 'admin',
            now: NOW,
        });
        expect(result).toMatchObject({
            domain: 'april.bitrix24.ru',
            generatedAt: '2026-09-06T04:10:00.000Z',
            months: 3,
            timeZone: 'Europe/Moscow',
            fromSnapshot: false,
            source: 'admin',
        });
        expect(result.report.meta.months).toEqual([
            '2026-07',
            '2026-08',
            '2026-09',
        ]);
        expect(result.markdown).toContain('# Аудит данных AI-аналитики');
        // Выборка шла через Prisma-адаптер по домену.
        expect(prisma.transcription.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    domain: 'april.bitrix24.ru',
                }) as unknown,
            }),
        );
        expect(snapshots.save).toHaveBeenCalledWith({
            domain: 'april.bitrix24.ru',
            markdown: result.markdown,
            payload: {
                report: result.report,
                months: 3,
                timeZone: 'Europe/Moscow',
                generatedAt: '2026-09-06T04:10:00.000Z',
                source: 'admin',
            },
        });
    });

    it('run с save = false не пишет снапшот', async () => {
        const { service, snapshots } = makeService();
        const result = await service.run('d', {
            months: 1,
            timeZone: 'Asia/Vladivostok',
            save: false,
            source: 'admin',
            now: NOW,
        });
        expect(result.fromSnapshot).toBe(false);
        expect(result.timeZone).toBe('Asia/Vladivostok');
        expect(snapshots.save).not.toHaveBeenCalled();
    });

    it('latest отдаёт снапшот из стора с fromSnapshot = true, без снапшота — null', async () => {
        const { service, snapshots } = makeService();
        expect(await service.latest('d')).toBeNull();

        const report = auditReportFixture('d', '2026-09-01');
        snapshots.latest.mockResolvedValueOnce({
            id: '7',
            createdAt: new Date('2026-09-01T01:10:00Z'),
            markdown: '# снапшот',
            report,
            months: 6,
            timeZone: 'Europe/Moscow',
            generatedAt: '2026-09-01T01:10:00.000Z',
            source: 'cron',
        });
        expect(await service.latest('d')).toEqual({
            domain: 'd',
            generatedAt: '2026-09-01T01:10:00.000Z',
            months: 6,
            timeZone: 'Europe/Moscow',
            fromSnapshot: true,
            source: 'cron',
            markdown: '# снапшот',
            report,
            about: AI_ANALYTICS_AUDIT_ABOUT,
        });
        expect(snapshots.latest).toHaveBeenCalledWith('d');
    });

    it('без признака ai_analytics_audit_enabled run отвечает 403 с подсказкой, latest работает', async () => {
        const { service, snapshots, prisma } = makeService(false);
        await expect(
            service.run('april.bitrix24.ru', {
                months: 6,
                timeZone: 'Europe/Moscow',
                save: true,
                source: 'admin',
                now: NOW,
            }),
        ).rejects.toMatchObject({
            status: 403,
            message: expect.stringContaining(
                'ai_analytics_audit_enabled',
            ) as unknown,
        });
        expect(prisma.transcription.findMany).not.toHaveBeenCalled();
        expect(snapshots.save).not.toHaveBeenCalled();
        expect(await service.latest('april.bitrix24.ru')).toBeNull();
    });

    it('ответ несёт самоописание about; status — признак и дату последнего снапшота', async () => {
        const { service, snapshots } = makeService(true);
        const result = await service.run('april.bitrix24.ru', {
            months: 1,
            timeZone: 'Europe/Moscow',
            save: false,
            source: 'admin',
            now: NOW,
        });
        expect(result.about.title).toContain('Аудит данных');
        expect(result.about.computes.map(item => item.code)).toEqual(
            expect.arrayContaining(['coverage', 'pivots', 'recommendation']),
        );
        expect(await service.status('april.bitrix24.ru')).toEqual({
            domain: 'april.bitrix24.ru',
            aiAnalyticsEnabled: true,
            auditEnabled: true,
            lastSnapshotAt: null,
        });
        snapshots.latest.mockResolvedValueOnce({
            generatedAt: '2026-09-01T01:10:00.000Z',
            months: 6,
            timeZone: 'Europe/Moscow',
            source: 'cron',
            markdown: '# отчёт',
            report: auditReportFixture('april.bitrix24.ru'),
        });
        expect((await service.status('april.bitrix24.ru')).lastSnapshotAt).toBe(
            '2026-09-01T01:10:00.000Z',
        );
    });
});
