import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { KpiAirtimeController } from './controllers/kpi-airtime.controller';
import { AirtimeCacheController } from './controllers/airtime-cache.controller';
import { AirtimeCacheService } from './cache/airtime-cache.service';
import { AirtimeMarkerCacheService } from './cache/airtime-marker-cache.service';
import { AirtimeAssemblyService } from './services/airtime-assembly.service';
import { AirtimeDispatchService } from './services/airtime-dispatch.service';
import { AirtimeQueueProcessor } from './queue/airtime-queue.processor';

/**
 * Эфирное время менеджеров (тег Swagger «Sales Airtime»): суммарная
 * длительность звонков по сотрудникам из voximplant.statistic.get.
 *
 * Режим queue — месячные партиции по всему порталу: ячейки + маркеры в
 * AppCache, сбор в Bull-воркере (AirtimeQueueProcessor), доставка WS +
 * поллинг (ai/rules/heavy-endpoint-queue.md). Легаси sync-режим — расчёт
 * в HTTP-запросе (до перевода фронта).
 *
 * В providers только @Injectable без bitrix-состояния (правило CLAUDE.md
 * про race condition): коллекторы/AirtimeStatisticUseCase создаются
 * per-job/per-request через `new` с bitrix.api из pbx.init(domain).
 * AppCacheService приходит из глобального AppCacheModule root-модуля.
 */
@Module({
    imports: [PBXModule, QueueModule, WsModule],
    controllers: [KpiAirtimeController, AirtimeCacheController],
    providers: [
        AirtimeCacheService,
        AirtimeMarkerCacheService,
        AirtimeAssemblyService,
        AirtimeDispatchService,
        AirtimeQueueProcessor,
    ],
    exports: [AirtimeCacheService, AirtimeMarkerCacheService],
})
export class AirtimeModule {}
