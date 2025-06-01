import { Module } from "@nestjs/common";
import { InfoblockModule } from "./infoblock";
import { ComplectModule } from "./complect";
import { InfogroupModule } from "./infogroup";
import { SupplyModule } from "./supply";
import { PriceModule } from "./price";
import { RegionModule } from "./region";


@Module({
    imports: [
        PriceModule,
        InfoblockModule,
        ComplectModule,
        SupplyModule,
        InfogroupModule,
        RegionModule
    ],
    exports: [
        PriceModule,
        InfoblockModule,
        ComplectModule,
        SupplyModule,
        InfogroupModule,
        RegionModule
    ]
})
export class GarantModule { }