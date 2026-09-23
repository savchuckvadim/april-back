import 'reflect-metadata';
import { NotFoundException, RequestMethod } from '@nestjs/common';
import {
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard, Role, RolesGuard } from '@lib/auth';
import { ROLES_KEY } from '@lib/auth/config/auth.constants';
import { AiAnalyticsAuditAdminController } from '../controllers/audit.admin.controller';
import { SalesAiAnalyticsAdminModule } from '../sales-ai-analytics-admin.module';
import { SalesAiAnalyticsAuditModule } from '../sales-ai-analytics-audit.module';
import { SalesAiAnalyticsProbeModule } from '../sales-ai-analytics-probe.module';
import type { StageHistoryProbeResult } from '../stage-history-probe.service';
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
    const probe = { probe: jest.fn() };
    return {
        controller: new AiAnalyticsAuditAdminController(
            audit as never,
            probe as never,
        ),
        audit,
        probe,
    };
}

/** Известный ответ пробы: доступна, глубина 27 мес., 1234 перехода за 12 мес. */
function probeResultFixture(domain: string): StageHistoryProbeResult {
    return {
        domain,
        checkedAt: '2026-09-21T09:00:00.000Z',
        available: true,
        error: null,
        categoryBitrixId: 4,
        earliestAt: '2024-06-15T10:00:00+03:00',
        historyMonths: 27,
        transitionsInWindow: 1234,
        countIsLowerBound: false,
        windowMonths: 12,
        enough: true,
        hint: 'история доступна, глубина 27 мес., переходов за окно 12 мес. — 1234',
    };
}

const metadataOf = (key: string, module: unknown): unknown[] =>
    (Reflect.getMetadata(key, module as object) as unknown[] | undefined) ?? [];

describe('AiAnalyticsAuditAdminController', () => {
    it('защищён гардами JwtAuthGuard + RolesGuard и ролью SUPER_USER', () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            AiAnalyticsAuditAdminController,
        ) as unknown[];
        expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
        expect(
            Reflect.getMetadata(ROLES_KEY, AiAnalyticsAuditAdminController),
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

    it('раскол Module/AdminModule: контроллер аудита только в admin-модуле, сервисные — без контроллеров', () => {
        expect(metadataOf('controllers', SalesAiAnalyticsAuditModule)).toEqual(
            [],
        );
        expect(metadataOf('controllers', SalesAiAnalyticsProbeModule)).toEqual(
            [],
        );
        expect(
            metadataOf('controllers', SalesAiAnalyticsAdminModule),
        ).toContain(AiAnalyticsAuditAdminController);
        expect(metadataOf('imports', SalesAiAnalyticsAdminModule)).toContain(
            SalesAiAnalyticsAuditModule,
        );
        expect(metadataOf('imports', SalesAiAnalyticsAdminModule)).toContain(
            SalesAiAnalyticsProbeModule,
        );
    });

    it('модуль пробы (PBXModule) не подключён к сервисному модулю аудита — в kpi-report-sales он не течёт', () => {
        expect(
            metadataOf('imports', SalesAiAnalyticsAuditModule),
        ).not.toContain(SalesAiAnalyticsProbeModule);
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

    it('GET stage-history/probe: роут и метод', () => {
        // Nest вешает метаданные роута на саму функцию метода; дескриптор —
        // чтобы не ссылаться на несвязанный метод (unbound-method).
        const handler = Object.getOwnPropertyDescriptor(
            AiAnalyticsAuditAdminController.prototype,
            'probeStageHistory',
        )?.value as object;
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
            'stage-history/probe',
        );
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
            RequestMethod.GET,
        );
    });

    it('GET stage-history/probe: делегирует сервису пробы, months по умолчанию 12, явный — как есть', async () => {
        const { controller, probe } = makeController();
        const fixture = probeResultFixture('april.bitrix24.ru');
        probe.probe.mockResolvedValue(fixture);

        const byDefault = await controller.probeStageHistory({
            domain: 'april.bitrix24.ru',
        });
        expect(probe.probe).toHaveBeenCalledWith('april.bitrix24.ru', 12);
        expect(byDefault).toBe(fixture);

        await controller.probeStageHistory({
            domain: 'april.bitrix24.ru',
            months: 24,
        });
        expect(probe.probe).toHaveBeenLastCalledWith('april.bitrix24.ru', 24);
    });
});
