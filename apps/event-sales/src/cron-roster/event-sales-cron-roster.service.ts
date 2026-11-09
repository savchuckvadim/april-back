import { Injectable } from '@nestjs/common';
import { CronJobsRoster, CronJobsRosterSource } from '@lib/core/schedule';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { buildEventSalesCronRoster } from './event-sales-cron-roster';

/**
 * Источник сведений о кронах event-sales для стартового отчёта: два чтения
 * БД после старта — настройки приложения по всем порталам
 * (portal_app_settings) и порталы с включённым AI-конвейером
 * (portal_ai_settings). Ошибку чтения не прячет: общий отчёт допишет её
 * строкой и покажет голый список кронов.
 */
@Injectable()
export class EventSalesCronRosterService implements CronJobsRosterSource {
    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {}

    async resolve(): Promise<CronJobsRoster> {
        const [rows, aiPortals] = await Promise.all([
            this.appSettings.listByAppCode(EnumPortalAppCode.eventSales),
            this.portalAiSettings.findEnabled(),
        ]);
        return buildEventSalesCronRoster(rows, aiPortals);
    }
}
