import { Module } from '@nestjs/common';
import { InitSupplyController } from './supply/init-supply.ts/init-supply.controller';
import { InitSupplyService } from './supply/init-supply.ts/init-supply.service';
import { InitSupplyUseCase } from './supply/init-supply.ts/init-supply.use-case';
import { ZakupkiOfferModule } from './zakupki-offer/zakupki-offer.module';
import { InfoblockModule } from './domain/infoblock/infoblock.module';
@Module({
  imports: [
    ZakupkiOfferModule,
    InfoblockModule,

  ],
  controllers: [InitSupplyController],
  providers: [
    InitSupplyUseCase,
    InitSupplyService
  ],
  exports: [
    ZakupkiOfferModule,
    InfoblockModule
  ]
})
export class KonstructorModule { }
