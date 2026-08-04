import { Injectable, Logger } from '@nestjs/common';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { PortalAiSettingsRecord } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';

/**
 * Дефолты кода — действуют, пока настройка не задана на портале.
 * Env-слоя БОЛЬШЕ НЕТ (решение владельца 2026-08-04): весь конвейер
 * управляется из админки (portal_ai_settings), деплой для смены настроек
 * не нужен. Единственный «выключатель» — enabled портала в БД.
 */
const DEFAULTS = {
    /** Портал обрабатывается только при ЯВНОМ включении в админке. */
    enabled: false,
    deepAnalysisEnabled: true,
    createSmartEnabled: true,
    classifyEnabled: true,
    salesOnly: true,
    minDurationSec: 300,
    windowHours: 25,
    maxPerRun: 10,
    staleMinutes: 90,
    llmModel: 'gigachat',
    /** Порог гейта нерелевантности (см. CallReportPipelineUseCase). */
    irrelevantConfidence: 0.7,
    /** Ночной ревизор удваивает LLM-расход — включается сознательно. */
    revisorEnabled: false,
} as const;

/**
 * Эффективные настройки конвейера для конкретного портала: ни одного null
 * в обязательных полях, всё готово к использованию.
 */
export interface EffectiveCallReportSettings {
    /** Обрабатывать ли звонки портала (false, пока админ не включил). */
    enabled: boolean;
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
    /** Порог гейта нерелевантности 0..1. */
    irrelevantConfidence: number;
    /** Ночной ревизор (свод по сущностям). */
    revisorEnabled: boolean;
    /** Откуда взялись значения — для диагностики в логах. */
    source: 'portal' | 'default';
}

/**
 * Склейка настроек конвейера: **портал → дефолт кода** (без env).
 *
 * Настройки портала опциональны: незаданное поле работает на дефолте кода.
 * Недоступность БД не роняет конвейер — но без строки настроек портал
 * просто не обрабатывается (enabled=false по умолчанию).
 */
@Injectable()
export class CallReportSettingsService {
    private readonly logger = new Logger(CallReportSettingsService.name);

    constructor(private readonly portalAiSettings: PortalAiSettingsService) {}

    /** Эффективные настройки домена. Недоступность БД не роняет конвейер. */
    async resolve(domain: string): Promise<EffectiveCallReportSettings> {
        const portal = await this.portalAiSettings
            .getByDomain(domain)
            .catch((error: Error) => {
                this.logger.warn(
                    `Настройки портала ${domain} не прочитаны (${error.message}) — работаю на дефолтах`,
                );
                return null;
            });
        return this.merge(portal);
    }

    /** Дефолты кода без обращения к БД — для глобальных процедур и логов. */
    globals(): EffectiveCallReportSettings {
        return this.merge(null);
    }

    private merge(
        portal: PortalAiSettingsRecord | null,
    ): EffectiveCallReportSettings {
        return {
            enabled: portal?.enabled ?? DEFAULTS.enabled,
            deepAnalysisEnabled:
                portal?.deepAnalysisEnabled ?? DEFAULTS.deepAnalysisEnabled,
            createSmartEnabled:
                portal?.createSmartEnabled ?? DEFAULTS.createSmartEnabled,
            classifyEnabled:
                portal?.classifyEnabled ?? DEFAULTS.classifyEnabled,
            salesOnly: portal?.salesOnly ?? DEFAULTS.salesOnly,
            minDurationSec: portal?.minDurationSec ?? DEFAULTS.minDurationSec,
            windowHours: portal?.windowHours ?? DEFAULTS.windowHours,
            maxPerRun: portal?.maxPerRun ?? DEFAULTS.maxPerRun,
            staleMinutes: portal?.staleMinutes ?? DEFAULTS.staleMinutes,
            llmModel: portal?.llmModel ?? DEFAULTS.llmModel,
            deepAnalysisModel: portal?.deepAnalysisModel ?? null,
            scanIntervalMinutes: portal?.scanIntervalMinutes ?? null,
            nightScanIntervalMinutes: portal?.nightScanIntervalMinutes ?? null,
            nightStartHour: portal?.nightStartHour ?? null,
            nightEndHour: portal?.nightEndHour ?? null,
            lastScanAt: portal?.lastScanAt ?? null,
            allowedUserIds: portal?.allowedUserIds ?? null,
            irrelevantConfidence:
                portal?.irrelevantConfidence ?? DEFAULTS.irrelevantConfidence,
            revisorEnabled: portal?.revisorEnabled ?? DEFAULTS.revisorEnabled,
            source: portal ? 'portal' : 'default',
        };
    }
}
