import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    envOnlyReader,
    RABS_VAT_COEFFICIENT_DEFAULT,
    RABS_VAT_COEFFICIENT_KEY,
    RABS_VAT_COEFFICIENT_MAX,
    resolveRabsVatCoefficient,
    VENDOR_SETTINGS_READER,
    type VendorSettingsReader,
} from '@lib/vendor-settings';

/**
 * Коэффициент НДС рабса: множитель, на который конструктор умножает рабс
 * региона при расчёте цен универсала и консалтинга. Один на всю систему,
 * живёт в настройках вендора (`KONSTRUKTOR_RABS_VAT_COEFFICIENT`, правится в
 * админке, кэш настроек минута), иначе env с тем же именем, иначе 1.22.
 *
 * Единое место чтения для всех потребителей: выдача каталога конструктора,
 * админские DTO регионов, загрузка книги цен. Неверное значение (не число,
 * не больше 1, больше 2) считается незаданным: действует 1.22, в лог идёт
 * предупреждение (раз на каждое новое неверное значение, чтобы не засорять
 * лог на каждом запросе). Сбой чтения настроек расчёт не роняет.
 */
@Injectable()
export class RabsVatService {
    private readonly logger = new Logger(RabsVatService.name);
    private readonly settings: VendorSettingsReader;
    private lastWarnedRaw: string | null = null;

    constructor(
        configService: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        this.settings =
            settings ?? envOnlyReader(key => configService.get<string>(key));
    }

    async coefficient(): Promise<number> {
        let raw: string | null;
        try {
            raw = await this.settings.get(RABS_VAT_COEFFICIENT_KEY);
        } catch (error) {
            this.logger.warn(
                `Коэффициент НДС рабса не прочитался, действует ${RABS_VAT_COEFFICIENT_DEFAULT}: ${(error as Error).message}`,
            );
            return RABS_VAT_COEFFICIENT_DEFAULT;
        }
        const { value, invalid } = resolveRabsVatCoefficient(raw);
        if (invalid && raw !== this.lastWarnedRaw) {
            this.lastWarnedRaw = raw;
            this.logger.warn(
                `Коэффициент НДС рабса «${raw}» неверный (нужно число больше 1 и не больше ${RABS_VAT_COEFFICIENT_MAX}), действует ${RABS_VAT_COEFFICIENT_DEFAULT}`,
            );
        }
        return value;
    }
}
