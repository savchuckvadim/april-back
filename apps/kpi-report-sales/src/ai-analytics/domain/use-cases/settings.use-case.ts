import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_EVENT_KINDS,
    CALL_REPORT_CALL_TYPE_CODES,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AI_ANALYTICS_WINDOWS } from '../../constants/ai-analytics.const';
import {
    AiAnalyticsSettingsDto,
    AiCallTypeDto,
} from '../../dto/ai-settings.dto';
import { CallsLoader } from '../loaders/calls.loader';
import { SettingsLoader } from '../loaders/settings.loader';
import {
    buildReadiness,
    resolveComparableFrom,
} from '../presenter/readiness.util';

const DAY_MS = 86_400_000;

/** Подвкладки витрины из карты алфавитов (порядок — как в справочнике типов). */
export function buildCallTypes(): AiCallTypeDto[] {
    return CALL_REPORT_CALL_TYPE_CODES.map(code => {
        const kind = AI_ANALYTICS_EVENT_KINDS[code];
        return {
            code,
            title: kind.title,
            tone: kind.tone,
            bucket: kind.bucket,
            kpiPrimaryEventTypeCode: kind.kpiPrimaryEventTypeCode,
        };
    });
}

export interface SettingsUseCaseOptions {
    now?: Date;
}

/**
 * Настройки витрины + готовность (план, 6.2): флаги портала, pipelineEnabled
 * (есть ли разборы за 30 дней), readiness по окну 120 дней, типы звонков из
 * карты алфавитов, comparableFrom по версиям разборов, РОПы.
 * Одна lite-выборка на оба окна. Кэшируется контроллером на 300 с.
 */
@Injectable()
export class SettingsUseCase {
    constructor(
        private readonly calls: CallsLoader,
        private readonly settings: SettingsLoader,
    ) {}

    async execute(
        domain: string,
        options: SettingsUseCaseOptions = {},
    ): Promise<AiAnalyticsSettingsDto> {
        const now = options.now ?? new Date();
        const settings = await this.settings.load(domain);
        const rows = await this.calls.loadLite(
            domain,
            new Date(
                now.getTime() -
                    AI_ANALYTICS_WINDOWS.readinessLookbackDays * DAY_MS,
            ),
            now,
        );
        const pipelineFrom =
            now.getTime() - AI_ANALYTICS_WINDOWS.pipelineLookbackDays * DAY_MS;
        const pipelineEnabled = rows.some(
            row =>
                row.analysisPresent &&
                row.callStartedAt.getTime() >= pipelineFrom,
        );

        return {
            enabled: settings.enabled,
            pipelineEnabled,
            auditEnabled: settings.auditEnabled,
            alertsEnabled: settings.alertsEnabled,
            digestEnabled: settings.digestEnabled,
            readiness: buildReadiness(rows, {
                now,
                enabled: settings.enabled,
                pipelineEnabled,
            }),
            callTypes: buildCallTypes(),
            comparableFrom: resolveComparableFrom(rows),
            ropUserIds: settings.ropUserIds,
            selfViewEnabled: settings.selfViewEnabled,
            dailyPlanEnabled: settings.dailyPlanEnabled,
            digestAllUserIds: settings.digestAllUserIds.map(String),
            poolOptIn: settings.poolOptIn,
            poolConsentAt: settings.poolConsentAt,
            experimentsEnabled: settings.experimentsEnabled,
        };
    }
}
