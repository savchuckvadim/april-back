import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { KpiAirtimeController } from './controllers/kpi-airtime.controller';
import { AirtimeCacheController } from './controllers/airtime-cache.controller';
import { AirtimeCacheService } from './cache/airtime-cache.service';

/**
 * Эфирное время менеджеров (тег Swagger «Sales Airtime»): суммарная
 * длительность звонков по сотрудникам из voximplant.statistic.get,
 * с месячным кэшем прошлых периодов (см. README.md модуля).
 *
 * AirtimeStatisticUseCase создаётся per-domain через `new` в контроллере
 * (см. CLAUDE.md про race condition); AirtimeCacheService — @Injectable
 * без bitrix-состояния (AppCacheService приходит из глобального
 * AppCacheModule root-модуля).
 */
@Module({
    imports: [PBXModule],
    controllers: [KpiAirtimeController, AirtimeCacheController],
    providers: [AirtimeCacheService],
    exports: [AirtimeCacheService],
})
export class AirtimeModule {}
