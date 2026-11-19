import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from '../constants/ai-analytics.const';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { UserNamesReader } from '../domain/loaders/user-names.reader';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import { CALLS_LIST_TTL_SECONDS } from './calls-list.const';
import { groupCallReviews, toCallListRows } from './calls-list-index.mapper';
import type { CallListIndex } from './calls-list.types';

/**
 * Версия формы выборки в кэше: меняется вместе с CallListIndex, чтобы
 * после выкладки не читать записи старой формы.
 */
const CALL_LIST_KEY_VERSION = 'v1';

/** Ключ выборки периода: `sales-ai-analytics:v1:{domain}:call-list:v1:{from}_{to}`. */
export function buildCallListKey(
    domain: string,
    from: string,
    to: string,
): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AI_ANALYTICS_CACHE_SECTIONS.CALL_LIST}:${CALL_LIST_KEY_VERSION}:${from}_${to}`;
}

/**
 * Выборка периода раздела «Разборы звонков»: звонки с разбором (lite-
 * выборка за дни портала), актуальные отзывы руководителей (обратная связь
 * от начала периода до «сейчас» — отзыв на звонок ставят позже звонка) и
 * имена менеджеров. Общая на портал и период, лежит в кэше витрины 5
 * минут — листание и смена фильтров её не перечитывают; сохранение отзыва
 * сбрасывает секцию портала.
 *
 * Инстанс Битрикса — только на время чтения имён (`PBXService.init`), в
 * сервисе не хранится. Имена не прочитались — список без имён, не ошибка.
 */
@Injectable()
export class CallListIndexLoader {
    private readonly logger = new Logger(CallListIndexLoader.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly calls: CallsLoader,
        private readonly feedback: AiAnalyticsFeedbackStore,
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async load(
        domain: string,
        from: string,
        to: string,
        now: Date = new Date(),
    ): Promise<CallListIndex> {
        const { value } = await this.cache.remember(
            buildCallListKey(domain, from, to),
            CALLS_LIST_TTL_SECONDS,
            () => this.build(domain, from, to, now),
        );
        return value;
    }

    private async build(
        domain: string,
        from: string,
        to: string,
        now: Date,
    ): Promise<CallListIndex> {
        const { calendar } = await this.settings.load(domain);
        const range = portalRangeUtc(from, to, calendar.timeZone);
        const reviewsUntil = now > range.to ? now : range.to;
        const [lite, feedback] = await Promise.all([
            this.calls.loadLite(domain, range.from, range.to),
            this.feedback.listInPeriod(domain, range.from, reviewsUntil),
        ]);
        const rows = toCallListRows(lite);
        const managerIds = [
            ...new Set(
                rows
                    .map(row => row.managerId)
                    .filter((id): id is string => id !== null),
            ),
        ];
        return {
            rows,
            reviews: groupCallReviews(feedback),
            managerNames: await this.managerNames(domain, managerIds),
        };
    }

    private async managerNames(
        domain: string,
        managerIds: readonly string[],
    ): Promise<Record<string, string>> {
        if (managerIds.length === 0) return {};
        try {
            const { bitrix } = await this.pbx.init(domain);
            const names = await new UserNamesReader(bitrix).read(managerIds);
            return Object.fromEntries(names);
        } catch (error) {
            this.logger.warn(
                `Имена менеджеров ${domain} для списка разборов не прочитаны: ${(error as Error).message}`,
            );
            return {};
        }
    }
}
