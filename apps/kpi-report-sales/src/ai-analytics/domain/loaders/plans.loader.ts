import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    PlanIndicatorCode,
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

/** PlanUserTargetsDto → строка витрины: каталог целиком + три ключевые цели. */
export function toManagerTargets(
    managerId: number,
    dto: PlanUserTargetsDto | undefined,
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
    };
}

/**
 * Загрузчик планов руководителя (план, Фаза 1b п. 3): одно user.get по
 * ростеру через PlanTargetsService (non-injectable, `new Svc(bitrix)` после
 * pbx.init), кэш `plans` на 1 час. Источник вспомогательный, поэтому
 * fail-open: ошибка Bitrix → пустые цели с ok=false, а не падение overview.
 * Ошибочный результат не кэшируется.
 */
@Injectable()
export class PlansLoader {
    private readonly logger = new Logger(PlansLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly managers: ManagersLoader,
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
        if (cached) return { ...cached, fromCache: true };

        try {
            const { bitrix } = await this.pbx.init(domain);
            const rows = await new PlanTargetsService(bitrix).getTargets(ids);
            const byId = new Map(rows.map(row => [row.userId, row]));
            const result: AiPlansResult = {
                managerIds: ids,
                fromCache: false,
                ok: true,
                error: null,
                managers: ids.map(id => toManagerTargets(id, byId.get(id))),
            };
            await this.store(key, result);
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
                managers: ids.map(id => toManagerTargets(id, undefined)),
            };
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
