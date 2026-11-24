import { Module } from '@nestjs/common';
import { SupplyModule } from './supply.module';
import { SupplyController } from './supply.controller';

/**
 * Админ-слой поставок гаранта: `/supply` (создание, правка, список).
 * Контроллеру нужен только SupplyService из {@link SupplyModule}. Подключать
 * ТОЛЬКО в приложении админки, под её авторизацией; konstructor этот модуль
 * не импортирует (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [SupplyModule],
    controllers: [SupplyController],
})
export class SupplyAdminModule {}
