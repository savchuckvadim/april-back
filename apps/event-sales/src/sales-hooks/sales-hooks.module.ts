import { Module } from '@nestjs/common';
import { SalesHookCoreModule } from './core/sales-hook-core.module';
import { LeadToWorkHookModule } from './lead-to-work/lead-to-work.module';
import { MergeDuplicatesHookModule } from './merge-duplicates/merge-duplicates.module';
import { TransferWorkHookModule } from './transfer-work/transfer-work.module';
import { RejectBufferHookModule } from './reject-buffer/reject-buffer.module';
import { ConvertNormalizerHookModule } from './convert-normalizer/convert-normalizer.module';
import { DuplicateCheckHookModule } from './duplicate-check/duplicate-check.module';

/**
 * Семейство sales-хуков: ядро (silence + очередь операций + статусы + WS)
 * и шесть хуков. Как добавить новый — см. SALES_HOOKS_GUIDE.md.
 */
@Module({
    imports: [
        SalesHookCoreModule,
        LeadToWorkHookModule,
        MergeDuplicatesHookModule,
        TransferWorkHookModule,
        RejectBufferHookModule,
        ConvertNormalizerHookModule,
        DuplicateCheckHookModule,
    ],
})
export class SalesHooksModule {}
