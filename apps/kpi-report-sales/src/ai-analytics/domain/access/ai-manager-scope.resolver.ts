import { Injectable, Logger } from '@nestjs/common';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildManagerScopeKey } from '../../cache/cache-key.util';
import { AI_ANALYTICS_MANAGERS_TTL_SECONDS } from '../loaders/loader-cache-key.util';
import {
    ManagersLoader,
    normalizeManagerIds,
} from '../loaders/managers.loader';
import {
    type AiCallReportStatus,
    SettingsLoader,
} from '../loaders/settings.loader';
import {
    activePilotIds,
    type AiManagerScope,
    resolveManagerScope,
} from './ai-manager-scope.util';

/** Фильтр отчёта: Bitrix-id строками или числами; пусто — фильтра нет. */
export type AiManagerScopeRequest = readonly (string | number)[] | undefined;

/**
 * Единственное место пересечения «фильтр отчёта ∩ список разбора» для
 * вкладки AI: обзор (ключ, джоба, итоги), срезы by-type, итоги периода,
 * план-факт и сводный дайджест берут строки отсюда. Список разбора
 * читается из настроек (SettingsLoader.callReport), ростер ОП — только
 * когда нет ни фильтра, ни действующего списка.
 *
 * Периметр requester'а сюда не входит: он накладывается при отдаче
 * (applyOverviewPerimeter и др.), чтобы кэш обзора оставался общим на
 * домен. Прогноз отдела, ночной конвейер, пульс и повестка резолвер не
 * используют: деньги отдела делают все, а конвейеру нужен полный ростер.
 *
 * Периметр без фильтра публикуется в кэш (buildManagerScopeKey, 5 минут —
 * как ростер ОП): итоги периода читают только кэш и по нему находят обзор
 * «без фильтра», не зная про список разбора.
 *
 * @Injectable без bitrix-состояния: портал приходит параметром domain.
 */
@Injectable()
export class AiManagerScopeResolver {
    private readonly logger = new Logger(AiManagerScopeResolver.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly managers: ManagersLoader,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    /** Периметр по фильтру отчёта; настройки разбора читаются здесь же. */
    async resolve(
        domain: string,
        requested?: AiManagerScopeRequest,
    ): Promise<AiManagerScope> {
        const { callReport } = await this.settings.load(domain);

        return this.resolveFor(domain, requested, callReport);
    }

    /**
     * То же по уже прочитанному статусу разбора — для вызывающих, у
     * которых настройки портала на руках (без второго чтения).
     */
    async resolveFor(
        domain: string,
        requested: AiManagerScopeRequest,
        callReport: AiCallReportStatus | undefined,
    ): Promise<AiManagerScope> {
        const explicit = normalizeManagerIds(requested ?? []);
        const pilot = activePilotIds(callReport);
        const roster =
            explicit.length > 0 || pilot !== null
                ? []
                : await this.managers.resolve(domain);
        const scope = resolveManagerScope({
            requested: explicit,
            roster,
            pilot,
        });
        if (explicit.length === 0) {
            await this.publish(domain, scope.managerIds);
        }

        return scope;
    }

    /** Периметр без фильтра — в кэш для читателей только кэша; сбой не роняет. */
    private async publish(
        domain: string,
        managerIds: readonly number[],
    ): Promise<void> {
        try {
            await this.cache.setJson(
                buildManagerScopeKey(domain),
                [...managerIds],
                AI_ANALYTICS_MANAGERS_TTL_SECONDS,
            );
        } catch (error) {
            this.logger.warn(
                `Периметр вкладки AI ${domain} не записан в кэш: ${(error as Error).message}`,
            );
        }
    }
}
