import { Module } from '@nestjs/common';
import { InfogroupModule } from './infogroup.module';
import { InfogroupController } from './controllers/infogroup.controller';

/**
 * Админ-слой групп инфоблоков гаранта: `/infogroup` (создание, правка,
 * список). Контроллеру нужен только InfogroupService из
 * {@link InfogroupModule}. Подключать ТОЛЬКО в приложении админки, под её
 * авторизацией; konstructor этот модуль не импортирует
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [InfogroupModule],
    controllers: [InfogroupController],
})
export class InfogroupAdminModule {}
