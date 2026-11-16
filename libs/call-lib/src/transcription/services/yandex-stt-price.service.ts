import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    envOnlyReader,
    integerSettingValue,
    TRANSCRIPTION_SPEND_SETTING_RULES,
    VENDOR_SETTINGS_READER,
    type VendorSettingsReader,
} from '@lib/vendor-settings';

const PRICE_RULE =
    TRANSCRIPTION_SPEND_SETTING_RULES.YANDEX_STT_KOPECKS_PER_MINUTE;

/**
 * Цена минуты распознавания Яндексом, копеек — из «Настроек приложения»
 * (YANDEX_STT_KOPECKS_PER_MINUTE), иначе из окружения, иначе 60. Одна цена
 * на страницу расхода в админке и на оповещение о месячном лимите.
 */
@Injectable()
export class YandexSttPriceService {
    private readonly logger = new Logger(YandexSttPriceService.name);
    private readonly settings: VendorSettingsReader;

    constructor(
        configService: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        this.settings =
            settings ?? envOnlyReader(key => configService.get<string>(key));
    }

    /** Сбой чтения настроек расчёт не роняет — действует цена по умолчанию. */
    async kopecksPerMinute(): Promise<number> {
        try {
            return integerSettingValue(
                await this.settings.get('YANDEX_STT_KOPECKS_PER_MINUTE'),
                PRICE_RULE,
            );
        } catch (error) {
            this.logger.warn(
                `Цена минуты Яндекса не прочиталась, считаю по умолчанию: ${(error as Error).message}`,
            );
            return PRICE_RULE.defaultValue;
        }
    }
}
