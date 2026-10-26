import { Injectable, Logger } from '@nestjs/common';
import { GarantFeedClientService } from './garant-feed-client.service';
import { GarantFeedRegionImportService } from './garant-feed-region-import.service';
import { GarantFeedPriceImportService } from './garant-feed-price-import.service';
import { GarantFeedSeedService } from './garant-feed-seed.service';
import { ImportSectionReport } from '../types/garant-feed.types';

export type FeedImportSection = 'regions' | 'profPrices' | 'servicePrices';
export type FeedSeedSection =
    | 'supplies'
    | 'universalComplects'
    | 'servicePackages';

export interface FeedImportOptions {
    sections: FeedImportSection[];
    seed: FeedSeedSection[];
    dryRun: boolean;
}

export interface FeedImportResult {
    dryRun: boolean;
    feedUrlConfigured: boolean;
    reports: ImportSectionReport[];
}

/**
 * Оркестратор импорта каталога из Google-фида. Порядок фиксирован:
 * сначала сиды (поставки/комплекты/пакеты — на них ссылаются цены),
 * затем регионы, затем цены. Любая секция опциональна; dryRun считает
 * изменения без записи.
 */
@Injectable()
export class GarantFeedImportService {
    private readonly logger = new Logger(GarantFeedImportService.name);

    constructor(
        private readonly client: GarantFeedClientService,
        private readonly regionImport: GarantFeedRegionImportService,
        private readonly priceImport: GarantFeedPriceImportService,
        private readonly seed: GarantFeedSeedService,
    ) {}

    async run(options: FeedImportOptions): Promise<FeedImportResult> {
        const feed = await this.client.fetchFeed();
        const reports: ImportSectionReport[] = [];
        const { dryRun } = options;

        if (options.seed.includes('supplies')) {
            reports.push(await this.seed.seedSupplies(dryRun));
        }
        if (options.seed.includes('universalComplects')) {
            reports.push(await this.seed.seedUniversalComplects(feed, dryRun));
        }
        if (options.seed.includes('servicePackages')) {
            reports.push(await this.seed.seedServicePackages(feed, dryRun));
        }

        if (options.sections.includes('regions')) {
            reports.push(await this.regionImport.import(feed.regions, dryRun));
        }
        if (options.sections.includes('profPrices')) {
            reports.push(
                await this.priceImport.importProf(feed.prices.prof, dryRun),
            );
        }
        if (options.sections.includes('servicePrices')) {
            reports.push(
                await this.priceImport.importServices(
                    feed.prices.lt,
                    feed.prices.star,
                    dryRun,
                ),
            );
        }

        this.logger.log(
            `Импорт фида завершён (dryRun=${String(dryRun)}): секций ${reports.length}`,
        );
        return {
            dryRun,
            feedUrlConfigured: this.client.getFeedUrl() !== null,
            reports,
        };
    }
}
