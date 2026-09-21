import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import {
    minDurationByTypeOfSettings,
    minDurationFloorSec,
    registryMinDurationSec,
} from '@lib/sales-ai-analytics';
import {
    auditShortCallSecOf,
    loadAuditThresholdRows,
} from '../audit/run-ai-analytics-audit';

const DOMAIN = 'april.bitrix24.ru';

/** JSON-колонка portal_app_settings.settings приложения kpi-sales. */
const kpiSalesJson = (keys: Record<string, string>) => ({ ...keys });

const definitionsJson = (byType: Record<string, number>): string =>
    JSON.stringify({ minDurationSecByType: byType });

// Долг 6 волны C: CLI аудита считал долю коротких по константе правил, а не
// по порогу портала. Теперь порог — тот же, что у конвейера разбора
// (настройки kpi-sales → прежний скаляр portal_ai_settings → реестр).
describe('run-ai-analytics-audit: порог «короткого» звонка портала', () => {
    it('строк настроек нет — честная деградация на дефолт реестра', () => {
        expect(
            auditShortCallSecOf({
                kpiSalesSettings: null,
                pipelineMinDurationSec: null,
            }),
        ).toBe(registryMinDurationSec());
    });

    it('карта по типам портала — минимум карты (тип в доле коротких не участвует)', () => {
        const definitions = definitionsJson({ cold: 60 });
        const rows = {
            kpiSalesSettings: kpiSalesJson({
                ai_analytics_definitions: definitions,
            }),
            pipelineMinDurationSec: null,
        };

        expect(auditShortCallSecOf(rows)).toBe(60);
        expect(auditShortCallSecOf(rows)).toBe(
            minDurationFloorSec(
                minDurationByTypeOfSettings({
                    aiAnalyticsDefinitions: definitions,
                }),
            ),
        );
    });

    it('настройки ради другого поля + прежний скаляр конвейера 60 — работает скаляр', () => {
        // Правило portalDefined конвейера: дефолт парсера (300) не вытесняет
        // прежний скаляр портала — отчёт описывает ту же выборку, что разбор.
        expect(
            auditShortCallSecOf({
                kpiSalesSettings: kpiSalesJson({
                    ai_analytics_definitions: JSON.stringify({
                        hotClientColors: ['green'],
                    }),
                }),
                pipelineMinDurationSec: 60,
            }),
        ).toBe(60);
    });

    it('явный порог AI-аналитики старше прежнего скаляра', () => {
        expect(
            auditShortCallSecOf({
                kpiSalesSettings: kpiSalesJson({
                    ai_analytics_model_params: JSON.stringify({
                        min_duration_sec_by_type: 120,
                    }),
                }),
                pipelineMinDurationSec: 60,
            }),
        ).toBe(120);
    });

    it('мусор в JSON-колонке или чужой тип ключа — как будто ключа нет', () => {
        expect(
            auditShortCallSecOf({
                kpiSalesSettings: ['не', 'объект'],
                pipelineMinDurationSec: null,
            }),
        ).toBe(registryMinDurationSec());
        expect(
            auditShortCallSecOf({
                kpiSalesSettings: { ai_analytics_definitions: 42 },
                pipelineMinDurationSec: 45,
            }),
        ).toBe(45);
    });

    it('loadAuditThresholdRows читает kpi-sales и portal_ai_settings по домену', async () => {
        const prisma = {
            portalAppSettings: {
                findFirst: jest.fn().mockResolvedValue({
                    settings: kpiSalesJson({
                        ai_analytics_definitions: definitionsJson({ cold: 60 }),
                    }),
                }),
            },
            portalAiSettings: {
                findFirst: jest.fn().mockResolvedValue({ minDurationSec: 90 }),
            },
        };

        const rows = await loadAuditThresholdRows(prisma as never, DOMAIN);

        expect(prisma.portalAppSettings.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { domain: DOMAIN, appCode: EnumPortalAppCode.kpiSales },
            }),
        );
        expect(prisma.portalAiSettings.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { domain: DOMAIN } }),
        );
        expect(rows).toEqual({
            kpiSalesSettings: {
                ai_analytics_definitions: definitionsJson({ cold: 60 }),
            },
            pipelineMinDurationSec: 90,
        });
        // Явная карта портала старше скаляра: 60, а не 90.
        expect(auditShortCallSecOf(rows)).toBe(60);
    });

    it('loadAuditThresholdRows без строк — нули, а не исключение', async () => {
        const prisma = {
            portalAppSettings: { findFirst: jest.fn().mockResolvedValue(null) },
            portalAiSettings: { findFirst: jest.fn().mockResolvedValue(null) },
        };

        await expect(
            loadAuditThresholdRows(prisma as never, DOMAIN),
        ).resolves.toEqual({
            kpiSalesSettings: null,
            pipelineMinDurationSec: null,
        });
    });
});
