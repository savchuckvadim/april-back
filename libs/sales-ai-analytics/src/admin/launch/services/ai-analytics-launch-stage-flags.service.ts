/**
 * Кнопка «Показать прогноз в отчёте»: безопасный мёрж флагов ступеней
 * (`forecast_stage_enabled`, `recommendations_stage_enabled`) в JSON
 * `ai_analytics_model_params` портала. Читается текущее значение прямо из
 * БД (без кэша настроек), меняются только эти два ключа, сохраняется тем
 * же `PortalAppSettingsService.save`, что и форма настроек админки (кэш
 * настроек домена сбрасывается там же).
 *
 * Гейт: прогноз включается только при статусе pass последней проверки
 * точности (снапшот forecast-backtest); иначе 409 с причинами словами.
 * `force: true` — обход для разработчика. Битый JSON — 400, ничего не
 * перезаписывается.
 *
 * После смены флага сбрасывается кэш витрины портала: настройки и
 * готовность ступеней kpi-report-sales держит в кэше до 5 минут, обзор —
 * дольше. Сбой сброса не отменяет сохранённое — текст подскажет нажать
 * «Сбросить кэш витрины AI».
 */
import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { AI_SETTINGS_KEYS } from '../../../settings/ai-settings.types';
import { AiAnalyticsPhase4StatusService } from '../../services/ai-analytics-phase4-status.service';
import {
    mergeStageFlags,
    parseModelParamsJson,
    stageFlagOf,
    type StageFlagsPatch,
} from '../launch-model-params';
import { forecastVerdictText } from '../launch-status.forecast-blocks';
import {
    LAUNCH_FORECAST_LINK,
    LAUNCH_STAGE_FLAG_PARAMS,
} from '../launch.const';
import { AiAnalyticsLaunchCacheService } from './ai-analytics-launch-cache.service';

export interface LaunchStageFlagsInput extends StageFlagsPatch {
    domain: string;
    /** Включить прогноз без pass проверки точности (только разработчик). */
    force?: boolean;
}

/** Ответ `POST admin/ai-analytics/stage-flags`. */
export interface LaunchStageFlagsResult {
    domain: string;
    forecastStageEnabled: boolean;
    recommendationsStageEnabled: boolean;
    /** Коды флагов, чьё значение поменялось этим вызовом. */
    changed: string[];
    /** Прогноз включён в обход проверки точности. */
    forced: boolean;
    /** Где смотреть прогноз (страница админки). */
    forecastUrl: string;
    message: string;
}

export const STAGE_FLAGS_MESSAGES = {
    noFlags:
        'Не задано, что включить: передайте forecast и/или recommendations.',
    portalNotFound: (domain: string): string =>
        `Портал ${domain} не найден в базе админки — настройки сохранить некуда.`,
    gate: (verdict: string): string =>
        `${verdict} Показ прогноза не включён. Включить без проверки может только разработчик (принудительно, force).`,
    cacheNotReset:
        ' Кэш витрины сбросить не удалось — нажмите «Сбросить кэш витрины AI», иначе отчёт увидит изменение через несколько минут.',
} as const;

@Injectable()
export class AiAnalyticsLaunchStageFlagsService {
    private readonly logger = new Logger(
        AiAnalyticsLaunchStageFlagsService.name,
    );

    constructor(
        private readonly portals: PortalStoreService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly phase4: AiAnalyticsPhase4StatusService,
        private readonly cache: AiAnalyticsLaunchCacheService,
    ) {}

    async apply(input: LaunchStageFlagsInput): Promise<LaunchStageFlagsResult> {
        if (
            input.forecast === undefined &&
            input.recommendations === undefined
        ) {
            throw new BadRequestException(STAGE_FLAGS_MESSAGES.noFlags);
        }
        const portalId = await this.requirePortalId(input.domain);
        const parsed = parseModelParamsJson(
            await this.storedModelParams(portalId),
        );
        if (!parsed.ok) throw new BadRequestException(parsed.error);

        const forced = input.forecast === true && input.force === true;
        if (input.forecast === true && !forced) {
            await this.assertForecastGate(input.domain);
        }

        const { merged, changed } = mergeStageFlags(parsed.value, input);
        let cacheNote = '';
        if (changed.length > 0) {
            await this.appSettings.save(portalId, EnumPortalAppCode.kpiSales, {
                aiAnalyticsModelParams: JSON.stringify(merged),
            });
            this.logger.log(
                `Флаги ступеней ${input.domain}: ${changed.join(', ')}${forced ? ' (принудительно)' : ''}`,
            );
            cacheNote = await this.resetShowcaseCache(input.domain);
        }
        const forecastStageEnabled = stageFlagOf(
            merged,
            LAUNCH_STAGE_FLAG_PARAMS.forecast,
        );
        return {
            domain: input.domain,
            forecastStageEnabled,
            recommendationsStageEnabled: stageFlagOf(
                merged,
                LAUNCH_STAGE_FLAG_PARAMS.recommendations,
            ),
            changed,
            forced,
            forecastUrl: LAUNCH_FORECAST_LINK.href,
            message: `${resultMessage(forecastStageEnabled, changed, forced)}${cacheNote}`,
        };
    }

    /** Сброс кэша витрины после смены флага; сбой — подсказка, а не ошибка. */
    private async resetShowcaseCache(domain: string): Promise<string> {
        try {
            await this.cache.reset(domain, 'all');
            return '';
        } catch (error) {
            this.logger.warn(
                `Кэш витрины ${domain} после смены флагов не сброшен: ${(error as Error).message}`,
            );
            return STAGE_FLAGS_MESSAGES.cacheNotReset;
        }
    }

    /** id портала в нашей БД по домену; нет — 404. */
    private async requirePortalId(domain: string): Promise<number> {
        const portal = await this.portals.getPortalByDomain(domain);
        const portalId = Number(portal?.id);
        if (!portal || !Number.isInteger(portalId) || portalId <= 0) {
            throw new NotFoundException(
                STAGE_FLAGS_MESSAGES.portalNotFound(domain),
            );
        }
        return portalId;
    }

    /** Сырое значение JSON модели из БД (не из кэша): undefined — не задано. */
    private async storedModelParams(portalId: number): Promise<unknown> {
        const rows = await this.appSettings.listByPortal(portalId);
        const row = rows.find(
            item => item.appCode === EnumPortalAppCode.kpiSales,
        );
        return row?.settings[AI_SETTINGS_KEYS.modelParams];
    }

    private async assertForecastGate(domain: string): Promise<void> {
        const { items } = await this.phase4.forecastBacktest(domain, 1);
        const latest = items[0] ?? null;
        if (latest?.status === 'pass') return;
        throw new ConflictException(
            STAGE_FLAGS_MESSAGES.gate(forecastVerdictText(latest)),
        );
    }
}

function resultMessage(
    forecastEnabled: boolean,
    changed: readonly string[],
    forced: boolean,
): string {
    const state = forecastEnabled
        ? `Прогноз показывается в отчёте${forced ? ' (включён принудительно, без пройденной проверки)' : ''}.`
        : 'Прогноз в отчёте скрыт.';
    const what =
        changed.length === 0
            ? ' Значения уже были такими — ничего не меняли.'
            : '';
    return `${state}${what} ${LAUNCH_FORECAST_LINK.text}`;
}
