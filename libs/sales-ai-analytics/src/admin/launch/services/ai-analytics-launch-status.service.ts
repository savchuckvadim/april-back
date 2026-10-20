/**
 * Сводка «Запуск AI после выкладки» для панели админки одним ответом:
 * настройки, смарт, журнал прогонов, прогноз, переразбор, расход модели.
 *
 * Сервис только читает — каждое чтение отдельно и fail-open (упало одно —
 * его блок станет unknown, остальные соберутся); тексты и состояния
 * собирает чистая функция `buildLaunchStatus`. Чтения параллельны и
 * дешёвые: снапшоты ais по домену, строки настроек, резолв смарта через
 * PortalModel (кэш портала) с запасным зеркалом в БД.
 */
import { Injectable } from '@nestjs/common';
import { TranscriptionStoreService } from '@lib/call-lib';
import { PbxAicallSmartService } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { toPortalDate } from '../../../model/workdays.util';
import { AiAnalyticsCostService } from '../../services/ai-analytics-cost.service';
import { AiAnalyticsEtlStatusService } from '../../services/ai-analytics-etl-status.service';
import { AiAnalyticsPhase4StatusService } from '../../services/ai-analytics-phase4-status.service';
import { AiAnalyticsReanalyzeService } from '../../services/ai-analytics-reanalyze.service';
import { buildLaunchStatus } from '../launch-status.builder';
import { LAUNCH_DEFAULTS } from '../launch.const';
import type {
    LaunchKpiSettings,
    LaunchLoaded,
    LaunchPortalAiSettings,
    LaunchStatus,
} from '../launch.types';

/** Чтение без падения: ошибка превращается в текст для блока. */
async function load<T>(read: () => Promise<T>): Promise<LaunchLoaded<T>> {
    try {
        return { ok: true, value: await read() };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

@Injectable()
export class AiAnalyticsLaunchStatusService {
    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly aicallSmart: PbxAicallSmartService,
        private readonly etlStatus: AiAnalyticsEtlStatusService,
        private readonly phase4: AiAnalyticsPhase4StatusService,
        private readonly reanalyze: AiAnalyticsReanalyzeService,
        private readonly transcriptions: TranscriptionStoreService,
        private readonly cost: AiAnalyticsCostService,
    ) {}

    async status(
        domain: string,
        now: Date = new Date(),
    ): Promise<LaunchStatus> {
        const timeZone = LAUNCH_DEFAULTS.timeZone;
        const costMonth = toPortalDate(now, timeZone).slice(0, 7);
        const [
            settings,
            portalAi,
            smart,
            etlRuns,
            backtest,
            reanalysis,
            analysisSince,
            cost,
        ] = await Promise.all([
            load(() => this.kpiSettings(domain)),
            load(() => this.portalAi(domain)),
            load(() => this.aicallSmart.resolveInfo(domain)),
            load(async () => {
                const result = await this.etlStatus.status(
                    domain,
                    LAUNCH_DEFAULTS.etlWindowDays,
                    now,
                );
                return result.runs;
            }),
            load(async () => {
                const result = await this.phase4.forecastBacktest(
                    domain,
                    1,
                    now,
                );
                return result.items[0] ?? null;
            }),
            load(() => this.reanalyze.latest(domain)),
            load(async () => {
                const first = await this.transcriptions.findFirstDoneAt(domain);
                return first === null ? null : toPortalDate(first, timeZone);
            }),
            load(() => this.cost.summary(domain, costMonth)),
        ]);
        return buildLaunchStatus({
            domain,
            now,
            costMonth,
            settings,
            portalAi,
            smart,
            etlRuns,
            backtest,
            reanalysis,
            analysisSince,
            cost,
        });
    }

    private async kpiSettings(domain: string): Promise<LaunchKpiSettings> {
        const values = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        return {
            aiAnalyticsEnabled: values.aiAnalyticsEnabled === true,
            modelParamsJson: values.aiAnalyticsModelParams ?? '',
        };
    }

    private async portalAi(
        domain: string,
    ): Promise<LaunchPortalAiSettings | null> {
        const record = await this.portalAiSettings.getByDomain(domain);
        if (record === null) return null;
        return {
            enabled: record.enabled,
            allowedUserIds: record.allowedUserIds,
        };
    }
}
