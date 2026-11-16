import { Inject, Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    readinessStageFlagsOf,
    readinessStageGatesOf,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsReadinessMode } from '../../constants/ai-analytics.const';
import { AiForecastDto } from '../../dto/ai-forecast.dto';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { latestPortalByPeriod } from '../../store/snapshot-latest-period.util';
import {
    lastForecastLogDay,
    readForecastBacktest,
} from '../assembler/forecast-snapshots.reader';
import { AiAnalyticsParamsLoader } from '../loaders/params.loader';
import { SettingsLoader } from '../loaders/settings.loader';
import {
    departmentMonthSales,
    fallbackForecast,
    fallbackMonthKeys,
    type ForecastFallback,
} from '../presenter/forecast-fallback.util';
import { presentForecast } from '../presenter/forecast.presenter';
import {
    AI_READINESS_MODE_SOURCE,
    type ReadinessModeSource,
} from './readiness-mode.source';

/** Длина ключа месяца 'YYYY-MM' в дате 'YYYY-MM-DD'. */
const MONTH_KEY_LENGTH = 7;

/**
 * Прогноз отдела на текущий месяц (Фаза 4, план §4.8, §10 L4; поток B3):
 * два чтения `ais` — журнал прогноза отдела за текущий месяц (ключ месяца
 * в TZ портала, портальная запись) и последняя проверка точности — плюс
 * флаг ступени `forecast_stage_enabled` и порог теневых месяцев из
 * реестра портала, плюс итоговый режим готовности портала из кэша
 * `settings/get` (тот же, что в баннере: вилка не показывается, когда
 * баннер пишет «описательный режим»). Решение «показывать ли вилку» — в
 * презентере.
 *
 * Синхронно и без своего кэша: оба снапшота пишет конвейер, Битрикс не
 * вызывается. Права (только руководителям) проверяет контроллер.
 * @Injectable без bitrix-состояния: портал приходит параметром domain.
 */
@Injectable()
export class ForecastUseCase {
    private readonly logger = new Logger(ForecastUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly params: AiAnalyticsParamsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        @Inject(AI_READINESS_MODE_SOURCE)
        private readonly readiness: ReadinessModeSource,
    ) {}

    async execute(
        domain: string,
        now: Date = new Date(),
    ): Promise<AiForecastDto> {
        const [{ calendar }, { ctx }] = await Promise.all([
            this.settings.load(domain),
            this.params.load(domain),
        ]);
        const today = toPortalDate(now, calendar.timeZone);
        const monthKey = today.slice(0, MONTH_KEY_LENGTH);
        const [logs, backtest] = await Promise.all([
            this.snapshots.findByKeys(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                {
                    periodKeys: [monthKey],
                    managerIds: [null],
                    latestOnly: true,
                },
            ),
            // Самый поздний месяц проверки, а не последняя записанная:
            // догон с forceRefresh переписывает старые месяцы позже.
            latestPortalByPeriod(
                this.snapshots,
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
            ),
        ]);
        const log = logs[logs.length - 1] ?? null;
        const day = log ? lastForecastLogDay(log.payload) : null;
        const readinessMode = await this.readinessModeOf(domain);

        return presentForecast({
            monthKey,
            day,
            fallback:
                day === null ? await this.fallbackOf(domain, today) : null,
            backtest: backtest
                ? readForecastBacktest(backtest.periodKey, backtest.payload)
                : null,
            // Флаг и порог — теми же функциями, что у готовности Фазы 4.
            stageEnabled: readinessStageFlagsOf(ctx).forecast,
            shadowMinMonths: readinessStageGatesOf(ctx).forecastShadowMonths,
            readinessMode,
        });
    }

    /**
     * Простой расчёт по месячным снимкам менеджеров — когда журнала дня
     * нет. Снимки не прочитались — null: карточка покажет, что цифры
     * появятся после ночного расчёта.
     */
    private async fallbackOf(
        domain: string,
        today: string,
    ): Promise<ForecastFallback | null> {
        try {
            const months = await this.snapshots.findByKeys(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                { periodKeys: fallbackMonthKeys(today), latestOnly: true },
            );
            return fallbackForecast(today, departmentMonthSales(months));
        } catch (error) {
            this.logger.warn(
                `Простой расчёт прогноза не собран (${domain}): ${String(error)}`,
            );
            return null;
        }
    }

    /**
     * Режим готовности портала; не прочитался — null: ручка прогноза не
     * падает из-за готовности, решает гейт прогноза (как до проверки базы).
     */
    private async readinessModeOf(
        domain: string,
    ): Promise<AiAnalyticsReadinessMode | null> {
        try {
            return await this.readiness.readinessMode(domain);
        } catch (error) {
            this.logger.warn(
                `Готовность для прогноза не прочитана (${domain}): ${String(error)}`,
            );
            return null;
        }
    }
}
