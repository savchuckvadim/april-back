import { Module } from '@nestjs/common';

import { TemplateBaseModule } from './template-base/template-base.module';
import { FieldModule } from './field/field.module';
import { CounterModule } from './counter/counter.module';
import { ProviderModule } from './provider';
import { PortalStoreModule } from 'libs/portal-lib/store/portal-store.module';
import { MeasureModule } from './measure/measure.module';
import { ContractModule } from './contract/contract.module';
import { PortalMeasureModule } from './portal-measure/portal-measure.module';
import { PortalContractModule } from './portal-contract/portal-contract.module';

@Module({
    imports: [
        PortalStoreModule,
        TemplateBaseModule,
        FieldModule,
        CounterModule,
        ProviderModule,
        MeasureModule,
        ContractModule,
        PortalMeasureModule,
        PortalContractModule,
    ],
    exports: [
        PortalStoreModule,
        TemplateBaseModule,
        FieldModule,
        CounterModule,
        ProviderModule,
        MeasureModule,
        ContractModule,
        PortalMeasureModule,
        PortalContractModule,
    ],
})
export class PortalKonstructorModule {}
