import { Module } from '@nestjs/common';
import { InitSupplyController } from './supply/init-supply/init-supply.controller';
import { InitSupplyService } from './supply/init-supply/init-supply.service';
import { InitSupplyUseCase } from './supply/init-supply/init-supply.use-case';
import { ZakupkiOfferModule } from './zakupki-offer/zakupki-offer.module';
import { ContractGenerateModule } from './contract/generate/contract-generate.module';
import { OfferModule } from './offer/offer.module';
import { GarantModule } from 'src/modules/garant/garant.module';
import { KonstructorInitModule } from './init/konstructor-init.module';
import { PBXModule } from '@/modules/pbx';
import { InitSupplyModule } from './supply/init-supply/init-supply.module';
import { SupplyInitDealModule } from './supply/init-deal/supply-init-deal.module';
@Module({
    imports: [
        ZakupkiOfferModule,
        ContractGenerateModule,
        OfferModule,
        GarantModule,
        KonstructorInitModule,
        PBXModule,
        InitSupplyModule,
        SupplyInitDealModule,
    ],

    exports: [
        ZakupkiOfferModule,
        ContractGenerateModule,
        OfferModule,
        KonstructorInitModule,
        SupplyInitDealModule,
    ],
})
export class KonstructorModule {}
