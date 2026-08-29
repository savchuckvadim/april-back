import { Module } from '@nestjs/common';
import { SideFlowGuardService } from './side-flow-guard.service';

/**
 * Общее для сайд-очередей event-sales (презентации, ЗПР). Сегодня здесь
 * только гейт повторной доставки: у обеих очередей он одинаковый, и
 * держать две копии одного правила означало бы починить его однажды в
 * одной из них.
 *
 * AppCacheService приходит из глобального AppCacheServiceModule —
 * отдельного импорта не требует (как и в event-report).
 */
@Module({
    providers: [SideFlowGuardService],
    exports: [SideFlowGuardService],
})
export class SideFlowModule {}
