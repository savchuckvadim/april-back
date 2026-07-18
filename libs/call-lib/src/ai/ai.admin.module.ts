import { Module } from '@nestjs/common';
import { AiModule } from './ai.module';
import { AdminAiController } from './controllers/ai.admin.controller';

/**
 * Админ-слой доставки для AI-записей (`admin/ai`).
 * Импортирует {@link AiModule} ради `AiService` и регистрирует только
 * админ-контроллер. Подключать в приложении админки, а НЕ в event-sales.
 */
@Module({
    imports: [AiModule],
    controllers: [AdminAiController],
})
export class AiAdminModule {}
