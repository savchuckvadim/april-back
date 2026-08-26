import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PBXModule } from '@lib/pbx/pbx.module';
import { CallReportSmartModule } from '@lib/call-lib';
import { SkapInstallModule } from '@lib/skap-lib';
import { ZprSmartInstallModule } from '@app/pbx-install/smart/zpr/zpr-smart-install.module';
import { PresentationSmartInstallModule } from '@app/pbx-install/smart/presentation/presentation-smart-install.module';
import { SmartService } from './services/smart.service';
import { SmartDetailsService } from './services/smart-details.service';
import { ConstSmartInstallerResolver } from './services/const-smart-installer.service';
import { SmartRepository } from './repositories/smart.repository';
import { SmartPrismaRepository } from './repositories/smart.prisma.repository';
import { SmartController } from './controllers/smart.controller';

@Module({
    // CallReportSmartModule / SkapInstallModule / ZprSmartInstallModule —
    // переиспользуемые установки const-смартов (aicall из @lib/call-lib,
    // skap из @lib/skap-lib, zpr из @app/pbx-install — по образцу
    // @app/konstructor): admin даёт свой контроллер поверх тех же use-case.
    imports: [
        PrismaModule,
        PBXModule,
        CallReportSmartModule,
        SkapInstallModule,
        ZprSmartInstallModule,
        PresentationSmartInstallModule,
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
