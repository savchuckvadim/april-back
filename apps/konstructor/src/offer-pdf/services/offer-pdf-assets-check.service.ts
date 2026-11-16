import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OfferPdfAssetStore } from '../lib/offer-pdf-asset-store';
import { OFFER_PDF_TEMPLATES } from '../templates/offer-pdf-template.registry';

/**
 * Проверка при старте: все ли картинки и логотипы стилей лежат в storage.
 * Их заносят на сервер руками, а стиль без файла молча рисуется без фона и
 * логотипа. О недостающем сообщаем одной строкой сразу, до того как менеджер
 * отправит клиенту КП без оформления. Старт не блокируется.
 */
@Injectable()
export class OfferPdfAssetsCheckService implements OnApplicationBootstrap {
    private readonly logger = new Logger(OfferPdfAssetsCheckService.name);

    constructor(private readonly assetStore: OfferPdfAssetStore) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            const missing = await this.missing();
            if (missing.length) {
                this.logger.error(
                    `Стили КП будут без оформления — нет файлов в storage/app: ${missing.join(', ')}`,
                );
            }
        } catch (error) {
            this.logger.warn(
                `Файлы стилей КП не проверены: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Недостающие файлы всех стилей без повторов */
    async missing(): Promise<string[]> {
        const loads = await Promise.all(
            OFFER_PDF_TEMPLATES.map(template =>
                this.assetStore.load({
                    images: template.assets,
                    logos: template.logos,
                }),
            ),
        );
        return [...new Set(loads.flatMap(load => load.missing))];
    }
}
