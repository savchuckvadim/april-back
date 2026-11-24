import { Module } from '@nestjs/common';
import { ComplectModule } from './complect.module';
import { ComplectController } from './complect.controller';

/**
 * Админ-слой комплектов гаранта: `/complect` (создание, правка, список
 * доступных инфоблоков). Контроллеру нужен только ComplectService из
 * {@link ComplectModule}. Подключать ТОЛЬКО в приложении админки, под её
 * авторизацией; konstructor этот модуль не импортирует
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [ComplectModule],
    controllers: [ComplectController],
})
export class ComplectAdminModule {}
