import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import type { KonstructorInitDataDto } from '../../../init/dto/response-init-data.dto';
import { KonstructorInitUseCase } from '../../../init/konstructor-init.use-case';
import { toPublicCatalog } from '../lib/public-catalog.util';
import { PublicLinkService } from './public-link.service';

const CACHE_APP = 'konstructor-public';
const CACHE_KEY = 'catalog';
const CACHE_TTL_SECONDS = 300;

/**
 * Каталог по публичному токену. Init тяжёлый (десяток выборок), а ссылка
 * открыта всем, у кого она есть, поэтому ответ кэшируется на портал. Сбой кэша
 * не должен закрывать страницу: тогда каталог считается напрямую.
 */
@Injectable()
export class PublicCatalogService {
    private readonly logger = new Logger(PublicCatalogService.name);

    constructor(
        private readonly links: PublicLinkService,
        private readonly init: KonstructorInitUseCase,
        private readonly cache: AppCacheService,
    ) {}

    async getByToken(token: string): Promise<KonstructorInitDataDto> {
        const link = await this.links.requireActive(token);
        const catalog = await this.load(link.domain);
        await this.links.registerView(link.id);
        return catalog;
    }

    private async load(domain: string): Promise<KonstructorInitDataDto> {
        const build = async () => toPublicCatalog(await this.init.init(domain));
        try {
            return await this.cache.remember(
                {
                    app: CACHE_APP,
                    domain,
                    key: CACHE_KEY,
                    ttlSeconds: CACHE_TTL_SECONDS,
                },
                build,
            );
        } catch (error) {
            this.logger.warn(
                `Кэш публичного каталога недоступен: ${String(error)}`,
            );
            return build();
        }
    }
}
