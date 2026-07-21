import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PBXModule } from '@lib/pbx/pbx.module';
import { CallReportSmartModule } from '@lib/call-lib';
import { SmartService } from './services/smart.service';
import { SmartDetailsService } from './services/smart-details.service';
import { SmartRepository } from './repositories/smart.repository';
import { SmartPrismaRepository } from './repositories/smart.prisma.repository';
import { SmartController } from './controllers/smart.controller';

@Module({
    // CallReportSmartModule — переиспользуемая установка смарта
    // «AI-анализ звонков» (@lib/call-lib): admin даёт свой контроллер
    // поверх того же use-case, что и event-sales.
    imports: [PrismaModule, PBXModule, CallReportSmartModule],
    providers: [
        SmartService,
        SmartDetailsService,
        {
            provide: SmartRepository,
            useClass: SmartPrismaRepository,
        },
    ],
    controllers: [SmartController],
    exports: [SmartService, SmartRepository],
})
export class SmartModule {}
