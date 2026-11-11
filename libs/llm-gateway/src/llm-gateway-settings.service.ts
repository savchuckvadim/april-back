import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    VENDOR_SETTINGS_READER,
    envOnlyReader,
    type VendorSettingsReader,
} from '@lib/vendor-settings';
import type { LlmConcurrencyLimits } from './llm-concurrency.util';
import {
    LLM_CIRCUIT_SETTING_KEYS,
    LLM_FALLBACK_CALL_SETTING_KEYS,
    LLM_PROBE_LOCK_SETTING_KEYS,
    LLM_VIBECODE_CONCURRENCY_SETTING_KEYS,
    type LlmCircuitOptions,
    type LlmFallbackCallSettings,
    type LlmSettingValues,
    circuitOptionsOf,
    fallbackCallOf,
    probeLockTtlSecOf,
    vibecodeConcurrencyOf,
} from './llm-gateway-settings.util';

/**
 * Настройки шлюза из админки («Настройки приложения»): значение из админки
 * важнее env с тем же именем, читатель держит таблицу в кэше минуту — правка
 * действует без перезапуска. Читается на каждом вызове модели, поэтому
 * чтение не бросает: сбой читателя — значения по умолчанию и предупреждение.
 * Без VendorSettingsModule в приложении (тесты, утилиты) — только env.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class LlmGatewaySettingsService {
    private readonly logger = new Logger(LlmGatewaySettingsService.name);
    private readonly reader: VendorSettingsReader;

    constructor(
        configService: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        reader?: VendorSettingsReader,
    ) {
        this.reader =
            reader ?? envOnlyReader(key => configService.get<string>(key));
    }

    /** Пороги предохранителя поставщиков. */
    async circuit(): Promise<LlmCircuitOptions> {
        return circuitOptionsOf(await this.values(LLM_CIRCUIT_SETTING_KEYS));
    }

    /** Пределы одновременных запросов к VibeCode: на ключ портала и всего. */
    async vibecodeConcurrency(): Promise<LlmConcurrencyLimits> {
        return vibecodeConcurrencyOf(
            await this.values(LLM_VIBECODE_CONCURRENCY_SETTING_KEYS),
        );
    }

    /** Режим JSON и срок ответа запасного OpenAI-совместимого поставщика. */
    async fallbackCall(): Promise<LlmFallbackCallSettings> {
        return fallbackCallOf(
            await this.values(LLM_FALLBACK_CALL_SETTING_KEYS),
        );
    }

    /** Срок замка пробного вызова, с: самый долгий срок ответа плюс минута. */
    async probeLockTtlSec(): Promise<number> {
        return probeLockTtlSecOf(
            await this.values(LLM_PROBE_LOCK_SETTING_KEYS),
        );
    }

    private async values(keys: readonly string[]): Promise<LlmSettingValues> {
        try {
            return await this.reader.getMany(keys);
        } catch (error) {
            this.logger.warn(
                `Настройки шлюза модели не прочитаны (${(error as Error).message}) — действуют значения по умолчанию`,
            );
            return {};
        }
    }
}
