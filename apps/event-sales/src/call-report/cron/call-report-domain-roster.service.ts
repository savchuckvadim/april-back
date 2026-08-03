import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';

/** Домен в обходе планировщиков call-report. */
export interface CallReportDomainEntry {
    domain: string;
    /**
     * id портала в БД — есть только у доменов, пришедших из настроек
     * portal_ai_settings; по нему планировщик отмечает lastScanAt.
     */
    portalId?: number;
    /** ДЕМО из env-суффикса `domain:222|323` (bitrix-id сотрудников). */
    demoUserIds?: number[];
}

/**
 * Единый список доменов для планировщиков конвейера (скан + ночной ревизор):
 * env CALL_REPORT_DOMAINS (пилоты/аварийный fallback) ∪ порталы с
 * enabled=true в portal_ai_settings (штатный путь — включение из админки).
 *
 * БД недоступна — работаем только по env (fail-open): деградация до
 * поведения «до таблицы настроек», а не остановка конвейера.
 */
@Injectable()
export class CallReportDomainRosterService {
    private readonly logger = new Logger(CallReportDomainRosterService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {}

    /** Объединённый список; домен из env обогащается portalId из БД. */
    async resolve(): Promise<CallReportDomainEntry[]> {
        const roster = new Map<string, CallReportDomainEntry>(
            this.fromEnv().map(entry => [entry.domain, entry]),
        );
        try {
            for (const portal of await this.portalAiSettings.findEnabled()) {
                const existing = roster.get(portal.domain);
                roster.set(portal.domain, {
                    ...existing,
                    domain: portal.domain,
                    portalId: portal.portalId,
                });
            }
        } catch (error) {
            this.logger.warn(
                `Порталы из portal_ai_settings не прочитаны (${(error as Error).message}) — обхожу только env-домены`,
            );
        }
        return [...roster.values()];
    }

    /**
     * Парсит CALL_REPORT_DOMAINS. Формат записи (через запятую):
     * `domain` — полный режим (весь отдел продаж);
     * `domain:222|323` — ДЕМО: анализировать только этих сотрудников
     * (bitrix-id, через |), поверх фильтра ОП.
     */
    fromEnv(): CallReportDomainEntry[] {
        const raw = this.configService.get<string>('CALL_REPORT_DOMAINS') ?? '';
        return raw
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean)
            .map(entry => {
                const [domain, users] = entry.split(':');
                const demoUserIds = users
                    ?.split('|')
                    .map(id => Number(id.trim()))
                    .filter(id => Number.isFinite(id) && id > 0);
                return {
                    domain: domain.trim(),
                    demoUserIds: demoUserIds?.length ? demoUserIds : undefined,
                };
            })
            .filter(entry => Boolean(entry.domain));
    }
}
