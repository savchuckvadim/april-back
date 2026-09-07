import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { toPortalDate } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildResetPattern } from '../../cache/cache-key.util';
import { AI_ANALYTICS_CACHE_SECTIONS } from '../../constants/ai-analytics.const';
import {
    AiManagerLevelDto,
    AiSettingsSaveRequestDto,
    AiSettingsSaveResultDto,
} from '../../dto/ai-settings-save.dto';
import {
    AiAnalyticsSettingsStore,
    AiManagerLevelRecord,
} from '../../store/ai-analytics-settings.store';
import { isManagerVisible, RequesterAccess } from '../access/perimeter.util';
import { SettingsLoader } from '../loaders/settings.loader';

/** Секции кэша, которые зависят от уровней (план 5.1: settings/save). */
const INVALIDATED_SECTIONS = [
    AI_ANALYTICS_CACHE_SECTIONS.OVERVIEW,
    AI_ANALYTICS_CACHE_SECTIONS.ATTENTION,
] as const;

/**
 * Сохранение настроек витрины (план 6.2/6.5, Фаза 1b — только уровни
 * менеджеров): роль проверяет контроллер (cup|op), здесь — каждый managerId
 * в периметре requester'а (403), since ≤ сегодня в TZ портала и без
 * дублей (400); запись полного списка в стор (ais) и сброс кэша
 * overview/attention домена — следующий запрос обзора пересчитается с
 * новыми уровнями.
 */
@Injectable()
export class SettingsSaveUseCase {
    private readonly logger = new Logger(SettingsSaveUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly store: AiAnalyticsSettingsStore,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async execute(
        dto: AiSettingsSaveRequestDto,
        access: RequesterAccess,
        now = new Date(),
    ): Promise<AiSettingsSaveResultDto> {
        const { calendar } = await this.settings.load(dto.domain);
        const today = toPortalDate(now, calendar.timeZone);
        const levels = this.toRecords(dto.levels, access, today);

        const { id, savedAt } = await this.store.saveLevels(
            dto.domain,
            levels,
            dto.requesterUserId,
            now,
        );
        const resetCount = await this.invalidate(dto.domain);
        this.logger.log(
            `Уровни ${dto.domain} сохранены пользователем ${dto.requesterUserId}: ` +
                `${levels.length} шт., сброшено ключей ${resetCount}`,
        );
        return {
            id,
            levels: levels.map(level => ({
                managerId: level.managerId,
                level: level.level,
                ...(level.since ? { since: level.since } : {}),
            })),
            savedAt,
            resetCount,
        };
    }

    /** Проверки периметра, даты стажа и дублей; DTO → записи стора. */
    private toRecords(
        items: readonly AiManagerLevelDto[],
        access: RequesterAccess,
        today: string,
    ): AiManagerLevelRecord[] {
        const seen = new Set<number>();
        return items.map(item => {
            if (!isManagerVisible(access, String(item.managerId))) {
                throw new ForbiddenException(
                    `Менеджер ${item.managerId} вне периметра видимости пользователя`,
                );
            }
            if (seen.has(item.managerId)) {
                throw new BadRequestException(
                    `Менеджер ${item.managerId} указан дважды`,
                );
            }
            seen.add(item.managerId);
            if (item.since !== undefined && item.since > today) {
                throw new BadRequestException(
                    `since менеджера ${item.managerId} (${item.since}) позже сегодняшнего дня ${today}`,
                );
            }
            return {
                managerId: item.managerId,
                level: item.level,
                since: item.since ?? null,
            };
        });
    }

    /** Сброс overview/attention домена; ошибка кэша не отменяет сохранение. */
    private async invalidate(domain: string): Promise<number> {
        let total = 0;
        for (const section of INVALIDATED_SECTIONS) {
            try {
                total += await this.cache.resetByPattern(
                    buildResetPattern(domain, section),
                );
            } catch (error) {
                this.logger.warn(
                    `Кэш ${section} домена ${domain} не сброшен: ${(error as Error).message}`,
                );
            }
        }
        return total;
    }
}
