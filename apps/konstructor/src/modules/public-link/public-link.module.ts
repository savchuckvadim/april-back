import { Module } from '@nestjs/common';
import { KonstructorInitModule } from '../../init/konstructor-init.module';
import { ComplectDescriptionModule } from '../complect-description/complect-description.module';
import { PublicAccessController } from './controllers/public-access.controller';
import { PublicLinkController } from './controllers/public-link.controller';
import { PublicLinkPrismaRepository } from './repositories/public-link.prisma.repository';
import { PublicCatalogService } from './services/public-catalog.service';
import { PublicDescriptionService } from './services/public-description.service';
import { PublicLinkService } from './services/public-link.service';

/**
 * Публичный конструктор по отзываемой ссылке: выдача и отзыв из админки,
 * каталог и описание комплекта по токену. Правила домена — README модуля.
 */
@Module({
    imports: [KonstructorInitModule, ComplectDescriptionModule],
    controllers: [PublicLinkController, PublicAccessController],
    providers: [
        PublicLinkPrismaRepository,
        PublicLinkService,
        PublicCatalogService,
        PublicDescriptionService,
    ],
})
export class PublicLinkModule {}
