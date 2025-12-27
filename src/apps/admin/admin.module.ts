import { Module } from '@nestjs/common';
import { AdminClientModule } from './client/client.module';
import { AdminAppModule } from './app/app.module';
import { AdminPortalModule } from './portal/portal.module';
import { BtxDealModule } from './portal/btx-deals/btx-deal.module';
import { BtxLeadModule } from './portal/btx-leads/btx-lead.module';
import { BtxCompanyModule } from './portal/btx-companies/btx-company.module';
import { BtxContactModule } from './portal/btx-contacts/btx-contact.module';
import { BtxRpaModule } from './portal/btx-rpas/btx-rpa.module';
import { BitrixFieldModule } from './portal/bitrixfields/bitrixfield.module';
import { SmartModule } from './portal/smarts/smart.module';
import { BxRqModule } from './portal/bx-rqs/bx-rq.module';
import { TimezoneModule } from './portal/timezones/timezone.module';
import { BtxCategoryModule } from './portal/btx-categories/btx-category.module';
import { ContractModule } from './contracts/contract.module';
import { MeasureModule } from './measures/measure.module';
import { PortalMeasureModule } from './portal/portal-measures/portal-measure.module';
import { PortalContractModule } from './portal/portal-contracts/portal-contract.module';

@Module({
    imports: [
        AdminClientModule,
        AdminAppModule,
        AdminPortalModule,
        BtxDealModule,
        BtxLeadModule,
        BtxCompanyModule,
        BtxContactModule,
        BtxRpaModule,
        BitrixFieldModule,
        SmartModule,
        BxRqModule,
        TimezoneModule,
        BtxCategoryModule,
        ContractModule,
        MeasureModule,
        PortalMeasureModule,
        PortalContractModule,
    ],
})
export class AdminModule { }

