import { Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

/**
 * Ростер порталов AI-аналитики для кронов (push-рассылки, месячный аудит):
 * домены со строкой настроек kpiSales. Флаги (ai_analytics_enabled и т.п.)
 * по умолчанию false — без строки портал выключен, поэтому обходить
 * остальные порталы бессмысленно. Ошибка чтения — лог + пустой список:
 * тик крона не падает.
 */
@Injectable()
export class AiAnalyticsPortalsLoader {
    private readonly logger = new Logger(AiAnalyticsPortalsLoader.name);

    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async listDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.kpiSales,
            );
            return [...new Set(rows.map(row => row.domain))];
        } catch (error) {
            this.logger.error(
                `Порталы AI-аналитики не прочитаны: ${(error as Error).message}`,
                { telegram: true },
            );
            return [];
        }
    }
}
