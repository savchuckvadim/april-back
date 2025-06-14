import { Module } from '@nestjs/common';
import { InitSupplyController } from './supply/init-supply.ts/init-supply.controller';
import { InitSupplyService } from './supply/init-supply.ts/init-supply.service';
import { InitSupplyUseCase } from './supply/init-supply.ts/init-supply.use-case';
import { ZakupkiOfferModule } from './zakupki-offer/zakupki-offer.module';
import { ContractGenerateModule } from './contract/generate/contract-generate.module';
import { OfferModule } from './offer/offer.module';
import { GarantModule } from 'src/modules/garant/garant.module';
import { KonstructorInitModule } from './init/konstructor-init.module';
@Module({
  imports: [
    ZakupkiOfferModule,
    ContractGenerateModule,
    OfferModule,
    GarantModule,
    KonstructorInitModule
  ],
  controllers: [InitSupplyController],
  providers: [
    InitSupplyUseCase,
    InitSupplyService
  ],
  exports: [
    ZakupkiOfferModule,
    ContractGenerateModule,
    OfferModule,
    KonstructorInitModule
  ]
})
export class KonstructorModule { }
