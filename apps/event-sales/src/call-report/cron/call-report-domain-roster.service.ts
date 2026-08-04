import { Injectable, Logger } from '@nestjs/common';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';

/** Домен в обходе планировщиков call-report. */
export interface CallReportDomainEntry {
    domain: string;
    /** id портала — по нему планировщик отмечает lastScanAt. */
    portalId: number;
}

/**
 * Список доменов для планировщиков конвейера (скан + ночной ревизор):
 * ТОЛЬКО порталы с enabled=true в portal_ai_settings. Включение портала —
 * из админки (карточка портала → вкладка AI), без деплоя.
 *
 * Env-списка CALL_REPORT_DOMAINS больше нет (решение владельца
 * 2026-08-04): вся конфигурация конвейера живёт в БД.
 */
@Injectable()
export class CallReportDomainRosterService {
    private readonly logger = new Logger(CallReportDomainRosterService.name);

    constructor(private readonly portalAiSettings: PortalAiSettingsService) {}

    /** Включённые порталы; недоступность БД → пустой список (тик — no-op). */
    async resolve(): Promise<CallReportDomainEntry[]> {
        try {
            const portals = await this.portalAiSettings.findEnabled();
            return portals.map(portal => ({
                domain: portal.domain,
                portalId: portal.portalId,
            }));
        } catch (error) {
            this.logger.error(
                `Порталы из portal_ai_settings не прочитаны: ${(error as Error).message} — тик пропущен`,
                { telegram: true },
            );
            return [];
        }
    }
}
