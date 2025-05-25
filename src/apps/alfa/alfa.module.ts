import { Module } from '@nestjs/common';
import { AlfaController } from './alfa.controller';
import { CreateDealUseCase } from './use-cases/create-deal.use-case';
import { PBXModule } from 'src/modules/pbx/pbx.module';
@Module({
  imports: [PBXModule],
  controllers: [AlfaController],
  providers: [CreateDealUseCase],
})
export class AlfaModule {}
