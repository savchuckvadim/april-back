import { Module } from '@nestjs/common';
import { BitrixSettingService } from './services/bitrix-setting.service';
import { BitrixSettingRepository } from './repositories/bitrix-setting.repository';
import { BitrixSettingController } from './controllers/bitrix-setting.controller';
import { PrismaService } from 'src/core/prisma';
import { BitrixSettingPrismaRepository } from './repositories/bitrix-setting.prisma.repository';

@Module({
    imports: [],
    controllers: [
        BitrixSettingController,
    ],
    providers: [
        BitrixSettingService,
        {
            provide: BitrixSettingRepository,
            useClass: BitrixSettingPrismaRepository,
        },
        PrismaService,
    ],
    exports: [
        BitrixSettingService,
        BitrixSettingRepository,
    ],
})
export class SettingModule { }
