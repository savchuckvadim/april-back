import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PBXModule } from '@lib/pbx/pbx.module';
import { CallReportSmartModule } from '@lib/call-lib';
import { SkapInstallModule } from '@lib/skap-lib';
import { SmartService } from './services/smart.service';
import { SmartDetailsService } from './services/smart-details.service';
import { ConstSmartInstallerResolver } from './services/const-smart-installer.service';
import { SmartRepository } from './repositories/smart.repository';
import { SmartPrismaRepository } from './repositories/smart.prisma.repository';
import { SmartController } from './controllers/smart.controller';

@Module({
    // CallReportSmartModule / SkapInstallModule — переиспользуемые
    // установки const-смартов (aicall из @lib/call-lib, skap из
    // @lib/skap-lib): admin даёт свой контроллер поверх тех же use-case.
    imports: [
        PrismaModule,
        PBXModule,
        CallReportSmartModule,
        SkapInstallModule,
    ],
    providers: [
        SmartService,
        SmartDetailsService,
        ConstSmartInstallerResolver,
        {
            provide: SmartRepository,
            useClass: SmartPrismaRepository,
        },
    ],
    controllers: [SmartController],
    exports: [SmartService, SmartRepository],
})
export class SmartModule {}
