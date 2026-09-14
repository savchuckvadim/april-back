import { Module } from '@nestjs/common';
import { ZakupkiOfferModule } from './zakupki-offer/zakupki-offer.module';
import { ContractGenerateModule } from './contract/generate/contract-generate.module';
import { OfferModule } from './offer/offer.module';
import { GarantModule } from '@lib/garant/garant.module';
import { KonstructorInitModule } from './init/konstructor-init.module';
import { PBXModule } from '@lib/pbx';
import { InitSupplyModule } from './supply/init-supply/init-supply.module';
import { SupplyInitDealModule } from './supply/init-deal/supply-init-deal.module';
import { SupplyInitTaskAccountantModule } from './supply/init-task-accountant/supply-init-task-accountant.module';
import { InnerDealModule } from './modules/inner-deal/inner-deal.module';
import { DealSendModule } from './modules/deal-send/deal-send.module';
import { DirectServiceDealModule } from './supply/direct-service-deal/direct-service-deal.module';
import { BitrixHelperModule } from './modules/bitrix-helper/bitrix-helper.module';
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
        SupplyInitTaskAccountantModule,
        InnerDealModule,
        DealSendModule,
        DirectServiceDealModule,
        BitrixHelperModule,
    ],

    exports: [
        ZakupkiOfferModule,
        ContractGenerateModule,
        OfferModule,
        KonstructorInitModule,
        SupplyInitDealModule,
        SupplyInitTaskAccountantModule,
    ],
})
export class KonstructorModule {}
