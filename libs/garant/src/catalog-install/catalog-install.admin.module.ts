import { Module } from '@nestjs/common';
import { CatalogInstallModule } from './catalog-install.module';
import { CatalogSeedAdminController } from './controllers/catalog-seed.admin.controller';

/**
 * Админ-слой сида каталога: подключается ТОЛЬКО в apps/admin
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [CatalogInstallModule],
    controllers: [CatalogSeedAdminController],
})
export class CatalogSeedAdminModule {}
