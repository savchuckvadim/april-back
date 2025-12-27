import { Module } from '@nestjs/common';
import { BitrixSetupAppModule } from '@/modules/bitrix-setup/app/bitrix-setup-app.module';
import { AdminBitrixAppController } from './controllers/bitrix-app.controller';

@Module({
    imports: [BitrixSetupAppModule],
    controllers: [AdminBitrixAppController],
})
export class AdminAppModule { }

