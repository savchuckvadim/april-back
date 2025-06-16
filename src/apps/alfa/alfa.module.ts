import { Module } from '@nestjs/common';
import { AlfaController } from './alfa.controller';
import { CreateDealUseCase } from './use-cases/create-deal.use-case';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { BxDealService } from './services/bx-deal.service';
import { BxFieldsService } from './services/bx-field.service';
import { TestSmartService } from './services/test-smart.service';
import { AlfaSmartController } from './alfa-smart.controller';


@Module({
  imports: [
    PBXModule
  ],
  controllers: [AlfaController, AlfaSmartController],
  providers: [
    CreateDealUseCase,
    BxDealService,
    BxFieldsService,
    TestSmartService
  ],
})
export class AlfaModule { }
