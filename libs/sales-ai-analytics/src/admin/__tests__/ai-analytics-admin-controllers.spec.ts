import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard, Role, RolesGuard } from '@lib/auth';
import { ROLES_KEY } from '@lib/auth/config/auth.constants';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_TAG,
} from '../controllers/admin-controller.const';
import { AiAnalyticsAuditAdminController } from '../controllers/audit.admin.controller';
import { AiAnalyticsFeedbackCostAdminController } from '../controllers/feedback-cost.admin.controller';
import { AiAnalyticsGoldenSetAdminController } from '../controllers/golden-set.admin.controller';
import { AiAnalyticsPipelineAdminController } from '../controllers/pipeline.admin.controller';
import { AiAnalyticsRetentionAdminController } from '../controllers/retention.admin.controller';
import { SalesAiAnalyticsAdminModule } from '../sales-ai-analytics-admin.module';
import { SalesAiAnalyticsAuditModule } from '../sales-ai-analytics-audit.module';
import { SalesAiAnalyticsOpsModule } from '../sales-ai-analytics-ops.module';
import { SalesAiAnalyticsProbeModule } from '../sales-ai-analytics-probe.module';
import { SalesAiAnalyticsRetentionCronModule } from '../sales-ai-analytics-retention-cron.module';
import { AI_ANALYTICS_ETL_STATUS_DEFAULTS } from '../dto/ai-analytics-etl-status-query.dto';
import { AI_ANALYTICS_RETENTION_DEFAULTS } from '../services/ai-analytics-retention.service';
import { GOLDEN_SET_MESSAGES } from '../services/ai-analytics-golden-set.service';

const ADMIN_CONTROLLERS = [
    AiAnalyticsAuditAdminController,
    AiAnalyticsPipelineAdminController,
    AiAnalyticsRetentionAdminController,
    AiAnalyticsFeedbackCostAdminController,
    AiAnalyticsGoldenSetAdminController,
];

const metadataOf = (key: string, target: unknown): unknown[] =>
    (Reflect.getMetadata(key, target as object) as unknown[] | undefined) ?? [];

/** Метаданные роута висят на самой функции метода (не на дескрипторе). */
function handlerOf(controller: object, method: string): object {
    return Object.getOwnPropertyDescriptor(
        (controller as { prototype: object }).prototype,
        method,
    )?.value as object;
}

describe('админ-контроллеры AI-аналитики', () => {
    it('все под одним путём admin/ai-analytics и одним тегом Swagger', () => {
        for (const controller of ADMIN_CONTROLLERS) {
            expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(
                AI_ANALYTICS_ADMIN_PATH,
            );
            expect(
                Reflect.getMetadata('swagger/apiUseTags', controller),
            ).toEqual([AI_ANALYTICS_ADMIN_TAG]);
        }
    });

    it('у всех гарды JwtAuthGuard + RolesGuard и роль SUPER_USER', () => {
        for (const controller of ADMIN_CONTROLLERS) {
            expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
                JwtAuthGuard,
                RolesGuard,
            ]);
            expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual([
                Role.SUPER_USER,
            ]);
        }
    });

    it('роуты и методы: recompute, backfill, etl-status', () => {
        const routes: [string, string, number][] = [
            ['recompute', 'recompute', RequestMethod.POST],
            ['backfill', 'backfill', RequestMethod.POST],
            ['status', 'etl-status', RequestMethod.GET],
        ];
        for (const [method, path, verb] of routes) {
            const handler = handlerOf(
                AiAnalyticsPipelineAdminController,
                method,
            );
            expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
            expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
        }
    });

    it('роуты и методы: retention/run, feedback, cost, golden-set, golden-set/run', () => {
        const retention = handlerOf(AiAnalyticsRetentionAdminController, 'run');
        expect(Reflect.getMetadata(PATH_METADATA, retention)).toBe(
            'retention/run',
        );
        expect(Reflect.getMetadata(METHOD_METADATA, retention)).toBe(
            RequestMethod.POST,
        );

        const feedback = handlerOf(
            AiAnalyticsFeedbackCostAdminController,
            'feedbackSummary',
        );
        expect(Reflect.getMetadata(PATH_METADATA, feedback)).toBe('feedback');
        expect(Reflect.getMetadata(METHOD_METADATA, feedback)).toBe(
            RequestMethod.GET,
        );

        const cost = handlerOf(
            AiAnalyticsFeedbackCostAdminController,
            'costSummary',
        );
        expect(Reflect.getMetadata(PATH_METADATA, cost)).toBe('cost');

        const list = handlerOf(AiAnalyticsGoldenSetAdminController, 'list');
        expect(Reflect.getMetadata(PATH_METADATA, list)).toBe('golden-set');
        expect(Reflect.getMetadata(METHOD_METADATA, list)).toBe(
            RequestMethod.GET,
        );

        const run = handlerOf(AiAnalyticsGoldenSetAdminController, 'run');
        expect(Reflect.getMetadata(PATH_METADATA, run)).toBe('golden-set/run');
        expect(Reflect.getMetadata(METHOD_METADATA, run)).toBe(
            RequestMethod.POST,
        );
    });
});

