import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { AiService } from './services/ai.service';
import { AiRepository } from './repository/ai.repository';
import { AiPrismaRepository } from './repository/ai.prisma.repository';

/**
 * Сервисный модуль AI-записей: только провайдеры и экспорт сервисов.
 * Админ-контроллер вынесен в {@link AiAdminModule}, чтобы приложения
 * (event-sales), которым нужен лишь AiService, не тащили админские роуты.
 */
@Module({
    imports: [PrismaModule],
    providers: [
        AiService,
        {
            provide: AiRepository,
            useClass: AiPrismaRepository,
        },
    ],
    exports: [AiService, AiRepository],
})
export class AiModule {}
