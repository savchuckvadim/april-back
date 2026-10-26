import { Module } from '@nestjs/common';
import { CatalogTableModule } from './catalog-table.module';
import { CatalogTableAdminController } from './controllers/catalog-table.admin.controller';

/**
 * Админ-слой эталонных таблиц каталога: подключается ТОЛЬКО в apps/admin
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [CatalogTableModule],
    controllers: [CatalogTableAdminController],
})
export class CatalogTableAdminModule {}
