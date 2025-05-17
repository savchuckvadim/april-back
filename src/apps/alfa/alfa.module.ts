import { Module } from '@nestjs/common';
import { AlfaController } from './alfa.controller';
import { BitrixCoreModule } from 'src/modules/bitrix/core/bitrix-core.module';
import { CreateDealUseCase } from './use-cases/create-deal.use-case';
import { PortalModule } from 'src/modules/portal/portal.module';
@Module({
  imports: [BitrixCoreModule, PortalModule],
  controllers: [AlfaController],
  providers: [CreateDealUseCase],
})
export class AlfaModule {}
