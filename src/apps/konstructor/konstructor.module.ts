import { Module } from '@nestjs/common';
import { InitSupplyController } from './supply/init-supply.ts/init-supply.controller';
import { InitSupplyService } from './supply/init-supply.ts/init-supply.service';
import { InitSupplyUseCase } from './supply/init-supply.ts/init-supply.use-case';
import { ZakupkiOfferModule } from './zakupki-offer/zakupki-offer.module';
import { InfoblockModule } from './domain/infoblock/infoblock.module';
import { ContractGenerateModule } from './contract/generate/contract-generate.module';
import { OfferModule } from './offer/offer.module';
@Module({
  imports: [
    ZakupkiOfferModule,
    InfoblockModule,
    ContractGenerateModule,
    OfferModule
  ],
  controllers: [InitSupplyController],
  providers: [
    InitSupplyUseCase,
    InitSupplyService
  ],
  exports: [
    ZakupkiOfferModule,
    InfoblockModule,
    ContractGenerateModule,
    OfferModule
  ]
})
export class KonstructorModule { }
