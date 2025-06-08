import { Module } from "@nestjs/common";

import { PortalModule } from "./portal/portal.module";
import { TemplateBaseModule } from "./template-base/template-base.module";
import { FieldModule } from "./field/field.module";
import { CounterModule } from "./counter/counter.module";
import { ProviderModule } from "./provider";

@Module({
    imports: [
        PortalModule,
        TemplateBaseModule,
        FieldModule,
        CounterModule,
        ProviderModule,
    ],
    exports: [
        PortalModule,
        TemplateBaseModule,
        FieldModule,
        CounterModule,
        ProviderModule,
    ]
})
export class PortalKonstructorModule { }