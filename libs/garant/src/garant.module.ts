import { Module } from '@nestjs/common';
import { InfoblockModule } from './infoblock';
import { ComplectModule } from './complect';
import { InfogroupModule } from './infogroup';
import { SupplyModule } from './supply';
import { PriceModule } from './price';
import { RegionModule } from './region';
import { ContractModule } from './contract';
import { PackageModule } from './package';

/**
 * Сервисный слой справочников Гаранта: цены, инфоблоки, комплекты, поставки,
 * группы, регионы, договоры, пакеты. Модуль подключают приложения, которым
 * нужны сервисы (konstructor, admin), поэтому ни один из его модулей не
 * регистрирует контроллеров. Ручки правки справочников живут в
 * `*AdminModule` каждого раздела и подключаются только в apps/admin под её
 * глобальным гардом (ai/rules/app-api-surface.md). Регистрацию контроллеров
 * в сервисном модуле ловит статическая проверка графа konstructor
 * (konstructor-di-graph.spec.ts) и тест libs/garant.
 */
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
