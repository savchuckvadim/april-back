import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { SmartService } from './services/smart.service';
import { SmartRepository } from './repositories/smart.repository';
import { SmartPrismaRepository } from './repositories/smart.prisma.repository';
import { SmartController } from './controllers/smart.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        SmartService,
        {
            provide: SmartRepository,
            useClass: SmartPrismaRepository,
        },
    ],
    controllers: [SmartController],
    exports: [SmartService, SmartRepository],
})
export class SmartModule {}

