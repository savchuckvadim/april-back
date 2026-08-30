import { Module } from '@nestjs/common';
import { SideFlowGuardService } from './side-flow-guard.service';
import { SideFlowTaskBinderService } from './side-flow-task-binder.service';
import { SideFlowBaseDealResolver } from './side-flow-base-deal.resolver';

/**
 * Общее для сайд-очередей event-sales (презентации, ЗПР). Сегодня здесь
 * гейт повторной доставки, привязка элемента к задаче и дотяжка базовой
 * сделки по компании: у обеих очередей они одинаковы, и держать две копии
 * одного правила означало бы починить его однажды в одной из них.
 *
 * Ни один из сервисов не хранит инстанс Битрикса — он приходит аргументом
 * от вызывающего потока (правило CLAUDE.md про `this.bitrix`).
 *
 * AppCacheService приходит из глобального AppCacheServiceModule —
 * отдельного импорта не требует (как и в event-report).
 */
@Module({
    providers: [
        SideFlowGuardService,
        SideFlowTaskBinderService,
        SideFlowBaseDealResolver,
    ],
    exports: [
        SideFlowGuardService,
        SideFlowTaskBinderService,
        SideFlowBaseDealResolver,
    ],
})
export class SideFlowModule {}
