import { Module } from '@nestjs/common';
import { AiService } from './services/ai.service';
import { AiRepository } from './repository/ai.repository';
import { AiPrismaRepository } from './repository/ai.prisma.repository';
import { AdminAiController } from './controllers/ai.admin.controller';

@Module({
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