describe('раскол модулей (ai/rules/app-api-surface.md)', () => {
    it('сервисные модули — без контроллеров, контроллеры только в admin-модуле', () => {
        expect(metadataOf('controllers', SalesAiAnalyticsAuditModule)).toEqual(
            [],
        );
        expect(metadataOf('controllers', SalesAiAnalyticsProbeModule)).toEqual(
            [],
        );
        expect(metadataOf('controllers', SalesAiAnalyticsOpsModule)).toEqual(
            [],
        );
        expect(
            metadataOf('controllers', SalesAiAnalyticsRetentionCronModule),
        ).toEqual([]);
        expect(metadataOf('controllers', SalesAiAnalyticsAdminModule)).toEqual(
            ADMIN_CONTROLLERS,
        );
    });

    it('admin-модуль импортирует ровно три сервисных модуля', () => {
        expect(metadataOf('imports', SalesAiAnalyticsAdminModule)).toEqual([
            SalesAiAnalyticsAuditModule,
            SalesAiAnalyticsProbeModule,
            SalesAiAnalyticsOpsModule,
        ]);
    });

    it('крон ретенции не в admin-модуле: в apps/admin нет ScheduleModule', () => {
        expect(
            metadataOf('imports', SalesAiAnalyticsAdminModule),
        ).not.toContain(SalesAiAnalyticsRetentionCronModule);
        expect(metadataOf('providers', SalesAiAnalyticsOpsModule)).toEqual(
            expect.not.arrayContaining([
                expect.objectContaining({
                    name: 'AiAnalyticsRetentionScheduler',
                }),
            ]),
        );
    });
});

describe('делегирование контроллеров в сервисы', () => {
    it('recompute и backfill передают поля тела как есть', async () => {
        const pipeline = {
            recompute: jest.fn().mockResolvedValue({}),
            backfill: jest.fn().mockResolvedValue({}),
        };
        const etlStatus = { status: jest.fn().mockResolvedValue({}) };
        const controller = new AiAnalyticsPipelineAdminController(
            pipeline as never,
            etlStatus as never,
        );
        await controller.recompute({
            domain: 'd',
            rhythm: 'weekly',
            monthKey: '2026-08',
            weekKey: '2026-W35',
            steps: ['calls'],
        });
        expect(pipeline.recompute).toHaveBeenCalledWith({
            domain: 'd',
            rhythm: 'weekly',
            monthKey: '2026-08',
            weekKey: '2026-W35',
            steps: ['calls'],
        });

        await controller.backfill({
            domain: 'd',
            from: '2026-01',
            to: '2026-02',
        });
        expect(pipeline.backfill).toHaveBeenCalledWith({
            domain: 'd',
            from: '2026-01',
            to: '2026-02',
        });
    });

    it('etl-status: days по умолчанию 7, явный — как есть', async () => {
        const etlStatus = { status: jest.fn().mockResolvedValue({}) };
        const controller = new AiAnalyticsPipelineAdminController(
            { recompute: jest.fn(), backfill: jest.fn() } as never,
            etlStatus as never,
        );
        await controller.status({ domain: 'd' });
        expect(etlStatus.status).toHaveBeenCalledWith(
            'd',
            AI_ANALYTICS_ETL_STATUS_DEFAULTS.days,
        );
        await controller.status({ domain: 'd', days: 30 });
        expect(etlStatus.status).toHaveBeenLastCalledWith('d', 30);
    });

    it('retention/run: dryRun по умолчанию true, sampleLimit — 20', async () => {
        const retention = { run: jest.fn().mockResolvedValue({}) };
        const controller = new AiAnalyticsRetentionAdminController(
            retention as never,
        );
        await controller.run({ domain: 'd' });
        expect(retention.run).toHaveBeenCalledWith({
            domain: 'd',
            dryRun: true,
            sampleLimit: AI_ANALYTICS_RETENTION_DEFAULTS.sampleLimit,
        });
        await controller.run({ domain: 'd', dryRun: false, sampleLimit: 5 });
        expect(retention.run).toHaveBeenLastCalledWith({
            domain: 'd',
            dryRun: false,
            sampleLimit: 5,
        });
    });

    it('golden-set/run отвечает отказом с текстом «подключается потоком П7»', () => {
        const goldenSet = {
            list: jest.fn(),
            run: jest.fn().mockReturnValue({
                domain: 'd',
                dispatched: false,
                jobId: null,
                reason: GOLDEN_SET_MESSAGES.runNotWired,
            }),
        };
        const controller = new AiAnalyticsGoldenSetAdminController(
            goldenSet as never,
        );
        const result = controller.run({ domain: 'd' });
        expect(result.dispatched).toBe(false);
        expect(result.jobId).toBeNull();
        expect(result.reason).toContain('П7');
    });
});
