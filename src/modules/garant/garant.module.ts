import { Module } from '@nestjs/common';
import { InfoblockModule } from './infoblock';
import { ComplectModule } from './complect';
import { InfogroupModule } from './infogroup';
import { SupplyModule } from './supply';
import { PriceModule } from './price';
import { RegionModule } from './region';
import { ContractModule } from './contract';
import { PackageModule } from './package';

@Module({
    imports: [
        PriceModule,
        InfoblockModule,
        ComplectModule,
        SupplyModule,
        InfogroupModule,
        RegionModule,
        ContractModule,
        PackageModule,
    ],
    exports: [
        PriceModule,
        InfoblockModule,
        ComplectModule,
        SupplyModule,
        InfogroupModule,
        RegionModule,
        ContractModule,
        PackageModule,
    ],
})
export class GarantModule {}
