import { Module } from '@nestjs/common';
import { InfoblockModule } from './infoblock.module';
import { InfoblockController } from './infoblock.controller';

/**
 * Админ-слой инфоблоков гаранта: `/infoblock/all` и `/infoblock/:code`.
 * Контроллеру нужен только InfoblockService из {@link InfoblockModule}.
 * Подключать ТОЛЬКО в приложении админки, под её авторизацией; konstructor
 * этот модуль не импортирует (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [InfoblockModule],
    controllers: [InfoblockController],
})
export class InfoblockAdminModule {}
