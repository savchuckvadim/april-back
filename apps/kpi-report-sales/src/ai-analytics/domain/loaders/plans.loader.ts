import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PBXService } from '@/modules/pbx';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    PlanIndicatorCode,
    PlanIndicatorSetting,
    PlansConfigService,
    PlanTargetsService,
    PlanUserTargetsDto,
} from '../../../plans';
import { buildReportUsersKey } from '../../../report';
import {
    AI_ANALYTICS_PLANS_TTL_SECONDS,
    buildPlansKey,
} from './loader-cache-key.util';
import { ManagersLoader } from './managers.loader';
import type {
    AiPlanManagerTargets,
    AiPlansLoadOptions,
    AiPlansResult,
} from './plans.types';

/** Пустые цели по всему каталогу показателей. */
function emptyTargets(): Record<PlanIndicatorCode, number | null> {
    return Object.fromEntries(
        PLAN_INDICATORS.map(indicator => [indicator.code, null]),
    ) as Record<PlanIndicatorCode, number | null>;
}

/**
 * PlanUserTargetsDto → строка витрины: каталог целиком + три ключевые
 * цели; конфиг портала (если прочитан) прикладывается к строке.
 */
export function toManagerTargets(
    managerId: number,
    dto: PlanUserTargetsDto | undefined,
    config?: readonly PlanIndicatorSetting[] | null,
): AiPlanManagerTargets {
    const targets = emptyTargets();
    for (const value of dto?.values ?? []) {
        targets[value.code] = value.value;
    }
    return {
        managerId,
        sales: targets[PLAN_INDICATOR_CODES.sales_count],
        calls: targets[PLAN_INDICATOR_CODES.calls_done],
        presentations: targets[PLAN_INDICATOR_CODES.presentations_done],
        targets,
        ...(config ? { config } : {}),
    };
}

/** Запись кэша в текущей форме (с конфигом портала), а не старая. */
function hasPortalConfig(cached: AiPlansResult): boolean {
    return Array.isArray(cached.config);
}

/**
 * Загрузчик планов руководителя (план, Фаза 1b п. 3): одно user.get по
 * ростеру через PlanTargetsService (non-injectable, `new Svc(bitrix)` после
 * pbx.init) и конфиг планов портала (PlansConfigService поверх глобальной
 * prisma — модуль планов несёт контроллер, импортировать его нельзя), кэш
 * `plans` на 1 час. Источник вспомогательный, поэтому fail-open: ошибка
 * Bitrix → пустые цели с ok=false, ошибка конфига → config = null (план на
 * период в строке не строится); такой результат не кэшируется.
 */
@Injectable()
export class PlansLoader {
    private readonly logger = new Logger(PlansLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly managers: ManagersLoader,
        private readonly prisma: PrismaService,
    ) {}

    async loadPlans(
        domain: string,
        managerIds?: readonly (string | number)[],
        options: AiPlansLoadOptions = {},
    ): Promise<AiPlansResult> {
        const ids = await this.managers.resolve(domain, managerIds);
        const key = buildPlansKey(domain, buildReportUsersKey(ids));

        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<AiPlansResult>(key);
        if (cached && hasPortalConfig(cached)) {
            return { ...cached, fromCache: true };
        }

        const config = await this.loadConfig(domain);
        try {
            const { bitrix } = await this.pbx.init(domain);
            const rows = await new PlanTargetsService(bitrix).getTargets(ids);
            const byId = new Map(rows.map(row => [row.userId, row]));
            const result: AiPlansResult = {
                managerIds: ids,
                fromCache: false,
                ok: true,
                error: null,
                config,
                managers: ids.map(id =>
                    toManagerTargets(id, byId.get(id), config),
                ),
            };
            if (config !== null) await this.store(key, result);
            return result;
        } catch (error) {
            const message = (error as Error).message;
            this.logger.warn(
                `Планы руководителя не прочитаны (${domain}): ${message}`,
            );
            return {
                managerIds: ids,
                fromCache: false,
                ok: false,
                error: message,
                config,
                managers: ids.map(id =>
                    toManagerTargets(id, undefined, config),
                ),
            };
        }
    }

    /** Конфиг планов портала по каталогу; ошибка — null (fail-open). */
    private async loadConfig(
        domain: string,
    ): Promise<PlanIndicatorSetting[] | null> {
        try {
            const config = await new PlansConfigService(this.prisma).getConfig(
                domain,
            );
            return config.indicators.map(indicator => ({
                code: indicator.code,
                enabled: indicator.enabled,
                customName: indicator.customName,
                periodType: indicator.periodType,
            }));
        } catch (error) {
            this.logger.warn(
                `Конфиг планов портала не прочитан (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    private async store(key: string, value: AiPlansResult): Promise<void> {
        try {
            await this.cache.setJson(
                key,
                value,
                AI_ANALYTICS_PLANS_TTL_SECONDS,
            );
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}
