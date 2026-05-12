import { Module } from '@nestjs/common';
import { PortalCategoryModule } from '@/modules/pbx-domain/category';
import { InstallCategorySyncService } from './install-category-sync.service';

/**
 * Установка/синхронизация воронок (Bitrix + БД портала).
 * Импортируйте в install-сценарии смартов, сделок и т.д.
 */
@Module({
    imports: [PortalCategoryModule],
    providers: [InstallCategorySyncService],
    exports: [InstallCategorySyncService],
})
export class InstallCategoryModule {}
