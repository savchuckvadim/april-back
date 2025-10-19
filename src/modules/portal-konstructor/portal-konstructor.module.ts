import { Module } from '@nestjs/common';

import { PortalStoreModule } from './portal/portal-store.module';
import { TemplateBaseModule } from './template-base/template-base.module';
import { FieldModule } from './field/field.module';
import { CounterModule } from './counter/counter.module';
import { ProviderModule } from './provider';

@Module({
    imports: [
        PortalStoreModule,
        TemplateBaseModule,
        FieldModule,
        CounterModule,
        ProviderModule,
    ],
    exports: [
        PortalStoreModule,
        TemplateBaseModule,
        FieldModule,
        CounterModule,
        ProviderModule,
    ],
})
export class PortalKonstructorModule { }
