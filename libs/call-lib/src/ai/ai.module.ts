import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { AiService } from './services/ai.service';
import { AiRepository } from './repository/ai.repository';
import { AiPrismaRepository } from './repository/ai.prisma.repository';
import { AdminAiController } from './controllers/ai.admin.controller';

@Module({
    imports: [PrismaModule],
    controllers: [AdminAiController],
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
