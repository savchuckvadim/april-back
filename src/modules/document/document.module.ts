import { Module } from '@nestjs/common'; // 👈 это обязательно

// import { ContractModule } from './contract/contract.module';
import { SupplyReportModule } from './supply-report/supply-report.module';
// import { OfferModule } from './offer/offer.module';
// import { GeneralModule } from './general/general.module';

@Module({
  imports: [
    // ContractModule, 
    SupplyReportModule,
    // OfferModule,
    // GeneralModule,
  ],
  exports: [
    // ContractModule,
    SupplyReportModule,
    // OfferModule,
    // GeneralModule,
  ],
})
export class DocumentModule {}
