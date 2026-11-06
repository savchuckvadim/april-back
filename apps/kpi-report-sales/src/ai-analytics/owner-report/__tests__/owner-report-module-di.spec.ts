import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import { WsService } from '@/core/ws';
import { OwnerReportDeliveryUseCase } from '../../domain/use-cases/owner-report-delivery.use-case';
import { OwnerReportJobUseCase } from '../../domain/use-cases/owner-report-job.use-case';
import { OwnerReportUseCase } from '../../domain/use-cases/owner-report.use-case';
import {
    exportsOf,
    metadataList,
    missingDependencies,
    type Ctor,
} from '../../__tests__/fixtures/module-di.util';
import { AiAnalyticsOwnerReportController } from '../ai-analytics-owner-report.controller';
import { AiAnalyticsOwnerReportModule } from '../ai-analytics-owner-report.module';
import { LlmGatewayNarrativeAdapter } from '../llm-gateway-narrative.adapter';
import { AI_OWNER_REPORT_NARRATIVE_PORT } from '../owner-report-narrative.port';

/**
 * Срез отчёта собственнику подключается в сборку отдельным модулем: его
 * DI-граф обязан закрываться сам (ядро, PBX-половина ядра, шлюз моделей,
 * очередь, WS), а наружу уходит ровно одна ручка и три use-case'а
 * (сборка, джоба, выпуск).
 */
describe('DI-граф AiAnalyticsOwnerReportModule', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        expect(
            missingDependencies(AiAnalyticsOwnerReportModule, [
                AppCacheService,
                WsService,
            ]),
        ).toEqual([]);
    });

    it('порт модели закрыт адаптером шлюза LLM', () => {
        const providers =
            (Reflect.getMetadata('providers', AiAnalyticsOwnerReportModule) as
                | unknown[]
                | undefined) ?? [];
        const port = providers.find(
            (provider): provider is { provide: string; useExisting: Ctor } =>
                typeof provider === 'object' &&
                provider !== null &&
                (provider as { provide?: unknown }).provide ===
                    AI_OWNER_REPORT_NARRATIVE_PORT,
        );
        expect(port?.useExisting).toBe(LlmGatewayNarrativeAdapter);
    });

    it('модуль публикует только свою ручку и экспортирует три use-case’а', () => {
        expect(
            metadataList(AiAnalyticsOwnerReportModule, 'controllers'),
        ).toEqual([AiAnalyticsOwnerReportController]);
        expect([...exportsOf(AiAnalyticsOwnerReportModule)]).toEqual([
            OwnerReportUseCase,
            OwnerReportJobUseCase,
            OwnerReportDeliveryUseCase,
        ]);
    });
});
