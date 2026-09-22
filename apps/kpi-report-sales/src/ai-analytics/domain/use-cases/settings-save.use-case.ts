import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import {
    AI_ANALYTICS_PARAM_DEFAULTS,
    paramsVersion,
    REGISTRY_VERSION,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import type { JsonObject } from '@lib/sales-ai-analytics/params/index';
import {
    comparableFromEvents,
    diffAiSettings,
    nextSettingsComparableFrom,
    settingsBreakEvent,
    type AiSettingsChange,
} from '@lib/sales-ai-analytics/settings/ai-settings.series';
import { settingsSanity } from '@lib/sales-ai-analytics/settings/ai-settings.sanity';
import type { AiPortalSettingsBlocks } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { buildRegistryContext } from '@lib/sales-ai-analytics/settings/registry-context.builder';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildResetPattern } from '../../cache/cache-key.util';
import { AI_ANALYTICS_SETTINGS_RESET_SCOPES } from '../../constants/ai-analytics.const';
import {
    AiSettingsSaveRequestDto,
    AiSettingsSaveResultDto,
} from '../../dto/ai-settings-save.dto';
import { AiAnalyticsSettingsAuditStore } from '../../store/ai-analytics-settings-audit.store';
import {
    AiAnalyticsSettingsStore,
    AiSettingsPatch,
} from '../../store/ai-analytics-settings.store';
import { isManagerVisible, RequesterAccess } from '../access/perimeter.util';
import { SettingsLoader } from '../loaders/settings.loader';
import {
    blocksOf,
    changedKeys,
    claimManagerIds,
    mergeBlocks,
    serializeBlocks,
    toClaim,
} from './settings-save.mapper';

/**
 * Сохранение настроек витрины (план Фазы 2, §3.3): уровни, цели,
 * отсутствия, параметры менеджеров, определения событий, журнал,
 * гиперпараметры модели, потолки оценивания, гипотеза и подтверждение
 * ростера. Роль (cup|op) проверяет контроллер, здесь — периметр
 * requester'а (403) и здравый смысл значений (400, диапазоны из реестра).
 *
 * Три следствия каждого сохранения: ключи схемы переписываются, кэш
 * обзора/модели/плана сбрасывается, и пишется снапшот
 * `ai-analytics-settings-audit`. Изменение поля с `breaksSeries` двигает
 * `comparableFrom` вперёд и оставляет в журнале автособытие — иначе через
 * месяц никто не объяснит излом тренда.
 */
@Injectable()
export class SettingsSaveUseCase {
    private readonly logger = new Logger(SettingsSaveUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly store: AiAnalyticsSettingsStore,
        private readonly cache: AiAnalyticsCacheService,
        private readonly audit: AiAnalyticsSettingsAuditStore,
    ) {}

    async execute(
        dto: AiSettingsSaveRequestDto,
        access: RequesterAccess,
        now = new Date(),
    ): Promise<AiSettingsSaveResultDto> {
        const settings = await this.settings.load(dto.domain);
        const today = toPortalDate(now, settings.calendar.timeZone);
        const claim = toClaim(dto);
        this.assertPerimeter(claim, access);
        const sanity = settingsSanity({ claim, today });
        if (sanity.blocking.length > 0) {
            throw new BadRequestException(sanity.blocking.join('; '));
        }

        const current = blocksOf(settings);
        const before = serializeBlocks(current);
        const comparableBefore = comparableFromEvents(current.events);
        const draft = mergeBlocks(current, claim);
        const breaking = diffAiSettings(before, serializeBlocks(draft)).filter(
            change => change.breaksSeries,
        );
        const next =
            breaking.length > 0
                ? mergeBlocks(current, claim, [
                      settingsBreakEvent(
                          today,
                          breaking.map(change => change.code),
                      ),
                  ])
                : draft;
        const after = serializeBlocks(next);
        const changed = diffAiSettings(before, after);

        await this.store.savePortalSettings(
            dto.domain,
            this.patchOf(before, after),
        );
        const comparableFrom = nextSettingsComparableFrom(
            comparableBefore,
            changed,
            today,
        );
        const resetCount = await this.invalidate(dto.domain);
        const id = await this.audit.save({
            domain: dto.domain,
            day: today,
            author: dto.requesterUserId,
            changed,
            comparableFromBefore: comparableBefore,
            comparableFromAfter: comparableFrom,
            paramsVersion: this.versionOf(next),
            warnings: sanity.warnings,
            savedAt: now.toISOString(),
        });
        this.logger.log(
            `Настройки ${dto.domain} сохранены пользователем ` +
                `${dto.requesterUserId}: изменений ${changed.length}, ` +
                `рвущих ряд ${breaking.length}, сброшено ключей ${resetCount}`,
        );

        return {
            id,
            levels: next.levels.map(level => ({
                managerId: level.managerId,
                level: level.level,
                ...(level.since ? { since: level.since } : {}),
            })),
            savedAt: now.toISOString(),
            resetCount,
            comparableFrom,
            paramsVersion: this.versionOf(next),
            breaksSeries: breaking.map(change => change.code),
            warnings: sanity.warnings,
        };
    }

    /** Каждый упомянутый менеджер — в периметре видимости requester'а. */
    private assertPerimeter(
        claim: ReturnType<typeof toClaim>,
        access: RequesterAccess,
    ): void {
        for (const managerId of claimManagerIds(claim)) {
            if (!isManagerVisible(access, managerId)) {
                throw new ForbiddenException(
                    `Менеджер ${managerId} вне периметра видимости пользователя`,
                );
            }
        }
    }

    /** Пишем только те ключи, значение которых действительно изменилось. */
    private patchOf(
        before: ReturnType<typeof serializeBlocks>,
        after: ReturnType<typeof serializeBlocks>,
    ): AiSettingsPatch {
        const patch: AiSettingsPatch = {};
        for (const name of changedKeys(before, after)) {
            patch[name] = after[name];
        }
        return patch;
    }

    /** Версия параметров после сохранения — по слоям контекста реестра. */
    private versionOf(blocks: AiPortalSettingsBlocks): string {
        const ctx = buildRegistryContext({
            modelParams: blocks.modelParams,
            definitions: blocks.definitions,
            targets: blocks.targets,
        });
        return paramsVersion({
            globalDefaults: AI_ANALYTICS_PARAM_DEFAULTS as JsonObject,
            portalParams: (ctx.portal ?? {}) as JsonObject,
            registryVersion: REGISTRY_VERSION,
        });
    }

    /** Сброс обзора, «Внимания», модели, плана и настроек; ошибка кэша не отменяет запись. */
    private async invalidate(domain: string): Promise<number> {
        let total = 0;
        for (const scope of AI_ANALYTICS_SETTINGS_RESET_SCOPES) {
            try {
                total += await this.cache.resetByPattern(
                    buildResetPattern(domain, scope),
                );
            } catch (error) {
                this.logger.warn(
                    `Кэш ${scope} домена ${domain} не сброшен: ${(error as Error).message}`,
                );
            }
        }
        return total;
    }
}

/** Изменения одного сохранения — для аудита и тестов соседних потоков. */
export type { AiSettingsChange };
