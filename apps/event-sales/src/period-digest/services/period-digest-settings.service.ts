import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    attentionThresholdsOf,
    minDurationByTypeOfSettings,
    parseAiDefinitions,
    parseAiModelParams,
    parseAiTargets,
    parseWorkCalendar,
} from '@lib/sales-ai-analytics';
import { periodDigestOptionsOf } from '../lib/period-digest-options';
import type {
    PeriodDigestOptions,
    PeriodDigestPortalAnalytics,
} from '../types/period-digest.types';

/**
 * Настройки итогов периода портала: свои (`period_digest_*` в event-sales)
 * → параметры прогона и настройки AI-аналитики портала (kpiSales) →
 * календарь, пороги «Внимания» и пороги длительности — те же, что у
 * витрины, иначе карточка разошлась бы с ней.
 *
 * Отдельный сервис: читателей двое (крон и ручной подсчёт), правила должны
 * быть одни. `@Injectable` без Битрикса.
 */
@Injectable()
export class PeriodDigestSettingsService {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    /** Порталы, где итоги периода включены. */
    async enabledDomains(): Promise<string[]> {
        const rows = await this.appSettings.listByAppCode(
            EnumPortalAppCode.eventSales,
        );
        const enabledKey =
            PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                .periodDigestEnabled.code;
        return rows
            .filter(row => row.settings[enabledKey] === true)
            .map(row => row.domain);
    }

    async resolveOptions(
        domain: string,
        overrides: { readonly countOnly?: boolean },
    ): Promise<PeriodDigestOptions> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        return periodDigestOptionsOf(settings, overrides);
    }

    /** Календарь, пороги «Внимания» и пороги длительности AI-аналитики портала. */
    async resolveAnalytics(
        domain: string,
    ): Promise<PeriodDigestPortalAnalytics> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        return {
            calendar: parseWorkCalendar(settings.aiAnalyticsCalendar),
            thresholds: attentionThresholdsOf({
                modelParams: parseAiModelParams(
                    settings.aiAnalyticsModelParams,
                ),
                definitions: parseAiDefinitions(
                    settings.aiAnalyticsDefinitions,
                ),
                targets: parseAiTargets(settings.aiAnalyticsTargets),
            }),
            minDurationByType: minDurationByTypeOfSettings(settings),
        };
    }
}
