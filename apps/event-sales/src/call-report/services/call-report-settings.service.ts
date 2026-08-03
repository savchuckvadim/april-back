import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envEnabledByDefault, envInt } from '@lib/shared';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { PortalAiSettingsRecord } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';

/** Дефолты кода — последний рубеж, когда нет ни настройки портала, ни env. */
const DEFAULTS = {
    minDurationSec: 300,
    windowHours: 25,
    maxPerRun: 10,
    staleMinutes: 90,
    llmModel: 'gigachat',
} as const;

/**
 * Эффективные настройки конвейера для конкретного портала: ни одного null,
 * всё готово к использованию.
 */
export interface EffectiveCallReportSettings {
    deepAnalysisEnabled: boolean;
    createSmartEnabled: boolean;
    classifyEnabled: boolean;
    salesOnly: boolean;
    minDurationSec: number;
    windowHours: number;
    maxPerRun: number;
    staleMinutes: number;
    llmModel: string;
    /** null — глубокий разбор идёт на модели по умолчанию своего провайдера. */
    deepAnalysisModel: string | null;
    /** null — портал сканируется на каждом тике планировщика. */
    scanIntervalMinutes: number | null;
    nightScanIntervalMinutes: number | null;
    nightStartHour: number | null;
    nightEndHour: number | null;
    lastScanAt: Date | null;
    /** null — анализируется весь отдел продаж. */
    allowedUserIds: number[] | null;
    /** Откуда взялись значения — для диагностики в логах. */
    source: 'portal' | 'global';
}

/**
 * Склейка настроек конвейера: **портал → env → дефолт кода**.
 *
 * Живёт в приложении, а не в portal-lib, намеренно: имена переменных
 * CALL_REPORT_* — специфика event-sales, а библиотека хранилища должна
 * оставаться нейтральной и отдавать сырые значения с null'ами.
 *
 * Настройки портала опциональны: пока клиенту ничего не задали, он работает
 * ровно так же, как работал до появления таблицы. Это позволяет выкатывать
 * функциональность без миграции поведения.
 */
@Injectable()
export class CallReportSettingsService {
    private readonly logger = new Logger(CallReportSettingsService.name);

    constructor(
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly configService: ConfigService,
    ) {}

    /** Эффективные настройки домена. Недоступность БД не роняет конвейер. */
    async resolve(domain: string): Promise<EffectiveCallReportSettings> {
        const portal = await this.portalAiSettings
            .getByDomain(domain)
            .catch((error: Error) => {
                this.logger.warn(
                    `Настройки портала ${domain} не прочитаны (${error.message}) — работаю на глобальных`,
                );
                return null;
            });
        return this.merge(portal);
    }

    /** Глобальные настройки без обращения к БД — для диагностики при старте. */
    globals(): EffectiveCallReportSettings {
        return this.merge(null);
    }

    private merge(
        portal: PortalAiSettingsRecord | null,
    ): EffectiveCallReportSettings {
        return {
            deepAnalysisEnabled:
                portal?.deepAnalysisEnabled ??
                this.envFlag('CALL_REPORT_DEEP_ANALYSIS_ENABLED'),
            createSmartEnabled:
                portal?.createSmartEnabled ??
                this.envFlag('CALL_REPORT_CRON_CREATE_SMART'),
            classifyEnabled:
                portal?.classifyEnabled ??
                this.envFlag('CALL_REPORT_CLASSIFY_ENABLED'),
            salesOnly:
                portal?.salesOnly ?? this.envFlag('CALL_REPORT_SALES_ONLY'),
            minDurationSec:
                portal?.minDurationSec ??
                this.envNumber(
                    'CALL_REPORT_MIN_DURATION_SEC',
                    DEFAULTS.minDurationSec,
                ),
            windowHours:
                portal?.windowHours ??
                this.envNumber(
                    'CALL_REPORT_WINDOW_HOURS',
                    DEFAULTS.windowHours,
                ),
            maxPerRun:
                portal?.maxPerRun ??
                this.envNumber('CALL_REPORT_MAX_PER_RUN', DEFAULTS.maxPerRun),
            staleMinutes:
                portal?.staleMinutes ??
                this.envNumber(
                    'CALL_REPORT_STALE_MINUTES',
                    DEFAULTS.staleMinutes,
                ),
            llmModel:
                portal?.llmModel ??
                this.configService.get<string>('CALL_REPORT_LLM_MODEL') ??
                DEFAULTS.llmModel,
            // Ниже — параметры, у которых глобального аналога нет: они
            // появились вместе с таблицей и вне портала не задаются.
            deepAnalysisModel: portal?.deepAnalysisModel ?? null,
            scanIntervalMinutes: portal?.scanIntervalMinutes ?? null,
            nightScanIntervalMinutes: portal?.nightScanIntervalMinutes ?? null,
            nightStartHour: portal?.nightStartHour ?? null,
            nightEndHour: portal?.nightEndHour ?? null,
            lastScanAt: portal?.lastScanAt ?? null,
            allowedUserIds: portal?.allowedUserIds ?? null,
            source: portal ? 'portal' : 'global',
        };
    }

    /** Конвенция kill-switch'ей конвейера: включено, выключается «0». */
    private envFlag(key: string): boolean {
        return envEnabledByDefault(this.configService.get<string>(key));
    }

    private envNumber(key: string, fallback: number): number {
        return envInt(this.configService.get<string>(key), fallback, {
            min: 1,
        });
    }
}
