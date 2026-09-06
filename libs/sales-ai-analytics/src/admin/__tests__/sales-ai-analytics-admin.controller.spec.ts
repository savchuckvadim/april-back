import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, Role, RolesGuard } from '@lib/auth';
import { ROLES_KEY } from '@lib/auth/config/auth.constants';
import { SalesAiAnalyticsAdminController } from '../sales-ai-analytics-admin.controller';
import { SalesAiAnalyticsAdminModule } from '../sales-ai-analytics-admin.module';
import { SalesAiAnalyticsAuditModule } from '../sales-ai-analytics-audit.module';
import { auditReportFixture } from './audit-report.fixture';

function makeController() {
    const audit = {
        run: jest.fn(),
        latest: jest.fn().mockResolvedValue(null),
        status: jest.fn().mockResolvedValue({
            domain: 'd.bitrix24.ru',
            aiAnalyticsEnabled: true,
            auditEnabled: true,
            lastSnapshotAt: null,
        }),
    };
    return {
        controller: new SalesAiAnalyticsAdminController(audit as never),
        audit,
    };
}

describe('SalesAiAnalyticsAdminController', () => {
    it('защищён гардами JwtAuthGuard + RolesGuard и ролью SUPER_USER', () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            SalesAiAnalyticsAdminController,
        ) as unknown[];
        expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
        expect(
            Reflect.getMetadata(ROLES_KEY, SalesAiAnalyticsAdminController),
        ).toEqual([Role.SUPER_USER]);
    });

    it('POST audit: умолчания months 6, TZ Europe/Moscow, save true, source admin', async () => {
        const { controller, audit } = makeController();
        const report = auditReportFixture('april.bitrix24.ru');
        audit.run.mockResolvedValueOnce({
            domain: 'april.bitrix24.ru',
            generatedAt: '2026-09-06T04:10:00.000Z',
            months: 6,
            timeZone: 'Europe/Moscow',
            fromSnapshot: false,
            source: 'admin',
            markdown: '# отчёт',
            report,
        });
        const result = await controller.run({ domain: 'april.bitrix24.ru' });
        expect(audit.run).toHaveBeenCalledWith('april.bitrix24.ru', {
            months: 6,
            timeZone: 'Europe/Moscow',
            save: true,
            source: 'admin',
        });
        expect(result.fromSnapshot).toBe(false);
        expect(result.markdown).toBe('# отчёт');
    });

    it('POST audit: явные параметры передаются как есть', async () => {
        const { controller, audit } = makeController();
        audit.run.mockResolvedValueOnce({});
        await controller.run({
            domain: 'd',
            months: 12,
            timeZone: 'Asia/Vladivostok',
            save: false,
        });
        expect(audit.run).toHaveBeenCalledWith('d', {
            months: 12,
            timeZone: 'Asia/Vladivostok',
            save: false,
            source: 'admin',
        });
    });

    it('GET audit/latest: снапшот отдаётся, без снапшота — 404 с русским сообщением', async () => {
        const { controller, audit } = makeController();
        await expect(controller.latest({ domain: 'd' })).rejects.toThrow(
            NotFoundException,
        );
        await expect(controller.latest({ domain: 'd' })).rejects.toThrow(
            'Снапшотов аудита AI-аналитики по домену d ещё нет',
        );

        audit.latest.mockResolvedValueOnce({
            domain: 'd',
            fromSnapshot: true,
            source: 'cron',
            markdown: '# снапшот',
        });
        await expect(controller.latest({ domain: 'd' })).resolves.toMatchObject(
            { fromSnapshot: true, source: 'cron' },
        );
    });

    it('раскол Module/AdminModule: контроллер только в admin-модуле, сервисный — без контроллеров', () => {
        const controllersOf = (module: unknown): unknown[] =>
            (Reflect.getMetadata('controllers', module as object) as
                | unknown[]
                | undefined) ?? [];
        expect(controllersOf(SalesAiAnalyticsAuditModule)).toEqual([]);
        expect(controllersOf(SalesAiAnalyticsAdminModule)).toEqual([
            SalesAiAnalyticsAdminController,
        ]);
        expect(
            Reflect.getMetadata('imports', SalesAiAnalyticsAdminModule),
        ).toEqual([SalesAiAnalyticsAuditModule]);
    });

    it('GET audit/about: самоописание всегда, состояние портала — только с domain', async () => {
        const { controller, audit } = makeController();
        const bare = await controller.about({});
        expect(bare.about.title).toContain('Аудит данных');
        expect(bare.about.howToRun.length).toBeGreaterThan(0);
        expect(bare.portal).toBeNull();
        expect(audit.status).not.toHaveBeenCalled();

        const withPortal = await controller.about({ domain: 'd.bitrix24.ru' });
        expect(audit.status).toHaveBeenCalledWith('d.bitrix24.ru');
        expect(withPortal.portal).toEqual({
            domain: 'd.bitrix24.ru',
            aiAnalyticsEnabled: true,
            auditEnabled: true,
            lastSnapshotAt: null,
        });
    });
});
