import { Injectable } from '@nestjs/common';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildSettingsKey } from '../../cache/cache-key.util';
import { AI_ANALYTICS_SETTINGS_TTL_SECONDS } from '../../constants/ai-analytics.const';
import type { AiAnalyticsReadinessMode } from '../../constants/ai-analytics.const';
import type { AiAnalyticsSettingsDto } from '../../dto/ai-settings.dto';
import type { ReadinessModeSource } from './readiness-mode.source';
import { SettingsUseCase } from './settings.use-case';

/**
 * Настройки и готовность портала через тот же кэш, что у `settings/get`
 * (ключ `buildSettingsKey`, 300 с): другим ручкам вкладки нужен ровно тот
 * режим готовности, который видит баннер, — и без второго тяжёлого
 * расчёта (lite-выборка за 120 дней) на каждый запрос.
 *
 * @Injectable без bitrix-состояния: портал приходит параметром domain.
 */
@Injectable()
export class CachedSettingsReader implements ReadinessModeSource {
    constructor(
        private readonly cache: AiAnalyticsCacheService,
        private readonly settings: SettingsUseCase,
    ) {}

    /** Настройки портала из кэша (промах — расчёт и запись в кэш). */
    async read(domain: string): Promise<AiAnalyticsSettingsDto> {
        const { value } = await this.cache.remember<AiAnalyticsSettingsDto>(
            buildSettingsKey(domain),
            AI_ANALYTICS_SETTINGS_TTL_SECONDS,
            () => this.settings.execute(domain),
        );
        return value;
    }

    /** Итоговый режим готовности портала — тот же, что в баннере. */
    async readinessMode(domain: string): Promise<AiAnalyticsReadinessMode> {
        return (await this.read(domain)).readiness.mode;
    }
}
